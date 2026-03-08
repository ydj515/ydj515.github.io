---
title: MySQL 복제 방식, 무엇을 선택해야 할까(feat. semi-sync, group replication, galera, mmm)
description: MySQL 복제 방식과 COMMIT 처리 흐름, 그리고 운영 관점에서의 선택 기준 정리
author: ydj515
date: 2026-03-01 21:00:00 +0900
categories: [mysql]
tags: [mysql, replication, binlog, semi-sync, group replication, galera, mmm, troubleshooting]
pin: true
math: true
mermaid: true
image:
  path: /assets/img/mysql/logo.png
  lqip: data:image/webp;base64,UklGRpoAAABXRUJQVlA4WAoAAAAQAAAADwAABwAAQUxQSDIAAAARL0AmbZurmr57yyIiqE8oiG0bejIYEQTgqiDA9vqnsUSI6H+oAERp2HZ65qP/VIAWAFZQOCBCAAAA8AEAnQEqEAAIAAVAfCWkAALp8sF8rgRgAP7o9FDvMCkMde9PK7euH5M1m6VWoDXf2FkP3BqV0ZYbO6NA/VFIAAAA
  alt: mysql
---

## MySQL 복제를 볼 때 먼저 봐야 하는 것

MySQL 복제를 이야기할 때 많은 글이 `Master-Slave`, `Semi-Sync`, `Group Replication`, `Galera Cluster` 같은 키워드를 한 번에 나열합니다.  
그런데 실제 운영에서는 "무슨 기술을 쓰는가"보다 먼저, **애플리케이션이 COMMIT 성공을 받는 순간 무엇이 보장되는가**를 이해하는 것이 더 중요합니다.

결국 복제 기술은 아래 질문에 대한 답을 다르게 줄 뿐입니다.

- COMMIT 응답 시점에 데이터가 Source 내부에만 기록된 것인가?
- Replica가 적어도 하나 받았는가?
- 다수 노드가 합의했는가?
- 장애가 발생해도 유실 없이 승격 가능한가?
- 쓰기 지연을 얼마나 감수할 수 있는가?

이번 글에서는 MySQL의 기본 복제 구조와 COMMIT 처리 순서를 먼저 정리하고, 그 위에서 `Async Replication`, `Semi-Synchronous Replication`, `Group Replication`, `Galera Cluster`, `MMM`을 운영 관점에서 비교해보겠습니다.  
추가로 **요즘 신규 구축에서 어떤 조합이 더 자주 검토되는지**, 그리고 **CTO 관점에서 어떤 질문을 같이 봐야 하는지**까지 이어서 정리해보겠습니다.

참고로 이 글에서 MySQL 관련 "현재 기준"이라고 표현하는 내용은 **2026-03-02 시점에 확인한 MySQL 8.4 공식 문서 기준**입니다.  
MariaDB 관련 "현재 기준"이라고 표현하는 내용은 **2026-03-02 시점에 확인한 MariaDB 공식 문서와 MariaDB Server 11.4 / Galera Cluster 문서 기준**입니다.

## 먼저 결론부터: 요즘은 무엇을 많이 검토할까

요즘 MySQL HA를 새로 설계할 때는 예전처럼 `MMM` 같은 VIP 중심 도구부터 떠올리기보다, 대체로 아래 3가지 방향 중 하나로 갑니다.

### 1. 가장 흔한 기본형: 단일 Primary + Async 또는 Semi-Sync

여전히 가장 많이 보이는 기본 구조는 단일 Primary에 Replica를 붙이는 방식입니다.

- 구조가 단순함
- 애플리케이션이 이해하기 쉬움
- 읽기 확장이 쉬움
- 운영팀이 가장 익숙한 경우가 많음

여기서 정합성이 중요한 일부 트랜잭션만 `Semi-Sync` 로 보강하는 식의 절충안도 현실적으로 많이 선택됩니다.

### 2. MySQL 네이티브 HA를 원하면: Group Replication 기반 InnoDB Cluster

MySQL 공식 문서는 `InnoDB Cluster` 를 MySQL의 **complete high availability solution** 으로 설명합니다.  
즉, 요즘 MySQL 공식 생태계에서 "HA를 네이티브하게 가져가고 싶다"면 보통 `Group Replication` 단독보다 `InnoDB Cluster` 단위로 보는 편이 자연스럽습니다.

`InnoDB Cluster` 는 대략 다음 구성으로 이해하면 됩니다.

- `Group Replication`: 노드 간 복제와 멤버십 관리
- `MySQL Router`: 애플리케이션 연결 라우팅
- `AdminAPI / MySQL Shell`: 구성과 운영 자동화

즉, **요즘 Group Replication은 단독 기능이라기보다 InnoDB Cluster의 핵심 엔진으로 소비되는 경우가 많다**고 보는 편이 실무 감각에 더 가깝습니다.

### 3. 클라우드에서는: 직접 HA를 짜기보다 관리형 HA

직접 MySQL HA 토폴로지를 운영하지 않고, 관리형 서비스를 선택하는 경우도 많습니다.

예를 들어 AWS 공식 문서 기준으로는:

- `Amazon RDS Multi-AZ`: 다른 AZ에 동기식 standby를 두고 자동 failover
- `Aurora MySQL`: 클러스터 단위의 HA와 failover
- `RDS for MySQL + Group Replication`: 최근 버전에서 active-active 구성이 가능

즉, 클라우드 환경에서는 "내가 MMM/MHA/Orchestrator를 직접 붙여야 하나?"보다, **플랫폼이 제공하는 HA 기능으로 어디까지 해결할 수 있는가**를 먼저 검토하는 경우가 많습니다.

## MariaDB와 MySQL 8은 출발점이 조금 다르다

앞에서 복제 방식을 한꺼번에 나열했지만, 실제로는 `MariaDB` 와 `MySQL 8` 이 자주 검토하는 HA 방향이 조금 다릅니다.

- `MariaDB` 계열에서는 `Galera Cluster` 가 비교적 익숙한 클러스터형 HA 선택지입니다. 여기서의 설명은 **MariaDB Server 11.4 / Galera 공식 문서 기준**으로 이해하면 됩니다.
- `MySQL 8` 계열에서는 `Group Replication` 이 더 현대적인 기본 축이고, 실무에서는 이를 `InnoDB Cluster` 로 묶어 보는 경우가 많습니다.
- 두 제품 모두 기술적으로는 multi-primary, 즉 이른바 `master-master` 에 가까운 구성이 가능하지만, 실무에서 정말 많이 쓰이는 형태는 아닙니다.
- 대부분의 팀이 원하는 것은 여러 노드에서 동시에 쓰는 구조보다, **한 노드가 죽어도 빠르게 복구되는 HA** 입니다.

즉, 둘 다 "멀티 라이터가 가능하다"는 공통점은 있지만, **실제로 많이 쓰이는 운영 모델은 멀티 라이터 그 자체보다 안정적인 HA 구성**에 더 가깝습니다.

## MariaDB vs MySQL 8 한눈에 보기

| 관점 | MariaDB | MySQL 8 |
|------|---------|---------|
| 실무에서 자주 같이 언급되는 HA 축 | `Galera Cluster`, Async Replication | `Group Replication`, `InnoDB Cluster`, Async/Semi-Sync |
| 공식/생태계 관점의 현대적 HA 방향 | Galera 기반 클러스터 운영이 익숙한 편 | Group Replication + Router + AdminAPI를 포함한 InnoDB Cluster |
| multi-primary(멀티 라이터) 지원 | 가능. Galera가 대표적 | 가능. Group Replication multi-primary 모드 존재 |
| 하지만 실제로 더 흔한 운영 형태 | HA 목적의 클러스터 또는 단일 write 중심 운영 | 단일 Primary 중심 HA, 필요 시 Semi-Sync 또는 InnoDB Cluster |
| 왜 이렇게 가는가 | MariaDB 생태계에서 Galera의 존재감이 큼 | MySQL 8 공식 스택이 Group Replication/InnoDB Cluster 중심으로 발전 |
| 실무에서 더 자주 나오는 요구 | "죽지 않는 MariaDB HA" | "운영 가능한 MySQL HA" |

이 표에서 중요한 포인트는 하나입니다.  
`master-master` 나 `multi-primary` 를 지원하느냐보다, **그 기능을 실제 서비스의 기본 운영 모델로 삼는가**는 완전히 다른 문제입니다.

## 지금 시점의 현실 감각으로 정리하면

위 표를 실무 감각으로 다시 풀면 결론은 비교적 단순합니다.

- `MariaDB` 계열에서는 `Galera Cluster` 가 여전히 자연스러운 HA 선택지입니다.
- `MySQL 8` 계열에서는 `Group Replication` 보다는 실제 운영 스택인 `InnoDB Cluster` 로 이해하는 편이 더 현실적입니다.
- 두 제품 모두 multi-primary 구성이 가능하지만, `master-master` 가 기본 선택지는 아닙니다.
- 대부분의 팀이 진짜로 원하는 것은 멀티 라이터보다 **빠르게 복구되는 HA** 입니다.

즉, 이 글에서 `Galera` 와 `Group Replication` 을 비교할 때도 핵심은 "누가 더 멀티 마스터에 가깝나"가 아니라, **어떤 생태계에서 어떤 HA 모델을 더 자연스럽게 운영할 수 있느냐**입니다.

## 어떤 방식을 고를지 결정하기 전에 봐야 할 질문

복제 방식을 비교하기 전에 아래 질문부터 정리하면 글의 나머지 내용이 훨씬 쉽게 읽힙니다.

1. **RPO를 얼마나 허용할 수 있는가**
2. **RTO를 몇 초/몇 분까지 허용할 수 있는가**
3. **애플리케이션이 failover를 얼마나 잘 흡수할 수 있는가**
4. **운영팀이 직접 라우팅, 승격, fencing을 관리할 수 있는가**
5. **멀티 리전/멀티 AZ까지 필요한가**

> RPO(Recovery Point Objective): 장애 발생 시 허용 가능한 최대 데이터 손실량  
> RTO(Recovery Time Objective): 장애 발생 시 복구 목표 시간  
> fencing: 장애 발생 시 Primary 서버를 강제로 차단하여 Split-Brain을 방지하는 기술
{: .prompt-info }

같은 MySQL이라도 이 질문에 대한 답이 다르면 선택지는 완전히 달라집니다.

## Binlog 저장 방식은 간단히만 보고 넘어가자

MySQL 복제의 핵심은 `binlog(binary log)` 입니다.  
Source에서 발생한 변경 사항이 binlog에 기록되고, Replica는 이를 전달받아 재생합니다.

binlog 포맷은 크게 아래 3가지로 나뉩니다.

- `STATEMENT`: 실행한 SQL 문 자체를 기록
- `ROW`: 실제 변경된 row 결과를 기록
- `MIXED`: 상황에 따라 Statement와 Row를 자동 전환

실무에서는 복제 일관성 관점에서 `ROW`를 기본으로 보는 경우가 많습니다.

`INSERT ... SELECT` 가 Statement 모드에서는 SQL 자체로 기록되고, Row 모드에서는 실제 삽입된 row 결과로 기록된다는 점도 복제 일관성에 영향을 줍니다.


> binlog 포맷 차이, 비결정적 함수 문제, `INSERT ... SELECT` 의 기록 방식 같은 자세한 내용은 기존 글인 [MySQL에서 binary log와 복제](https://ydj515.github.io/posts/mysql-binlog-replication/) 를 참고하시면 됩니다.
{: .prompt-info }

## MySQL COMMIT 내부 흐름도 핵심만 보자

애플리케이션이 `COMMIT` 을 호출하면 MySQL 내부에서는 대략 아래 순서로 진행됩니다.

1. 트랜잭션 실행
2. InnoDB redo log에 기록 (`prepare`)
3. binlog 기록
4. binlog fsync
5. InnoDB commit 완료
6. 클라이언트에 COMMIT 성공 반환

핵심은 **COMMIT 성공이 Source 내부의 로그 반영 완료를 의미할 수는 있어도, Replica 수신까지 보장하지는 않는다**는 점입니다.

> redo log와 binlog의 관계, COMMIT 순서에 대한 자세한 설명은 [MySQL에서 binary log와 복제](https://ydj515.github.io/posts/mysql-binlog-replication/) 를 참고하시면 됩니다.
{: .prompt-info }

## Async Replication의 구조적 한계

기본적인 MySQL Replication은 비동기(async) 방식입니다.

예를 들어 아래와 같은 상황을 생각해볼 수 있습니다.

- Source binlog position: `110`
- Replica replay position: `100`

이 상태는 Source에서는 `101 ~ 110` 트랜잭션까지 COMMIT이 끝났지만, Replica는 아직 `100`까지만 반영했다는 뜻입니다.

만약 이 시점에 Source 장애가 발생하면 어떻게 될까요?

- 애플리케이션은 이미 `101 ~ 110`에 대해 COMMIT 성공을 받음
- 그러나 Replica는 아직 해당 트랜잭션을 받지 못했거나 적용하지 못함
- Replica를 승격하면 `101 ~ 110` 구간이 유실될 수 있음

이것이 Async Replication의 대표적인 문제입니다.  
즉, **COMMIT 성공과 장애 복구 후 데이터 보존은 별개의 문제**입니다.

## Semi-Synchronous Replication은 무엇을 보완할까

Semi-Sync는 Source가 COMMIT 성공을 즉시 돌려주지 않고, **최소 1대 Replica가 binlog 이벤트를 수신했다는 ACK를 받을 때까지 대기**하는 방식입니다.

흐름은 아래처럼 볼 수 있습니다.

1. Source가 binlog 기록
2. Replica로 이벤트 전송
3. 최소 1대 Replica가 수신 후 ACK 응답
4. Source가 COMMIT 성공 반환

즉,

> 애플리케이션은 적어도 "어느 한 Replica가 이 트랜잭션을 받았다"는 조건이 충족된 뒤에야 COMMIT 성공을 받습니다.

이 구조 덕분에 Async보다 데이터 유실 가능성을 줄일 수 있습니다.

### 그런데 왜 Semi-Sync도 완전 무손실은 아닐까

Semi-Sync는 분명 Async보다 안전하지만, 절대적인 무손실 보장은 아닙니다.

이유는 다음과 같습니다.

1. Replica가 메모리 수신 후 ACK를 보내고 바로 장애 날 수 있습니다.
2. ACK를 보낸 Replica 한 대만 믿고 있었는데 그 노드가 사라질 수 있습니다.
3. `rpl_semi_sync_master_timeout` 초과 시 Async로 fallback 될 수 있습니다.
4. 일반적으로 apply 완료까지가 아니라 receive 완료까지를 보장합니다.

즉 Semi-Sync는 **RPO를 줄이는 기술**이지, 언제나 `RPO=0` 을 보장하는 기술은 아닙니다.

## 운영 경험처럼 보면 이해가 쉬운 시나리오

추상적인 설명보다 운영 상황으로 보는 편이 훨씬 이해가 쉽습니다.

### 시나리오 1. 주문 서비스는 COMMIT 성공을 받았는데 장애 직후 주문이 사라졌다

쇼핑몰 주문 서비스가 MySQL Source에 주문 정보를 기록하고, 애플리케이션은 COMMIT 성공 응답을 받았습니다.

그런데 그 직후 Source 서버가 장애가 났고, Replica를 승격했습니다.  
문제는 Replica가 아직 해당 주문 binlog를 받지 못한 상태였다는 점입니다.

결과는 다음과 같습니다.

- 사용자 화면에는 주문 완료로 보임
- 결제 연동은 이미 진행됨
- 그러나 승격된 DB에는 주문 row가 없음
- 운영자는 애플리케이션 로그, 결제 로그, 메시지 로그를 뒤져 수기 복구해야 함

이런 종류의 사고는 Async 환경에서 충분히 발생할 수 있습니다.

### 시나리오 2. 통계 적재는 조금 유실돼도 괜찮다

광고 클릭 로그나 추천 피드 학습용 이벤트처럼, 일부 유실이 서비스 정합성에 치명적이지 않은 데이터가 있습니다.

이 경우에는 다음이 더 중요합니다.

- 높은 처리량
- 낮은 쓰기 지연
- 단순한 운영 구조

이런 워크로드까지 전부 Semi-Sync나 Group Replication으로 처리하면 비용 대비 효과가 좋지 않을 수 있습니다.

### 시나리오 3. 결제 승인과 재고 차감은 유실되면 안 된다

반대로 결제 승인, 포인트 차감, 재고 감소 같은 데이터는 유실 시 후폭풍이 큽니다.

- 사용자는 결제 성공을 봤는데 주문이 없음
- 재고 차감이 날아가면 초과 판매 발생
- 포인트 차감/환불 상태가 꼬이면 CS 비용이 급증

이런 경우에는 최소한 Semi-Sync, 더 강한 정합성이 필요하면 Group Replication 계열까지 고려해야 합니다.

## Semi-Sync는 어떤 단위로 동작할까

여기서 한 가지를 분명히 해야 합니다.  
2026-03-02 시점에 확인한 **MySQL 8.4 공식 문서 기준**으로 semi-sync의 enable 설정은 **세션 단위가 아니라 Global 단위**로 보는 것이 맞습니다.

즉, 애플리케이션 커넥션마다 아래처럼 `SET SESSION ...` 을 줘서 어떤 커넥션은 semi-sync, 어떤 커넥션은 async로 나누는 식의 설명은 **MySQL 8.4 공식 문서 기준**으로는 맞지 않습니다.

핵심은 이렇게 이해하면 됩니다.

- **설정 단위**: MySQL Source 인스턴스 전체(`Global`)
- **대기 시점**: 각 트랜잭션의 `COMMIT` 시점
- **판단 기준**: Source에서 semi-sync가 활성화되어 있으면, 그 Source에서 수행되는 commit이 ACK 대기 대상이 됨
- **적용 범위**: 특정 커넥션만 선택 적용하는 방식이 아니라, 해당 Source에서 처리되는 쓰기 전체에 영향

즉, "단위"를 나눠서 보면:

- 설정은 `인스턴스 단위`
- ACK 대기는 `트랜잭션 커밋 단위`
- 애플리케이션에서 선택 가능한 범위는 기본적으로 `커넥션 단위가 아님`

이 차이를 헷갈리면 설계가 쉽게 틀어집니다.

> Semi-Sync는 "어떤 트랜잭션의 COMMIT에서 기다릴 것인가"라는 동작을 보이지만, 그 정책 자체를 애플리케이션 세션별로 켜고 끄는 기능으로 이해하면 안 됩니다.

## 이제 다른 방식들과 비교해보자

여기서부터는 흔히 같이 언급되는 `Group Replication`, `Galera Cluster`, `MMM`까지 포함해 비교해보겠습니다.

## 1. Async Replication

가장 전통적인 Source-Replica 구조입니다.

- Source COMMIT 후 Replica가 뒤따라감
- 구조가 단순함
- 읽기 부하 분산에 적합
- failover 시점에 미복제 구간 유실 가능

### 장점

- 가장 단순하고 이해하기 쉬운 구조입니다.
- 쓰기 성능 저하가 상대적으로 적습니다.
- 읽기 Replica를 여러 대 붙이기 쉽습니다.
- 장애 복구 전략을 애플리케이션과 운영 절차로 분리하기 좋습니다.

### 단점

- 구조적으로 데이터 유실 가능성이 남습니다.
- failover 시 최종 복제 위치 판단이 중요합니다.
- 읽기 지연 때문에 read-after-write 문제가 발생할 수 있습니다.
- 운영자가 "어느 Replica를 승격해야 안전한가"를 항상 신경 써야 합니다.

### 적합한 경우

- 로그/통계성 데이터
- 읽기 스케일아웃이 중요한 서비스
- RPO를 어느 정도 허용 가능한 환경

## 2. Semi-Synchronous Replication

Async 구조를 유지하면서도, 적어도 한 대의 Replica가 수신했는지 확인하고 COMMIT을 반환하는 방식입니다.

- Async보다 안전함
- 기존 MySQL 복제 구조와 궁합이 좋음
- 쓰기 지연이 늘어남
- timeout 시 Async fallback 가능

### 장점

- Async보다 RPO를 줄이기 쉽습니다.
- 기존 단일 Primary 구조를 유지할 수 있습니다.
- 모든 트랜잭션이 아니라 일부 핵심 트랜잭션만 선택적으로 강화하기 좋습니다.
- 애플리케이션 관점에서는 기존 MySQL 사용 방식을 크게 바꾸지 않아도 됩니다.

### 단점

- 완전 무손실은 아닙니다.
- 네트워크 지연과 Replica 상태에 따라 commit latency가 증가합니다.
- timeout fallback 상황을 모니터링하지 않으면 "Semi-Sync를 쓰고 있으니 안전하다"는 착시가 생길 수 있습니다.
- ACK 기준과 실제 durable/applied 상태를 혼동하면 설계가 틀어질 수 있습니다.

### 적합한 경우

- 일부 핵심 트랜잭션의 유실 확률을 줄이고 싶은 서비스
- 운영 구조는 단순하게 유지하고 싶은 환경
- 완전한 다중 합의까지는 필요하지 않은 시스템

## 3. Group Replication

MySQL Group Replication은 여러 노드가 그룹을 이루고, 트랜잭션 충돌 감지와 멤버십 관리를 통해 더 강한 일관성을 제공하는 방식입니다.

- 단일 Primary 모드 또는 Multi-Primary 모드 지원
- 트랜잭션이 그룹 차원의 검증을 거침
- 장애 감지와 멤버 관리가 내장됨
- Async/Semi-Sync보다 운영 복잡도와 쓰기 지연이 증가

쉽게 말하면, 단순히 "binlog를 뒤에서 따라가는 Replica"보다 **합의 기반에 더 가까운 복제**를 제공합니다.

현재 `MySQL 8.4` 공식 문서 기준에서는 이 방식이 MySQL의 공식 HA 방향에 더 가깝습니다.  
실제로는 `Group Replication` 기능 하나만 따로 떼어 보기보다, `InnoDB Cluster` 로 묶어서 보는 편이 더 현대적인 접근입니다.

### 장점

- 단순 복제보다 강한 정합성과 자동화된 멤버 관리가 가능합니다.
- 단일 Primary 모드에서는 운영 모델을 비교적 단순하게 유지하면서도 HA 수준을 높일 수 있습니다.
- InnoDB Cluster와 결합하면 Router, AdminAPI까지 포함한 공식 운영 스택을 사용할 수 있습니다.

### 단점

- Async/Semi-Sync보다 구조 이해와 운영 난이도가 높습니다.
- 네트워크 지연과 노드 품질에 민감합니다.
- Multi-Primary는 듣기보다 실전 난도가 높습니다. 실제로는 단일 Primary 모드로 운영하는 편이 더 많습니다.
- 장애 대응이 "복제만 알면 되는 문제"가 아니라 클러스터 상태 해석 문제로 바뀝니다.

### 운영 시나리오

여러 AZ에 노드를 두고, 특정 노드 장애가 나더라도 빠르게 서비스 지속성을 확보하고 싶은 경우 Group Replication이 후보가 됩니다.  
다만 네트워크 지연이 커질수록 쓰기 성능과 안정적 운영 난이도를 같이 봐야 합니다.

### 적합한 경우

- 자동 장애 조치와 높은 정합성을 함께 원하는 서비스
- 운영팀이 MySQL HA 토폴로지를 적극적으로 관리할 수 있는 환경
- 단순 Replica 승격 이상의 안정성을 원하는 시스템

## 4. Galera Cluster

Galera Cluster는 MySQL 계열에서 흔히 언급되는 거의 동기식에 가까운 클러스터 방식입니다.  
보통 `MariaDB Galera Cluster`, `Percona XtraDB Cluster` 같은 형태로 접하게 됩니다.

특히 MariaDB 계열에서는 지금도 Galera가 꽤 자연스러운 HA 선택지로 받아들여집니다. 이 설명 역시 **2026-03-02 시점에 확인한 MariaDB Server 11.4 / Galera 공식 문서 기준**입니다.  
즉, "MariaDB에서 클러스터형 HA를 본다"면 많은 경우 Galera가 먼저 비교 대상에 올라옵니다.

특징은 다음과 같습니다.

- 사실상 write-set replication 기반
- 다수 노드가 트랜잭션 인증 과정을 거침
- Multi-Primary 구성이 가능
- 노드 간 네트워크 품질과 지연에 민감함
- 쓰기 충돌이 많은 워크로드에서는 체감 복잡도가 높아짐

### 장점

- 멀티 프라이머리 구조를 비교적 자연스럽게 제공할 수 있습니다.
- 노드 장애 시에도 클러스터 단위로 계속 서비스하기 좋은 모델입니다.
- MariaDB/Percona 계열 운영 경험이 있는 팀에는 익숙할 수 있습니다.

### 단점

- 쓰기 충돌이 많은 워크로드에서 재시도 비용이 커집니다.
- quorum, split brain, flow control 같은 분산 시스템 이슈를 제대로 이해해야 합니다.
- RTT와 네트워크 품질의 영향을 많이 받습니다.
- "멀티 마스터면 더 좋다"는 기대와 달리, 애플리케이션 설계 복잡도가 오히려 증가할 수 있습니다.

### 운영 시나리오

여러 노드에 동시에 쓰기를 허용하고 싶어서 Galera를 도입했는데, 실제로는 동일 row나 동일 계정 데이터를 자주 갱신하는 서비스라면 certification conflict가 자주 발생할 수 있습니다.

예를 들어 다음과 같은 상황입니다.

- 주문 상태를 여러 앱 서버가 동시에 갱신
- 같은 고객의 포인트를 서로 다른 노드에서 동시에 수정
- 재고 row를 여러 노드에서 동시에 UPDATE

이 경우 "멀티 마스터니까 더 좋아 보인다"는 기대와 달리, 충돌 재시도와 지연 때문에 오히려 애플리케이션 설계 부담이 커질 수 있습니다.

### 적합한 경우

- 노드 간 쓰기 충돌이 많지 않은 구조
- 다중 노드 쓰기 허용이 정말 필요한 환경
- 운영팀이 클러스터 상태와 quorum, flow control을 이해하고 관리할 수 있는 경우

## 5. MMM

MMM은 `Master Master Replication Manager for MySQL` 로, 과거에 MySQL 복제와 VIP 전환을 관리하기 위해 사용되던 도구입니다.

핵심은 "새로운 복제 방식"이라기보다, **전통적인 MySQL replication 위에 failover 운영을 얹는 관리 도구**에 가깝습니다.

특징은 다음과 같습니다.

- MySQL 자체의 복제 보장을 바꾸지는 않음
- VIP 이동과 역할 전환 자동화를 도와줌
- 구조가 오래되었고 현재 기준으로는 레거시 성격이 강함
- 새로운 구축에서는 보통 더 현대적인 HA 구성이나 오케스트레이션 대안을 먼저 검토함

즉 MMM은 `Galera`나 `Group Replication`처럼 복제 메커니즘 자체를 바꾸는 기술과는 결이 다릅니다.

### 장점

- 예전 단일 Primary + Replica 환경에서는 도입 개념이 비교적 단순했습니다.
- VIP 이동 기반으로 애플리케이션 접속점을 유지하기 쉬웠습니다.
- MySQL 자체 복제 방식을 크게 바꾸지 않고 failover 자동화를 얹을 수 있었습니다.

### 단점

- VIP, 역할 전환, fencing 같은 운영 절차가 강하게 묶여 있습니다.
- 복제 지연이나 비동기 유실 문제를 해결하지 못합니다.
- 현재 기준으로는 생태계와 운영 사례가 많이 줄었습니다.
- 신규 구축에서 더 나은 대안이 많습니다.

### 운영 시나리오

과거 방식의 Active/Standby 구조에서는 VIP를 어느 서버로 붙일지, 어느 Replica를 승격할지 자동화하는 것만으로도 운영 난이도가 크게 내려갔습니다.  
하지만 복제 자체가 Async였다면, VIP 전환이 아무리 빨라도 **마지막 트랜잭션 유실 가능성**은 별도로 남아 있습니다.

즉 MMM은 운영 자동화에는 도움을 주지만, 복제 일관성 문제를 해결해주지는 않습니다.

## MMM은 왜 지금은 잘 안 쓰일까

정리해서 말하면, `MMM`은 "예전에는 의미가 있었지만 지금 신규 구축의 1순위는 아닌 도구"에 가깝습니다.

이유는 크게 4가지입니다.

### 1. 복제의 본질적 한계를 해결하지 못함

MMM은 failover 자동화 도구이지, 복제 일관성을 높여주는 기술은 아닙니다.  
즉 Async 기반이면 Async의 한계를 그대로 안고 갑니다.

### 2. VIP 중심 운영 모델이 현대 환경과 덜 맞음

예전에는 VIP 전환이 단순하고 강력한 해법이었지만, 지금은 다음 요소가 더 중요합니다.

- 오토스케일 환경
- 컨테이너/오케스트레이션 환경
- 클라우드 네트워크 제약
- 프록시/라우터 계층 활용

즉 "IP를 옮기면 된다"보다 **애플리케이션 연결을 어떻게 유연하게 우회시킬 것인가**가 더 중요해졌습니다.

### 3. 공식 네이티브 대안이 강해짐

예전에는 MySQL 자체가 제공하는 HA 선택지가 지금보다 제한적이었지만, 현재는 `Group Replication`, `InnoDB Cluster`, `MySQL Router` 같은 공식 스택이 존재합니다.

### 4. 운영 자동화 대안이 많아짐

현재 단일 Primary 복제 구조를 계속 쓴다고 해도, MMM 외에 더 자주 검토되는 대안이 있습니다.

- `Orchestrator` 계열: topology 관찰과 failover 자동화
- `MHA`: 전통적인 MySQL failover 관리 도구
- `ProxySQL`, `HAProxy`, `MySQL Router`: 연결 라우팅 계층
- 클라우드 관리형 HA: RDS Multi-AZ, Aurora 같은 플랫폼 기능

즉, **지금은 복제, 승격, 라우팅을 하나의 오래된 도구에 묶기보다 역할별로 나누는 쪽이 더 일반적**입니다.

## 그래서 요즘 MMM 대신 무엇을 많이 보나

### 1. 가장 현실적인 대안: Async/Semi-Sync + Failover Manager

단일 Primary 구조를 유지하면서도 운영 자동화를 붙이는 방식입니다.

- 복제: `Async` 또는 `Semi-Sync`
- 승격 자동화: `Orchestrator` 계열 또는 `MHA`
- 라우팅: `ProxySQL`, `HAProxy`, 애플리케이션 레벨 재시도

이 방식은 기존 MySQL 운용 경험을 많이 재사용할 수 있다는 장점이 있습니다.

다만 여기서도 세대 차이는 있습니다.

- `Orchestrator` 는 오랫동안 널리 쓰였지만, 원 프로젝트는 2025년 2월 archived 상태가 되었고 maintainer는 `Percona Orchestrator` 로 이동을 안내하고 있습니다.
- `MHA` 는 여전히 전통적인 선택지로 거론되지만, 현대적인 운영 자동화 체계 안에서는 프록시/라우터 계층과 함께 재평가하는 경우가 많습니다.

즉 "예전부터 쓰던 도구"를 그대로 답습하기보다, **현재 유지되고 있는 구현체와 운영 모델을 확인하는 것**이 중요합니다.

### 2. MySQL 공식 스택을 선호하면: InnoDB Cluster

공식 문서 기준으로는 Group Replication에 Router와 AdminAPI를 포함한 `InnoDB Cluster` 가 네이티브 HA의 중심입니다.

이 방식은 다음 팀에 잘 맞습니다.

- MySQL 공식 생태계를 선호하는 팀
- 수작업 failover보다 표준화된 HA 구성을 원하는 팀
- Router까지 포함한 연결 관리 체계를 가져가고 싶은 팀

### 3. 관리형 서비스를 우선하면: 클라우드 HA

클라우드에서는 DB HA를 직접 구현하는 대신, 관리형 서비스를 우선 검토하는 경우가 많습니다.

- 운영 부담 감소
- failover 자동화 내장
- 백업/복구/모니터링 통합

대신 플랫폼 종속성과 비용 구조까지 같이 봐야 합니다.

## 한 번에 비교하면 이렇게 볼 수 있다

| 방식 | COMMIT 응답 시점 보장 | RPO 관점 | 쓰기 성능 | 운영 복잡도 | 특징 |
|------|----------------------|----------|-----------|-------------|------|
| Async Replication | Source 내부 커밋 완료 | 상대적으로 큼 | 가장 빠름 | 낮음 | 가장 단순한 기본 구조 |
| Semi-Sync | 최소 1대 Replica 수신 ACK | 작아짐, 0은 아님 | 약간 느림 | 낮음~중간 | 기존 구조 유지하며 안전성 향상 |
| Group Replication | 그룹 차원의 검증/합의 반영 | 매우 작음 | 더 느림 | 높음 | HA와 정합성을 함께 추구 |
| Galera Cluster | 사실상 거의 동기식에 가까운 노드 인증 | 매우 작음 | 워크로드 따라 편차 큼 | 높음 | 멀티 프라이머리 가능 |
| MMM | 복제 보장 자체는 바뀌지 않음 | 기반 복제 방식에 의존 | 기반 복제 방식에 의존 | 중간 | 예전 세대의 failover 관리 도구 |

## 무엇을 선택해야 할까

정답은 "무조건 최신 기술"이 아니라, **업무 성격과 장애 허용 범위**에 따라 달라집니다.

짧게 정리하면 다음과 같습니다.

- 일부 유실을 허용하고 단순한 운영이 중요하면 `Async Replication`
- 핵심 쓰기의 안정성만 더 높이고 싶으면 `Async + Semi-Sync`
- MySQL 8 기반의 공식 HA 스택을 원하면 `InnoDB Cluster`
- MariaDB/Percona 계열 클러스터 운영 경험이 있다면 `Galera Cluster`
- `MMM` 은 신규 구축의 1순위라기보다 과거 운영 방식의 맥락에서 이해하는 편이 맞습니다.

## CTO 관점에서 빠지기 쉬운 질문

기술 비교 글은 보통 "어떤 방식이 더 안전한가"에서 끝나기 쉽습니다.  
하지만 실제 의사결정에서는 아래 질문이 빠지면 안 됩니다.

### 1. 복제 방식보다 장애 전환 절차가 더 중요하지 않은가

DB 복제가 좋아도, 애플리케이션 연결 문자열, 프록시 전환, 캐시 무효화, 읽기/쓰기 라우팅이 정리되지 않으면 실제 장애 복구 시간은 길어집니다.

즉 CTO 관점에서는 단순히 "RPO가 몇이냐"보다 아래를 같이 봐야 합니다.

- 누가 Primary 승격을 판단하는가
- 애플리케이션은 언제 새 Primary를 바라보는가
- 읽기 Replica는 언제 다시 안전하게 붙는가
- 장애 전환 중 중복 처리나 재시도는 어떻게 할 것인가

### 2. cross-region DR은 별도 문제 아닌가

같은 리전, 같은 AZ, 같은 클러스터 안에서의 HA와 **재해 복구(DR)** 는 다른 문제입니다.

- Group Replication이나 Galera가 있어도 장거리 네트워크 지연은 별도 고려가 필요합니다.
- 클러스터 내부 고가용성과 지역 단위 장애 대응은 같은 설계가 아닙니다.
- 백업과 binlog 보관 정책이 없으면 DR 목표를 달성하기 어렵습니다.

### 3. 읽기 일관성 요구사항을 따로 정의했는가

복제 글은 대부분 쓰기 정합성만 이야기하지만, 서비스에서는 `read-after-write consistency` 가 더 체감되는 경우가 많습니다.

예를 들면:

- 주문 직후 주문 조회
- 결제 직후 상태 조회
- 포인트 차감 직후 잔액 조회

이런 기능을 Replica에서 읽으면 사용자 입장에서는 "방금 성공했다고 했는데 왜 안 보이지?" 문제가 발생합니다.

즉 CTO 관점에서는 **쓰기 복제 전략** 뿐 아니라 **읽기 라우팅 정책** 도 같이 설계해야 합니다.

### 4. 장애보다 평상시 운영 비용이 더 큰 문제 아닌가

실무에서는 장애가 매일 나지는 않지만, 운영 복잡도는 매일 비용이 됩니다.

- 노드 추가/교체가 쉬운가
- 버전 업그레이드가 쉬운가
- 스키마 변경이 안전한가
- 관측 지표가 명확한가
- 온콜 엔지니어가 문제를 해석할 수 있는가

즉 CTO는 최고 수준의 정합성만 볼 게 아니라, **팀이 지속적으로 감당 가능한 운영 모델인가**를 같이 봐야 합니다.

## 운영 시 꼭 같이 봐야 하는 체크리스트

복제 방식과 별개로 아래 항목은 반드시 같이 설계하는 것이 좋습니다.

- `RPO`, `RTO` 목표 수치 명시
- failover 절차 문서화 및 정기 리허설
- Replica lag, semi-sync fallback, cluster quorum 모니터링
- 백업, binlog 보관, point-in-time recovery 검증
- 애플리케이션의 read/write 분리 정책
- 스키마 변경 도구와 롤백 절차
- 프록시 또는 라우터 계층의 장애 처리 방식

## Spring 애플리케이션에서는 어떻게 적용할까

운영 현실에서는 "DB 토폴로지"보다 "업무별로 어떤 쓰기 정책을 적용할 것인가"가 더 중요합니다.

다만 여기서 주의할 점이 있습니다.  
앞에서 설명했듯이 semi-sync enable 자체는 **MySQL 8.4 공식 문서 기준**으로 `세션 변수`처럼 커넥션마다 나눠 켜는 개념으로 보기 어렵습니다.

즉, 같은 Source 인스턴스를 바라보는 상황에서 아래처럼 DataSource 두 개를 나누더라도:

- `asyncWriteDataSource`
- `semiSyncWriteDataSource`

**둘이 같은 MySQL Source를 보고 있다면**, DataSource를 둘로 쪼갠 것만으로 semi-sync와 async가 갈리지는 않습니다.  
semi-sync는 커넥션 풀이 아니라 **Source 인스턴스의 글로벌 복제 정책**으로 동작하기 때문입니다.

### 1. 인식 단위부터 정확히 보자

- 애플리케이션 단위: `DataSource`, `TransactionManager`, `@Transactional`
- DB 복제 정책 단위: MySQL `Source 인스턴스`
- ACK 대기 발생 단위: 각 `트랜잭션의 COMMIT`

즉 Spring 입장에서는 트랜잭션이 `@Transactional` 로 묶여 commit 되더라도, 그 commit이 semi-sync ACK를 기다릴지는 **해당 트랜잭션이 어느 Source 인스턴스로 갔는가**에 의해 결정됩니다.

### 2. 같은 DB에 DataSource만 둘로 나누는 것은 한계가 있다

예를 들어 다음처럼 구성해도:

- `asyncWriteDataSource` -> `db-primary-1`
- `semiSyncWriteDataSource` -> `db-primary-1`

두 DataSource가 결국 같은 Source를 바라본다면, 실제 semi-sync 여부는 둘 다 동일합니다.

여기서 DataSource 분리는 아래 목적에는 의미가 있을 수 있습니다.

- SQL timeout 정책
- 커넥션 풀 크기
- 라우팅 목적
- 모니터링/태깅 목적

하지만 **semi-sync 정책 자체를 커넥션별로 바꾸는 수단은 아닙니다.**

### 3. 정말 업무별로 다르게 가져가고 싶다면

업무 중요도에 따라 async와 semi-sync를 다르게 적용하고 싶다면, 보통은 **서로 다른 쓰기 토폴로지**를 바라보게 해야 합니다.

예를 들면:

- `asyncWriteDataSource` -> Async 기반 Primary
- `criticalWriteDataSource` -> Semi-Sync가 활성화된 Primary 또는 더 강한 HA 클러스터

이 경우에는 Spring에서 DataSource를 분리하는 것이 실제 의미를 가집니다.

예를 들어:

- 회원 접속 로그 저장: Async 토폴로지
- 추천 이벤트 적재: Async 토폴로지
- 주문 확정: Semi-Sync 또는 더 강한 HA 토폴로지
- 결제 승인 후 상태 반영: Semi-Sync 또는 더 강한 HA 토폴로지

즉, **DataSource 분리의 본질은 세션 변수 분리가 아니라, 서로 다른 복제/HA 정책을 가진 DB 경로로 라우팅하는 것**입니다.

### 4. 대부분의 Spring 서비스에서는 이렇게 정리하는 편이 현실적이다

- 한 개의 기본 쓰기 Primary를 운영한다
- 그 Primary는 서비스 요구에 맞춰 Async 또는 Semi-Sync로 전체 정책을 정한다
- 정말 다른 수준의 보장이 필요하면 DB 토폴로지 자체를 분리한다
- 애플리케이션은 `@Transactional` 경계와 DataSource routing으로 이를 사용한다

이 구조의 장점은 다음과 같습니다.

- Spring의 트랜잭션 모델과 DB 복제 정책의 경계를 명확히 나눌 수 있음
- 커넥션 풀 설정과 복제 정책을 혼동하지 않게 됨
- 운영자가 "이 요청은 어느 DB 경로로 갔는가"를 더 명확하게 추적할 수 있음

## 정리

MySQL 복제를 볼 때 가장 먼저 이해해야 하는 것은 "COMMIT 성공 응답이 무엇을 보장하는가"입니다.

- Async Replication은 빠르지만 구조적으로 유실 가능성이 있습니다.
- Semi-Sync는 최소 1대 Replica 수신까지 확인하여 그 가능성을 줄입니다.
- Group Replication은 더 강한 정합성과 HA를 제공합니다.
- Galera Cluster는 멀티 프라이머리와 거의 동기식에 가까운 특성을 제공하지만 운영 난이도가 높습니다.
- MMM은 복제 기술이라기보다, 전통적인 복제 구조를 관리하던 레거시 HA 도구에 가깝습니다.

결국 중요한 것은 기술 이름이 아니라, **내 서비스가 얼마만큼의 데이터 유실을 허용할 수 있는가**, 그리고 **그 대가로 얼마만큼의 쓰기 지연과 운영 복잡도를 감수할 수 있는가**입니다.

운영에서는 보통 모든 데이터를 같은 수준으로 다루지 않습니다.  
로그와 통계는 Async로, 주문과 결제는 Semi-Sync 이상으로 분리하는 식의 현실적인 설계가 훨씬 많습니다.

복제 전략은 기능 선택이 아니라, 결국 **비즈니스 중요도와 장애 복구 목표를 반영하는 설계 결정**입니다.

## 최종 비교: 세 가지만 남기면

실무에서 마지막까지 비교 대상으로 남는 경우가 많은 것은 결국 아래 3가지입니다.

| 방식 | 잘 맞는 환경 | 장점 | 주의할 점 |
|------|--------------|------|-----------|
| Async + Semi-Sync | 기존 MySQL 단일 Primary 구조를 유지하면서 핵심 쓰기만 더 안전하게 만들고 싶은 팀 | 구조가 단순하고, 필요한 트랜잭션만 정합성을 강화하기 좋음 | 완전 무손실은 아니며 failover 자동화와 read/write 정책을 별도로 잘 설계해야 함 |
| InnoDB Cluster | MySQL 8 기반에서 공식 스택 중심의 현대적인 HA를 원하는 팀 | Group Replication, Router, 운영 도구까지 공식 생태계로 묶임 | 운영 복잡도와 클러스터 이해도가 필요하고, 멀티 프라이머리는 생각보다 어렵다 |
| Galera Cluster | MariaDB/Percona 계열에서 클러스터형 HA 운영 경험이 있거나 이를 선호하는 팀 | 해당 생태계에서 자연스러운 HA 선택지이며 multi-primary 구성이 가능함 | 충돌, quorum, flow control 등 분산 시스템 운영 부담이 큼 |

대부분의 팀에게는 **먼저 단일 Primary 기반의 Async + 선택적 Semi-Sync** 가 가장 현실적인 출발점입니다.  
MySQL 8에서 공식 스택을 강하게 가져가고 싶다면 `InnoDB Cluster`, MariaDB 계열에서 클러스터형 HA를 자연스럽게 운영하고 있다면 `Galera Cluster` 를 검토하면 됩니다.  
즉, 정말 특별한 이유가 없다면 멀티 라이터부터 고민하기보다, **운영 가능한 HA를 먼저 만들고 그 다음에 더 강한 일관성과 클러스터 모델을 올리는 순서**가 보통 더 안전합니다.

## 선택 가이드

마지막으로 실무 관점에서 정리하면 보통은 아래 표로 수렴합니다.

| 이런 상황이라면 | 먼저 검토할 선택지 | 이유 |
|----------------|-------------------|------|
| 읽기 확장이 중요하고 일부 유실을 허용 가능 | Async Replication | 가장 단순하고 빠르며 운영 부담이 낮음 |
| 핵심 트랜잭션만 더 안전하게 다루고 싶음 | Async + 선택적 Semi-Sync | 전체 성능을 크게 해치지 않고 중요한 쓰기만 강화 가능 |
| MySQL 8 기반에서 공식 스택 중심의 HA를 원함 | InnoDB Cluster | Group Replication, Router, 운영 도구까지 공식 흐름과 맞음 |
| MariaDB/Percona 계열에서 클러스터형 HA를 강화하고 싶음 | Galera Cluster | 해당 생태계에서 익숙한 HA/클러스터 선택지 |
| 클라우드에서 운영 부담을 줄이고 싶음 | RDS Multi-AZ, Aurora 같은 관리형 HA | failover, 백업, 운영 자동화를 플랫폼에 위임 가능 |
| 멀티 라이터가 필요하다고 생각하지만 아직 확신이 없음 | 우선 단일 Primary HA부터 재검토 | 대부분의 문제는 멀티 라이터보다 HA와 라우팅 설계로 해결되는 경우가 많음 |

정리하면 `MariaDB -> Galera`, `MySQL 8 -> InnoDB Cluster` 라는 흐름은 분명 존재합니다.  
다만 대부분의 팀에게 더 중요한 것은 멀티 라이터 자체가 아니라, **예측 가능하고 운영 가능한 HA를 만드는 것**입니다.

## 참고 자료

- MySQL 공식 문서의 Semi-Synchronous Replication
  - <https://dev.mysql.com/doc/refman/8.4/en/replication-semisync.html>
- MySQL 공식 문서의 Group Replication
  - <https://dev.mysql.com/doc/refman/8.4/en/group-replication.html>
- MySQL 공식 문서의 InnoDB Cluster
  - <https://dev.mysql.com/doc/mysql-shell/8.4/en/mysql-innodb-cluster-introduction.html>
- MariaDB 공식 문서의 Galera Cluster
  - <https://mariadb.com/docs/galera-cluster/>
- MariaDB Enterprise Platform의 High Availability
  - <https://mariadb.com/docs/server/architecture/high-availability/>
- AWS 공식 문서의 RDS Multi-AZ
  - <https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZSingleStandby.html>
- AWS 공식 문서의 Aurora failover
  - <https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Concepts.AuroraHighAvailability.html>
- GitHub `orchestrator` 프로젝트 아카이브 공지
  - <https://github.com/openark/orchestrator>
- Percona Orchestrator 저장소
  - <https://github.com/percona/orchestrator>
- mysql-mmm 프로젝트 사이트
  - <http://mysql-mmm.org/>
