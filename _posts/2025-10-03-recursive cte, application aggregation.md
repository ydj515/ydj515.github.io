---
title: Recursive CTE VS. Application Aggregation
description: 댓글 트리 조회 성능 비교 및 최종 선택
author: ydj515
date: 2025-10-03 11:33:00 +0800
categories: [msa, spring]
tags: [msa, spring, kafka, pagination, troubleshooting]
pin: true
math: true
mermaid: true
image:
  path: /assets/img/spring/logo.png
  lqip: data:image/webp;base64,UklGRpoAAABXRUJQVlA4WAoAAAAQAAAADwAABwAAQUxQSDIAAAARL0AmbZurmr57yyIiqE8oiG0bejIYEQTgqiDA9vqnsUSI6H+oAERp2HZ65qP/VIAWAFZQOCBCAAAA8AEAnQEqEAAIAAVAfCWkAALp8sF8rgRgAP7o9FDvMCkMde9PK7euH5M1m6VWoDXf2FkP3BqV0ZYbO6NA/VFIAAAA
  alt: spring
---

## 재귀 CTE vs 애플리케이션 집계

웹 애플리케이션에서 마주치는 '계층형 데이터 조회', 특히 '게시글별 상위 N개 댓글 트리 조회' 기능을 구현하며 고민했던 두 가지 접근 방식, **재귀 CTE(Common Table Expressions)**와 애플리케이션 레벨 집계를 비교 분석한 경험을 공유하고자 합니다.

## 요구사항

현재 mysql 8 이상, springboot를 사용중이며, "특정 게시글(post_id)에 달린 댓글 중, **총점(루트 댓글 + 모든 자손 댓글의 점수 합)**이 가장 높은 상위 3개의 댓글 트리를 조회"하는 것입니다.

테이블 스키마는 아래와 같습니다.

```sql
CREATE TABLE post_comment (
  id INT PRIMARY KEY,
  parent_id INT NULL,
  review VARCHAR(100) NOT NULL,
  created_on DATETIME NOT NULL,
  score INT NOT NULL,
  post_id INT NOT NULL,
  CONSTRAINT fk_parent
    FOREIGN KEY (parent_id) REFERENCES post_comment(id)
    ON DELETE CASCADE
);

-- 탐색 성능을 위해 인덱스 생성
CREATE INDEX ix_post_parent ON post_comment (post_id, parent_id);
```

이 문제를 해결하기 위해 Recursive CTE 방식과 Application Aggregation 방식에 대해 설명하고 실험하여 채택한 방법에 대해 설명합니다.

> mysql8, kotlin, springboot3.x기준으로 설명합니다. 전체 sample은 [github-sample](https://github.com/ydj515/sample-repository-example/tree/main/cte-example)를 참조해주세요.

## 1. Recursive CTE

첫 번째 방식은 MySQL 8.0 이상에서 지원하는 재귀 CTE와 윈도우 함수를 활용해 모든 계산과 필터링을 데이터베이스 내에서 끝내는 것입니다.

```sql
WITH RECURSIVE
post_comment_score (id, root_id, post_id, parent_id, review, created_on, score) AS (
  -- 1. 루트 댓글 (parent_id IS NULL)
  SELECT id, id AS root_id, post_id, parent_id, review, created_on, score
  FROM post_comment
  WHERE post_id = ?1 AND parent_id IS NULL -- ?1: 파라미터 바인딩

  UNION ALL

  -- 2. 자식 댓글을 재귀적으로 탐색
  SELECT pc.id, pcs.root_id, pc.post_id, pc.parent_id, pc.review, pc.created_on, pc.score
  FROM post_comment pc
  JOIN post_comment_score pcs
    ON pc.parent_id = pcs.id
),
total_score_comment AS (
  -- 3. 루트별 총점 합산 (윈도우 함수)
  SELECT
    id, parent_id, review, created_on, score, root_id,
    SUM(score) OVER (PARTITION BY root_id) AS total_score
  FROM post_comment_score
),
total_score_ranking AS (
  -- 4.  총점 기준 랭킹 계산 (윈도우 함수)
  SELECT
    id, parent_id, review, created_on, score, total_score,
    DENSE_RANK() OVER (ORDER BY total_score DESC) AS ranking
  FROM total_score_comment
)
-- 5. 상위 3개 트리만 추출
SELECT id, parent_id, review, created_on, score, total_score
FROM total_score_ranking
WHERE ranking <= 3
ORDER BY total_score DESC, id ASC;
```

- 장점:
  - 네트워크 효율성: DB가 모든 계산(재귀, 집계, 랭킹)을 수행한 뒤 정확히 필요한 데이터(상위 3개 트리)만 애플리케이션에 전송합니다. 데이터 양이 많을수록 압도적으로 유리합니다.
  - 데이터 일관성: 단일 쿼리(스냅샷) 내에서 모든 계산이 이루어지므로 데이터 일관성이 보장됩니다.
  - "DB가 잘하는 일": 집계, 필터링, 정렬은 관계형 데이터베이스의 핵심 기능입니다.

- 단점:
  - 쿼리가 복잡하고 길어져 유지보수가 어려울 수 있습니다.
  - DB(MySQL)의 CPU 자원을 상대적으로 많이 사용합니다.

## 2. Application Aggregation

DB에서는 특정 post_id에 해당하는 모든 댓글을 일단 조회한 뒤(Flat list), 애플리케이션(Kotlin/Spring) 메모리상에서 트리 구조를 조립하고 총점을 계산하여 필터링하는 방식입니다.

- pseudo code 

```kotlin
fun findTopCommentTreesWithAggregation(postId: Long, limit: Int): List<CommentNode> {
    // 1. DB에서 post_id에 해당하는 모든 댓글 조회
    val rows: List<CommentRow> = postCommentRepository.findAllRowsByPostId(postId)

    // 2. ID를 키로 하는 맵 생성 (트리 조립을 위해)
    val nodes = rows.associate {
        it.id to CommentNode(
            id = it.id,
            parentId = it.parentId,
            review = it.review,
            createdOn = it.createdOn,
            score = it.score
        )
    }

    // 3. 루트 노드 리스트
    val roots = mutableListOf<CommentNode>()

    // 4. O(n) 순회로 트리 조립
    nodes.values.forEach { node ->
        if (node.parentId == null) {
            roots.add(node) // 루트 노드 추가
        } else {
            // 자식 노드를 부모의 children 리스트에 추가
            nodes[node.parentId]?.children?.add(node)
        }
    }

    // 5. 총점 계산(lazy) 후 정렬 및 상위 N개 필터링
    return roots
        .sortedByDescending { it.totalScore } // 이 시점에 totalScore가 계산됨
        .take(limit)
}
```

- 장점:
  - DB 부하가 적습니다. (단순 SELECT ... WHERE post_id = ?)
  - 애플리케이션에서 비즈니스 로직을 제어하기 유연하며, 쿼리가 단순해집니다.
  - 조회한 전체 데이터를 캐싱하거나 다양한 형태로 가공하기 용이합니다.

- 단점:
  - 네트워크 비효율성: 댓글이 10,000개라면 10,000개 데이터를 모두 네트워크를 통해 전송받은 뒤, 애플리케이션에서 단 3개를 고르기 위해 버리게 됩니다.
  - 애플리케이션 메모리/CPU 사용: 데이터가 많을수록 애플리케이션 서버의 메모리와 CPU 사용량이 증가하며, GC 부담이 생길 수 있습니다.

## 부하테스트로 성능 비교해보기

저는 이 두 방식 중 어떤 방식을 사용할지 모킹한 데이터로 검증하기 위해 성능 테스트 환경을 구축했습니다.

> 자세한 사항은 [테스트 환경 관련 문서](https://github.com/ydj515/sample-repository-example/blob/main/cte-example/docs/CTE%20vs%20Aggregation%20Performance%20Experiment.md) 참조)

- 장비 : Mac M4, memroy : 24GB, SSD : 512GB
- 애플리케이션: Spring Boot 3, Kotlin, JPA
- 테스트 데이터: 10,000개의 댓글 더미 데이터를 생성하는 SQL 스크립트 활용
- 부하 테스트: k6를 사용해 CTE 엔드포인트와 Aggregation 엔드포인트에 동일한 시나리오(예: 2분간 VU 100까지 증가)로 부하 발생
- 모니터링: Actuator, Micrometer, Prometheus, Grafana를 연동하여 k6의 응답 시간(p95, p99)과 애플리케이션의 내부 지표(JVM, DB Connection Pool, GC)를 동시에 관찰

>이번 실험에서는 DB Connection Pool은 관찰하지 않았습니다.
{:.prompt-info}

### 1. CTE 방식 모니터링 결과
![image.png](/assets/img/cte/top-comment-trees-cte-k6.png)
![image.png](/assets/img/cte/top-comment-trees-cte-jvm.png)

### 2. Aggregation 방식 모니터링 결과

![image.png](/assets/img/cte/top-comment-trees-aggregation-k6.png)
![image.png](/assets/img/cte/top-comment-trees-aggregation-jvm.png)

### 결과 분석

우선 총 처리량에서 차이가 도드라졌습니다. CTE 적용방식이 2분 30초 기준 약 5,000건 정도 많이 처리했으며, Peak RPS 또한 50정도 높게 측정되었습니다.

그리고 HTTP Latency 또한 p99 기준 CTE가 424 ms, aggregation 방식이 768로 2배 가까이 차이났습니다.

## 방식 선택

데이터셋 크기(10,000개)와 부하 정도에 따라 결과는 달라질 수 있지만, 저의 **요구사항("상위 3개 트리 조회")**에 기반하여 저는 '재귀 CTE' 방식을 최종 선택했습니다.

선택 이유를 크게 4가지로 나눠보았습니다.

1. 문제의 본질 (Top-K): 저의 요구사항은 "전체 트리 조회"가 아니라 "Top-K 필터링"입니다. 이는 데이터를 가져와서 버리는(Aggregation) 방식보다, 필요한 데이터만 가져오는(CTE) 방식이 근본적으로 더 효율적입니다.

2. 네트워크 비용 무시 불가: 댓글이 1만 건일 때, Aggregation 방식은 1만 건의 데이터를 직렬화하고 네트워크로 전송받아 애플리케이션 메모리에 올립니다. CTE 방식은 상위 3개 트리에 해당하는 수십~수백 건의 데이터만 전송받습니다. 이 차이는 k6 테스트에서 응답 시간(p95)의 현격한 차이로 나타날 것입니다.

3. "DB가 잘하는 일" 신뢰: 필터링, 집계, 랭킹은 DB가 가장 잘하도록 최적화된 작업입니다. 복잡한 로직을 애플리케이션으로 가져오는 것은 DB의 부하를 줄일 순 있지만, 전체 시스템의 처리량(Throughput)과 응답 시간을 악화시킬 수 있습니다.

4. 애플리케이션 서버 보호: Aggregation 방식은 부하가 몰릴 경우 애플리케이션 서버의 힙 메모리 부족(OOM)이나 심각한 GC를 유발할 수 있습니다. 반면 CTE는 DB에 부하를 전가시키므로, 애플리케이션 서버는 안정적으로 유지될 수 있습니다. (물론 DB 튜닝은 필요합니다.)

물론, "게시글의 모든 댓글을 트리 구조 JSON으로 반환"하는 것이 요구사항이었다면, 저는 주저 없이 애플리케이션 집계 방식을 선택했을 것입니다. 이 경우 CTE는 불필요한 연산이며, 평면 조회(Flat select) 후 O(n)으로 조립하는 것이 가장 빠릅니다.

## 결론

DB 부하를 반드시 줄여야하는 쪽 보다는 "요구사항에 맞게 적절하게 처리해야한다."입니다.

저의 'Top-K' 요구사항에는 CTE가 가장 적합하였습니다.