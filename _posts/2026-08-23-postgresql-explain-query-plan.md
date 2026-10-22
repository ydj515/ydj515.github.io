---
title: "PostgreSQL 실행 계획 읽는 법"
date: 2026-08-23 00:00:00 +0900
description: "EXPLAIN & EXPLAIN ANALYZE"
author: ydj515
categories: [database, postgresql]
tags: [postgresql, explain, explain-analyze, query-plan, query-optimization, parallel-query, index]
image:
  path: /assets/img/postgresql/logo.png
  alt: "PostgreSQL"
---

느린 쿼리를 분석할 때는 `EXPLAIN`으로 PostgreSQL이 선택한 실행 계획을 확인합니다. 인덱스 사용 여부나 `cost`만으로는 쿼리가 느린 이유를 파악하기 어렵습니다. 예상한 행 수와 실제 반환한 행 수가 얼마나 다른지, 같은 작업을 몇 번 반복했는지, 데이터를 얼마나 읽었는지도 함께 봐야 합니다.

## EXPLAIN과 EXPLAIN ANALYZE의 차이

`EXPLAIN`은 PostgreSQL 플래너가 선택한 계획과 예상 비용을 보여줍니다. 쿼리를 실행하지 않고 계획을 확인할 때 사용합니다.

고객 한 명의 주문과 주문 상품을 조회하는 예제입니다. `orders`에는 `id`, `customer_id`가 있고, `order_items`에는 `order_id`, `product_id`가 있다고 가정합니다. `orders.customer_id`와 `order_items.order_id`에는 각각 인덱스가 있습니다.

```sql
EXPLAIN
SELECT o.id, oi.product_id
FROM orders o
JOIN order_items oi ON oi.order_id = o.id
WHERE o.customer_id = 1004;
```

`EXPLAIN ANALYZE`는 쿼리를 실제로 실행한 뒤 노드별 실행 시간과 반환 행 수를 예상값과 함께 보여줍니다.

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT o.id, oi.product_id
FROM orders o
JOIN order_items oi ON oi.order_id = o.id
WHERE o.customer_id = 1004;
```

### 함께 사용하는 옵션

주로 사용하는 옵션은 다음과 같습니다.

| 옵션          | 설명                                                                                                                                                                        |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ANALYZE`     | 쿼리를 실제로 실행하고 시간, 행 수, 반복 횟수를 표시합니다.                                                                                                                 |
| `BUFFERS`     | 공유 버퍼와 임시 블록의 적중·읽기·쓰기 정보를 표시합니다. PostgreSQL 18에서는 `ANALYZE`가 `BUFFERS`를 암묵적으로 활성화하지만, 의도를 드러내기 위해 명시하는 편이 좋습니다. |
| `VERBOSE`     | 출력 컬럼과 스키마 이름을 자세히 표시하고 병렬 계획에서는 워커별 통계를 보여줍니다.                                                                                         |
| `SETTINGS`    | 기본값과 다르게 설정되어 계획에 영향을 준 플래너 설정을 표시합니다.                                                                                                         |
| `FORMAT JSON` | 사람이 읽는 텍스트 대신 도구가 분석하기 좋은 JSON으로 출력합니다.                                                                                                           |

### EXPLAIN ANALYZE는 쿼리를 실행한다

`EXPLAIN ANALYZE`는 `SELECT`뿐 아니라 `INSERT`, `UPDATE`, `DELETE`, `MERGE`도 실제로 실행합니다. 데이터 변경 쿼리를 측정할 때는 다음처럼 트랜잭션 안에서 실행한 뒤 롤백할 수 있습니다.

```sql
BEGIN;

-- 실제로 update 쿼리 수행
EXPLAIN (ANALYZE, BUFFERS)
UPDATE orders
SET status = 'ARCHIVED'
WHERE created_at < timestamptz '2025-01-01 00:00:00+09';

ROLLBACK;
```

다만 시퀀스 증가나 데이터베이스 밖으로 전송한 이벤트처럼 롤백으로 되돌릴 수 없는 부수 효과가 있을 수 있습니다. 운영 환경에서는 실행 대상과 트리거를 먼저 확인해야 합니다.

> 실행 시간이 긴 쿼리에 `EXPLAIN ANALYZE`를 붙이면 원래 쿼리의 부하에 측정 비용까지 추가됩니다. 운영 환경에서는 먼저 일반 `EXPLAIN`으로 계획을 확인하고, 실행 시간 제한과 복제 환경 사용 여부를 검토하는 편이 안전합니다.
{:.prompt-warning}

## 인덱스를 쓰는데도 조회가 오래 걸린다면

아래실행계획을 보면 두 테이블 모두 `Index Scan`이지만, `orders`는 예상한 10행보다 훨씬 많은 10,000행을 반환합니다. 주문마다 실행하는 상품 조회도 10,000번 반복됐습니다.


```text
Nested Loop
  (cost=0.86..120.00 rows=40 width=16)
  (actual time=0.034..450.000 rows=40000 loops=1)
  Buffers: shared hit=50000 read=12000
  ->  Index Scan using idx_orders_customer_id on orders o
        (cost=0.43..84.50 rows=10 width=8)
        (actual time=0.020..20.000 rows=10000 loops=1)
        Index Cond: (customer_id = 1004)
        Buffers: shared hit=2000 read=1000
  ->  Index Scan using idx_order_items_order_id on order_items oi
        (cost=0.43..3.50 rows=4 width=16)
        (actual time=0.004..0.040 rows=4 loops=10000)
        Index Cond: (order_id = o.id)
        Buffers: shared hit=48000 read=11000
Planning Time: 0.300 ms
Execution Time: 452.000 ms
```

### 실행 계획의 부모와 자식 노드

실행 계획은 작업을 노드로 나눠 보여줍니다. 들여쓰기는 노드의 부모·자식 관계를 나타냅니다. 아래쪽 스캔 노드가 테이블이나 인덱스에서 행을 읽으면, 위쪽 노드가 그 행을 받아 정렬·조인·집계합니다.

앞의 주문 조회 계획에서 수치를 빼면 다음 구조가 남습니다.

```text
Nested Loop
  ->  Index Scan using idx_orders_customer_id on orders o
        Index Cond: (customer_id = 1004)
  ->  Index Scan using idx_order_items_order_id on order_items oi
        Index Cond: (order_id = o.id)
```

`Nested Loop`는 첫 번째 자식에서 주문을 하나 받을 때마다 그 주문의 `o.id`로 두 번째 자식을 실행합니다. 따라서 맨 아래 줄부터 한 번씩 실행하는 구조가 아닙니다. 바깥쪽 주문 수가 안쪽 상품 조회의 반복 횟수를 결정합니다.

> 상위 노드의 비용과 실행 시간에는 하위 노드의 작업이 포함됩니다. 노드별 `cost`나 `actual time`을 모두 더하면 같은 작업을 중복해서 계산하게 됩니다.
{:.prompt-info}

## 실행 시간과 노드별 수치

### Planning Time과 Execution Time

`Planning Time`은 파싱·재작성 이후의 계획 수립 시간이고, `Execution Time`은 실행기 시작·종료를 포함한 쿼리 실행 시간입니다. 결과 변환과 클라이언트 전송 시간은 기본 측정에 모두 포함되지 않아 애플리케이션 응답 시간과 다를 수 있습니다.

### cost

> cost는 계획을 비교하는 예상 비용입니다.

앞의 계획에서 주문을 찾는 노드를 보면 예상값과 실제값을 비교할 수 있습니다. 첫 번째 괄호가 예상값이고, 두 번째 괄호가 실제 실행 결과입니다.

```text
Index Scan using idx_orders_customer_id on orders o
  (cost=0.43..84.50 rows=10 width=8)
  (actual time=0.020..20.000 rows=10000 loops=1)
```

`cost=0.43..84.50`은 첫 행을 반환하기 전까지의 시작 비용이 `0.43`, 끝까지 실행할 전체 비용이 `84.50`이라는 뜻입니다. 디스크 읽기와 CPU 연산 등의 비용 상수로 계산한 상대 단위이므로 `actual time`의 밀리초와 직접 비교할 수 없습니다.

정렬처럼 모든 입력이 필요한 노드는 시작 비용이 큽니다. `LIMIT`이나 `EXISTS`처럼 일부 행만 필요하면 시작 비용도 계획 선택에 영향을 줍니다.

### rows

`rows`는 검사한 전체 행 수가 아니라 **조건을 통과해 부모에게 전달하는 행 수**입니다. 첫 괄호의 `rows=10`은 예상값, 두 번째의 `rows=10000`은 실제값입니다. 본문에서는 실제값을 `actual rows`로 구분합니다. 필터에서 제외한 행은 `Rows Removed by Filter`에 표시됩니다.

### actual time, rows, loops

> `actual time`과 실제 `rows`는 실행당 평균 시간과 출력 행 수이고, `loops`는 실행 횟수입니다.

주문 노드의 `actual time=0.020..20.000`은 첫 행을 반환하기까지 `0.020ms`, 노드 실행을 마치기까지 `20.000ms`가 걸렸다는 뜻입니다. `loops=1`이므로 이 노드는 한 번 실행됐습니다.

상품 조회 노드는 다르게 읽어야 합니다.

```text
Index Scan using idx_order_items_order_id on order_items oi
  (cost=0.43..3.50 rows=4 width=16)
  (actual time=0.004..0.040 rows=4 loops=10000)
```

노드를 여러 번 실행하면 `actual time`과 `actual rows`는 **한 번 실행했을 때의 평균값**으로 표시됩니다. 상품 조회는 한 번에 평균 `0.040ms`가 걸렸지만 주문 10,000건마다 반복됐습니다.

- 전체 출력 행 수: 약 `4 × 10,000 = 40,000행`
- 반복 실행 시간의 합: 약 `0.040ms × 10,000 = 400ms`

이 예제에서는 전체 실행 시간 `452ms` 중 상당 부분을 상품 조회의 반복에 썼습니다. 다만 표시값에는 반올림 오차가 있고 부모 노드의 시간에도 자식 작업이 포함되므로, 노드별 시간을 모두 더하지 않습니다. 병렬 실행에서는 여러 프로세스의 작업 시간이 겹치므로 이 곱을 쿼리의 경과 시간으로 해석해서도 안 됩니다.

### width

> `width`는 출력 행 하나의 예상 평균 크기이며, 단위는 바이트입니다.

`width=8`은 출력 행 하나를 평균 8바이트로 예상했다는 뜻입니다. 테이블의 물리 행이나 전송 데이터 크기가 아니라 부모에게 전달하는 컬럼·표현식을 기준으로 합니다. 가변 길이 값은 통계의 평균 너비를 사용하고, 부분 집계에서는 중간 집계 상태의 너비일 수 있습니다.

행이 넓을수록 정렬·해시·`Materialize`와 병렬 결과 전달 비용이 커질 수 있어 필요한 컬럼만 조회하는지도 확인합니다.

### Buffers

> `Buffers`는 쿼리 실행 중 블록의 적중·읽기·쓰기 정보를 보여줍니다.

주요 버퍼 항목은 다음과 같습니다.

| 항목                        | 의미                                                                                                                               |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `shared hit`                | 필요한 블록을 PostgreSQL 공유 버퍼에서 찾았습니다.                                                                                 |
| `shared read`               | 블록을 파일에서 PostgreSQL 공유 버퍼로 읽었습니다. 운영체제 캐시에 있었을 수 있으므로 모두 물리 디스크 I/O라고 단정할 수 없습니다. |
| `shared dirtied`            | 실행 중 공유 블록의 내용이 변경됐습니다.                                                                                           |
| `shared written`            | 변경된 공유 블록을 파일에 기록했습니다.                                                                                            |
| `temp read`, `temp written` | 정렬이나 해시 등이 사용한 임시 블록을 읽거나 썼습니다.                                                                             |

상품 조회 노드의 버퍼 사용량도 함께 봅니다.

```text
Buffers: shared hit=48000 read=11000
```

위 버퍼 수는 **모든 반복 실행을 합친 값**이므로 `rows`나 `actual time`처럼 `loops`를 다시 곱하지 않습니다. 같은 블록에 여러 번 접근한 횟수도 포함되므로 서로 다른 블록의 개수와는 다릅니다.

부모 `Nested Loop`의 `hit=50000 read=12000`에는 두 자식의 사용량이 포함되므로 다시 더하지 않습니다. 버퍼 접근이 상품 조회에 집중됐지만, 실제 I/O 대기 시간은 별도 측정이 필요합니다.

## Filter와 Index Cond의 차이

`Index Cond`는 인덱스로 후보를 좁히는 조건이고, `Filter`는 읽은 행을 걸러내는 조건입니다. 같은 `WHERE` 조건도 어느 단계에서 적용됐는지에 따라 읽기량이 달라집니다.

### Filter

> `Filter`는 노드가 읽은 행에 조건식을 적용해 통과한 행만 부모 노드로 보낸다는 뜻입니다.

```text
Seq Scan on orders
  Filter: (status = 'PAID'::text)
  Rows Removed by Filter: 900000
```

순차 스캔은 테이블을 훑으면서 각 행의 `status`를 검사합니다. 조건을 통과하지 못한 900,000행은 버리고 통과한 행만 반환합니다.

노드의 `loops`가 1보다 크면 `Rows Removed by Filter`도 한 번 실행할 때의 평균값으로 해석하고 반복 횟수와 함께 봐야 합니다.

### Rows Removed by Filter가 크면 문제일까

반환 행은 적은데 많은 행을 반복해서 읽고 버리며 실행 시간과 버퍼 읽기도 크다면, 필터 조건을 지원하는 인덱스를 검토합니다. 작은 테이블이나 많은 행이 필요한 집계에서는 순차 스캔이 더 저렴할 수 있습니다.

필터에서 제거한 비율은 다음과 같이 계산할 수 있습니다.

```text
제거 비율 = Rows Removed by Filter / (actual rows + Rows Removed by Filter)
```

10만 행을 반환하고 90만 행을 제거했다면 제거 비율은 90%입니다. 단, 비율만으로 판단하지 말고 인덱스 적용 전후의 읽기량을 비교해야합니다.

### Index Cond

> `Index Cond`는 인덱스 접근 범위를 줄이는 데 사용한 조건입니다.

```text
Index Scan using idx_orders_status_created_at on orders
  Index Cond: (
    (status = 'PAID'::text)
    AND (created_at >= '2026-08-01 00:00:00+09'::timestamptz)
  )
```

이 예제에서는 `status`와 `created_at` 조건으로 인덱스에서 탐색할 범위를 좁힙니다. (`Filter`는 후보 행을 가져온 뒤 적용)

하나의 노드에 `Index Cond`와 `Filter`가 함께 나타날 수도 있습니다.

```text
Index Scan using idx_orders_customer_id on orders
  Index Cond: (customer_id = 1004)
  Filter: (status = 'PAID'::text)
  Rows Removed by Filter: 87
```

`customer_id`는 인덱스로 탐색 범위를 줄이지만, `status`는 테이블에서 행을 가져온 뒤 검사합니다. 이 쿼리가 자주 실행되고 필터에서 많은 행을 버린다면 `(customer_id, status)` 복합 인덱스가 도움이 되는지 실제 데이터 분포와 쓰기 비용을 함께 검토할 수 있습니다.

### Recheck Cond

`Recheck Cond`는 인덱스가 찾은 후보가 조건을 정확히 만족하는지 힙에서 다시 확인하는 조건입니다. `Bitmap Heap Scan`에서 자주 나타납니다.

```text
Bitmap Heap Scan on orders
  Recheck Cond: (status = 'PAID'::text)
  Heap Blocks: exact=935
  ->  Bitmap Index Scan on idx_orders_status
        Index Cond: (status = 'PAID'::text)
```

정확한 비트맵이라면 조건을 다시 계산하지 않고도 처리할 수 있지만, 메모리가 부족해 비트맵이 행 위치 대신 페이지 단위로 위치를 기록하면 후보 행을 다시 검사합니다. 이때 `Heap Blocks: lossy=...`나 `Rows Removed by Index Recheck`가 나타날 수 있습니다.

## 테이블과 인덱스를 읽는 방식

행을 읽는 방식을 확인할 때는 스캔 이름뿐 아니라 반환 비율, 테이블 크기, 정렬 조건, 버퍼 사용량을 종합적으로 봐야 합니다.

| 노드                | 동작                                            | 주로 유리한 상황                                            | 함께 볼 항목                                  |
| ------------------- | ----------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------- |
| `Seq Scan`          | 테이블 블록을 순서대로 읽습니다.                | 작은 테이블 또는 많은 행이 필요한 쿼리                      | `Filter`, `Rows Removed by Filter`, `Buffers` |
| `Index Scan`        | 인덱스에서 위치를 찾고 힙의 행을 읽습니다.      | 적은 행을 찾거나 인덱스 순서가 필요한 쿼리                  | `Index Cond`, `Filter`, 랜덤 힙 접근량        |
| `Index Only Scan`   | 가능하면 인덱스만 읽습니다.                     | 필요한 컬럼이 인덱스에 있고 가시성 맵을 활용할 수 있는 쿼리 | `Heap Fetches`                                |
| `Bitmap Index Scan` | 조건에 맞는 행 위치를 비트맵으로 모읍니다.      | 한 행보다는 많지만 전체보다는 적은 범위를 읽는 쿼리         | `Index Cond`                                  |
| `Bitmap Heap Scan`  | 비트맵의 위치를 블록 순서로 묶어 힙을 읽습니다. | 여러 힙 접근을 블록 단위로 묶을 때                          | `Recheck Cond`, `Heap Blocks`                 |
| `Parallel Seq Scan` | 여러 프로세스가 테이블 블록을 나눠 읽습니다.    | 큰 테이블의 넓은 범위를 처리하는 쿼리                       | `Gather`, 워커 수, `loops`, 워커별 편차       |

### 인덱스가 있어도 Seq Scan을 선택하는 이유

인덱스가 있어도 많은 행을 반환하는 쿼리에서는 순차 스캔의 비용이 더 저렴할 수 있습니다. 인덱스 스캔은 인덱스와 힙을 오가며 여러 블록에 분산된 행을 읽을 수 있기 때문입니다.

반환 비율과 테이블 크기, 인덱스 선두 컬럼과 조건의 일치 여부, 함수·형 변환, 통계 최신성을 확인합니다.

`SET enable_seqscan = off`로 순차 스캔을 피하는 계획을 비교해 볼 수 있지만, 이는 비교 실험을 위한 수단입니다. 운영 환경에 그대로 적용하면 순차 스캔이 더 적합한 다른 쿼리의 성능이 떨어질 수 있습니다.

### Index Only Scan도 힙을 읽을 수 있다

`Index Only Scan`에서도 힙을 읽는 경우가 있습니다. PostgreSQL은 가시성 맵에서 페이지의 모든 튜플이 현재 스냅숏에 보이는지 확인할 수 없으면 힙을 방문합니다.

```text
Index Only Scan using idx_orders_status_created_at on orders
  Index Cond: (status = 'PAID'::text)
  Heap Fetches: 1842
```

`Heap Fetches`는 힙을 방문한 횟수입니다. 값이 크다면 최근 데이터 변경량과 autovacuum 진행 상태, 가시성 맵을 확인합니다. 조회 컬럼을 인덱스에 모두 넣어도 가시성 확인을 위한 힙 접근은 남을 수 있습니다.

## 조인, 정렬, 집계 노드 읽기

스캔 결과를 처리하는 조인·정렬·집계 노드에서는 입력 행 수와 반복 횟수, 정렬·해시 작업의 메모리 부족으로 인한 임시 파일 사용 여부를 확인합니다.

### 조인 노드

> 조인 노드는 두 입력의 행을 조인 조건에 맞춰 결합합니다.

| 노드          | 동작                                                            | 확인할 부분                                                  |
| ------------- | --------------------------------------------------------------- | ------------------------------------------------------------ |
| `Nested Loop` | 바깥쪽 행마다 안쪽 노드를 반복해서 실행합니다.                  | 안쪽 노드의 `loops`, 행 수 추정 오차, 조인 키 인덱스         |
| `Hash Join`   | 한쪽 입력으로 해시 테이블을 만들고 다른 입력에서 키를 찾습니다. | `Hash Cond`, `Buckets`, `Batches`, 메모리와 임시 디스크 사용 |
| `Merge Join`  | 정렬된 두 입력을 조인 키 순서로 함께 이동하며 결합합니다.       | 입력 정렬 비용, 인덱스가 제공한 순서, `Merge Cond`           |

`Nested Loop`가 항상 느린 것은 아닙니다. 바깥쪽 행이 적고 안쪽을 인덱스로 빠르게 찾을 수 있다면 효율적입니다. 반대로 플래너가 바깥쪽을 10행으로 예상했지만 실제로 10만 행이라면 안쪽 인덱스 스캔도 10만 번 반복될 수 있습니다.

### Sort

> `Sort`는 입력 행을 지정한 정렬 기준에 따라 정렬합니다.

`Sort`에서는 정렬 방식과 메모리·디스크 사용량을 확인합니다.

```text
Sort
  Sort Key: created_at DESC
  Sort Method: external merge  Disk: 128000kB
```

`external merge`와 `Disk`가 나타나면 정렬 데이터가 작업 메모리에 들어가지 않아 임시 파일을 사용했다는 뜻이며 쿼리별로 필요한 정렬인지, 인덱스 순서를 활용할 수 있는지, 동시 쿼리 수를 고려할 때 `work_mem` 조정이 안전한지 확인합니다.

`work_mem`은 정렬·해시 작업마다 적용되므로, 여러 작업이나 병렬 워커가 동시에 실행되면 전체 메모리 사용량이 크게 늘어날 수 있습니다.

### Hash와 HashAggregate

> `Hash`는 조인에 사용할 해시 테이블을 만들고, `HashAggregate`는 해시로 그룹을 나눠 집계합니다.

`Hash`의 `Batches`는 데이터를 나눠 처리한 배치 수입니다.

```text
Hash
  Buckets: 131072  Batches: 8  Memory Usage: 6145kB
```

`Batches`가 1보다 크면 `temp read`, `temp written`, `Disk Usage`로 임시 I/O를 확인합니다. 입력 행 수·너비가 예상보다 크거나 작업 메모리가 부족한지 살펴봅니다.

### Limit과 Materialize

> `Limit`은 반환할 행 수를 제한하고, `Materialize`는 자식 결과를 저장해 다시 사용합니다.

`Limit`은 자식 노드에서 필요한 수의 행을 받으면 멈출 수 있으므로, 자식의 전체 예상 비용과 실제 실행량이 크게 달라도 반드시 추정 오류는 아닙니다.

`Materialize`는 중첩 루프의 안쪽 결과를 여러 번 사용할 때 반복 계산을 줄일 수 있지만, 결과가 크면 메모리나 임시 파일 사용량을 확인해야 합니다.

## 병렬 실행 계획

병렬 실행에서는 쿼리를 담당하는 리더 프로세스가 워커 프로세스들를 실행해 작업을 나눠 처리합니다. Gather는 병렬로 처리한 결과를 모으는 노드입니다. 실행 계획에서 Gather 아래의 작업은 리더와 워커가 나눠 처리하고, 위의 작업은 리더가 처리합니다.

아래 쿼리는 결제된 주문의 총 건수를 조회하는 쿼리입니다.

```sql
SELECT count(*)
FROM orders
WHERE status = 'PAID';
```

위 쿼리의 병렬 실행 계획을 보자면 아래와 같습니다.

```text
Finalize Aggregate
  (actual time=85.721..89.416 rows=1 loops=1)
  ->  Gather
        (actual time=85.602..89.404 rows=3 loops=1)
        Workers Planned: 2
        Workers Launched: 2
        ->  Partial Aggregate
              (actual time=80.113..80.114 rows=1 loops=3)
              ->  Parallel Seq Scan on orders
                    (actual time=0.021..73.488 rows=33333 loops=3)
                    Filter: (status = 'PAID'::text)
                    Rows Removed by Filter: 300000
Planning Time: 0.187 ms
Execution Time: 89.492 ms
```
위 실행계획을 해석하면 
- Parallel Seq Scan: 워커 2개와 리더가 주문을 나눠 읽고, 프로세스당 평균 33,333건의 PAID 주문을 반환합니다(loops=3).
- Partial Aggregate: 각 프로세스가 자신이 찾은 PAID 주문의 건수를 세어 한 행씩 반환합니다(rows=1 loops=3).
- Gather: 건수가 담긴 세 행을 모읍니다(rows=3).
- Finalize Aggregate: 세 행의 건수를 더해 총 건수를 한 행으로 반환합니다(rows=1). 총 건수는 반올림된 평균값만으로 정확히 알 수 없으며, 약 10만 건입니다.

### Workers Planned와 Workers Launched

위 실행계획에서 `Workers Planned: 2`는 플래너가 계획을 만들 때 요청하기로 한 병렬 백그라운드 워커 수, `Workers Launched: 2`는 실행 시점에 실제로 시작한 워커 수입니다.

`Workers Planned`에는 쿼리를 요청한 리더 프로세스가 포함되지 않습니다. 기본값인 `parallel_leader_participation=on`에서는 리더도 `Gather` 아래의 병렬 구간을 함께 처리할 수 있습니다. 위 예시에서 `Parallel Seq Scan`의 `loops=3`은 워커 2개와 리더가 작업에 참여한 결과로 해석할 수 있습니다.

리더는 결과 수집과 상위 노드 처리도 맡으므로, 워커가 보내는 행이 많으면 스캔에 거의 참여하지 못할 수 있습니다. 가용 워커가 부족하면 `Workers Launched`가 계획보다 작거나 0이 되어 실행 시간이 달라질 수 있습니다. 워커 상한과 비용 설정은 아래 표에서 확인합니다.

### Parallel Seq Scan

`Parallel Seq Scan`에서는 리더와 워커가 테이블 블록을 나눠 읽고 조건에 맞는 행을 찾습니다. 각 프로세스가 테이블 전체를 중복해서 읽지는 않으며, 예시의 rows=33333 loops=3은 세 프로세스가 각각 평균 33,333행을 반환했다는 뜻입니다.

전체 반환 행 수는 약 33,333 × 3 = 99,999행, 약 10만 행입니다. 실행 계획에서 예상 행 수와 실제 행 수는 다음처럼 구분합니다.
- cost 옆의 rows: 프로세스당 예상 출력 행 수입니다.
- actual time 옆의 rows: 프로세스당 실제 출력 행 수의 평균입니다. loops를 곱하면 해당 노드의 전체 출력 행 수를 대략 구할 수 있습니다.

이 예제에서 Gather가 모으는 것은 주문 행이 아니라 각 프로세스가 센 주문 건수입니다. 따라서 스캔이 반환한 주문은 약 10만 행이지만, Gather의 결과는 건수가 담긴 3행이고, 이를 더한 Finalize Aggregate의 결과는 1행입니다.

`Rows Removed by Filter: 300000`도 프로세스당 평균입니다. 세 프로세스가 조건에 맞지 않아 제외한 행은 약 90만 행이며, 반환한 약 10만 행을 합치면 전체 검사한 주문은 약 100만 행입니다.

### Partial Aggregate와 Finalize Aggregate

Partial Aggregate는 각 프로세스가 찾은 PAID 주문의 건수를 셉니다. Gather가 각 프로세스의 집계 결과를 모으면, Finalize Aggregate가 건수를 더해 전체 결제 주문 건수를 구합니다.

> 집계 쿼리라고 해서 모두 병렬로 집계할 수 있는 것은 아닙니다. 사용하는 집계 함수와 DISTINCT, ORDER BY 등의 조건에 따라 병렬 집계가 제한될 수 있습니다.
{:.prompt-info}

### Gather와 Gather Merge

> `Gather`는 각 프로세스가 반환한 행을 모으지만, 전체 결과의 정렬 순서를 보장하지 않습니다.  
> `Gather Merge`는 각 프로세스가 정렬한 결과를 받아 전체 정렬 순서를 유지하며 합칩니다.

```text
Gather Merge
  Workers Planned: 2
  Workers Launched: 2
  ->  Sort
        Sort Key: created_at DESC
        ->  Parallel Seq Scan on orders
```

위 계획에서는 각 프로세스가 `created_at DESC`로 정렬한 결과를 `Gather Merge`가 같은 순서로 합칩니다.

### 워커별 처리 편차 확인

`VERBOSE`를 사용하면 워커마다 반환한 행 수와 실행 시간을 더 자세히 볼 수 있습니다.

```sql
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT count(*)
FROM orders
WHERE status = 'PAID';
```

### 병렬 워커 수와 비용 설정 확인하기

PostgreSQL 18.6의 병렬 워커 관련 설정 값입니다.

| 설정                              | 기본값  | 의미                                                                                                |
| --------------------------------- | ------- | --------------------------------------------------------------------------------------------------- |
| `max_worker_processes`            | `8`     | 논리 복제, 확장 기능 등을 포함한 전체 백그라운드 워커의 클러스터 상한입니다.                        |
| `max_parallel_workers`            | `8`     | 클러스터 전체에서 병렬 작업에 사용할 수 있는 워커의 상한입니다.                                     |
| `max_parallel_workers_per_gather` | `2`     | 하나의 `Gather` 또는 `Gather Merge`가 요청할 수 있는 워커의 상한입니다. `0`이면 병렬 쿼리를 끕니다. |
| `parallel_leader_participation`   | `on`    | 리더가 `Gather` 아래의 병렬 구간에도 참여할 수 있게 합니다.                                         |
| `min_parallel_table_scan_size`    | `8MB`   | 병렬 테이블 스캔을 후보로 검토하기 위한 최소 예상 스캔 크기입니다.                                  |
| `min_parallel_index_scan_size`    | `512kB` | 병렬 인덱스 스캔을 후보로 검토하기 위한 최소 예상 인덱스 스캔 크기입니다.                           |
| `parallel_setup_cost`             | `1000`  | 워커를 시작하는 비용에 대한 플래너의 추정값입니다.                                                  |
| `parallel_tuple_cost`             | `0.1`   | 워커가 만든 행 하나를 다른 프로세스로 전달하는 비용의 추정값입니다.                                 |

`max_parallel_workers_per_gather=2`는 항상 워커 2개를 사용한다는 뜻이 아닙니다. 플래너는 테이블 크기와 비용을 보고 0개, 1개 또는 2개를 계획할 수 있으며, 실행 시점에는 가용 워커 부족으로 더 적게 시작할 수도 있습니다. `min_parallel_table_scan_size`도 크기를 넘으면 병렬 실행을 강제하는 값이 아니라 병렬 계획을 후보로 검토하기 위한 하한입니다.

현재 설정값과 PostgreSQL의 기본값은 `pg_settings`에서 함께 확인할 수 있습니다.

```sql
SELECT
  name,      -- 설정 이름
  setting,   -- 현재 세션에 적용된 값
  unit,      -- 설정값의 단위 (단위가 없으면 NULL)
  boot_val,  -- PostgreSQL에 내장된 기본값
  reset_val, -- 현재 세션에서 RESET했을 때 돌아갈 값
  source     -- 현재값의 출처 (기본값, 설정 파일, 세션 설정 등)
FROM pg_settings
WHERE name IN (
  'max_worker_processes',
  'max_parallel_workers',
  'max_parallel_workers_per_gather',
  'parallel_leader_participation',
  'min_parallel_table_scan_size',
  'min_parallel_index_scan_size',
  'parallel_setup_cost',
  'parallel_tuple_cost'
)
ORDER BY name;
```

### 병렬 실행을 끄고 직렬 계획과 비교하기

직렬 실행은 병렬 워커 없이 쿼리를 담당하는 프로세스 하나가 모든 작업을 처리하는 방식입니다. `max_parallel_workers_per_gather`를 `0`으로 설정하면 병렬 실행을 끄고 직렬 실행 계획을 확인할 수 있습니다.

특정 쿼리의 실행 계획과 시간을 비교할 때는 트랜잭션 안에서 `SET LOCAL`을 사용하면 트랜잭션이 끝나고 설정값은 원복됩니다.

```sql
BEGIN;

SET LOCAL max_parallel_workers_per_gather = 0;

EXPLAIN (ANALYZE, BUFFERS)
SELECT count(*)
FROM orders
WHERE status = 'PAID';

COMMIT;
```

같은 세션에서 여러 쿼리를 비교하려면 `SET`을 사용하고, 비교가 끝나면 `RESET`으로 설정을 되돌립니다.

```sql
SET max_parallel_workers_per_gather = 0;

-- 직렬 계획으로 비교할 쿼리
EXPLAIN (ANALYZE, BUFFERS)
SELECT count(*) FROM orders WHERE status = 'PAID';

RESET max_parallel_workers_per_gather;
```

서버 설정으로 적용하려면 `ALTER SYSTEM`을 사용합니다. 다른 세션에도 영향을 줄 수 있으므로 개별 쿼리의 비교 실험에는 사용하지 않는 편이 좋습니다.

```sql
ALTER SYSTEM SET max_parallel_workers_per_gather = 0;
SELECT pg_reload_conf();
```

`parallel_leader_participation=off`는 병렬 쿼리를 끄는 설정이 아닙니다. 워커는 그대로 사용하고 리더만 병렬 구간의 실행에서 제외합니다.  
`max_parallel_workers_per_gather=0`은 일반 쿼리의 병렬 실행을 끄지만, 병렬 `CREATE INDEX`와 `VACUUM` 같은 유지보수 작업은 `max_parallel_maintenance_workers`가 별도로 제어합니다.

### 참고: 병렬 쿼리의 버전별 기본값

병렬 쿼리를 허용해도 모든 쿼리가 병렬로 실행되지는 않습니다. 플래너가 병렬로 실행해도 안전하고 직렬 계획보다 비용이 낮다고 판단한 쿼리만 병렬 계획을 선택합니다.

| 버전           | 변화                                     | 기본 상태                                 |
| -------------- | ---------------------------------------- | ----------------------------------------- |
| PostgreSQL 9.6 | 병렬 순차 스캔, 일부 병렬 조인·집계 도입 | 꺼짐: `max_parallel_workers_per_gather=0` |
| PostgreSQL 10  | 병렬 쿼리를 기본으로 허용                | 켜짐: `max_parallel_workers_per_gather=2` |
| PostgreSQL 11  | `parallel_leader_participation` 추가     | 리더 참여: `on`                           |

## 예상 행 수가 다르면 통계를 확인한다

예상 행 수와 실제 행 수의 차이가 크면 통계가 최근 데이터 분포를 반영하는지, 특정 값에 데이터가 몰려 있는지, 조건에 사용한 컬럼들이 서로 연관돼 있는지 확인합니다. 조건에 함수나 복잡한 표현식을 사용하거나, 준비된 문장이 매개변수 값과 관계없이 같은 계획을 사용하면 행 수 추정이 부정확할 수 있습니다.

### 플래너는 rows를 어떻게 계산할까

플래너는 쿼리를 실제로 실행해 행 수를 세지 않습니다. 테이블 전체 행 수의 추정치에 조건을 만족할 비율인 **선택도(selectivity)**를 곱해 각 노드의 `rows`를 계산합니다.

```text
예상 rows ≈ 입력 행 수 추정치 × 조건 선택도
```

기본 테이블의 행 수는 주로 `pg_class.reltuples`에서 시작합니다. 조건 선택도는 내부 카탈로그 `pg_statistic`의 통계를 사용해 계산하며, 일반 사용자는 읽기 쉬운 뷰인 `pg_stats`로 이를 확인할 수 있습니다. 이 값들은 `ANALYZE`가 전체 행이 아닌 표본을 조사해 만든 추정치이므로 정확한 카운트가 아닙니다.

```sql
SELECT reltuples::bigint AS estimated_rows,
       relpages
FROM pg_class
WHERE oid = 'public.orders'::regclass;

SELECT attname,
       null_frac,
       avg_width,
       n_distinct,
       most_common_vals,
       most_common_freqs,
       histogram_bounds,
       correlation
FROM pg_stats
WHERE schemaname = 'public'
  AND tablename = 'orders';
```

주요 통계의 의미는 다음과 같습니다.

| `pg_stats` 컬럼     | 의미와 `rows` 추정에서의 역할                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `null_frac`         | 전체 행에서 `NULL`이 차지하는 비율입니다. `IS NULL`, `IS NOT NULL`과 다른 조건의 선택도 계산에 사용합니다.                     |
| `n_distinct`        | 서로 다른 값의 개수 추정치입니다. 양수는 개수, 음수는 전체 행 수에 대한 비율입니다. `-1`은 값이 거의 모두 고유하다는 뜻입니다. |
| `most_common_vals`  | 자주 나타나는 값인 MCV(Most Common Values) 목록입니다.                                                                         |
| `most_common_freqs` | 각 MCV가 차지하는 비율입니다. 자주 등장하는 특정 값의 선택도를 평균이 아닌 실제 표본 분포에 가깝게 추정합니다.                 |
| `histogram_bounds`  | MCV를 제외한 값을 비슷한 개수의 구간으로 나눈 경계입니다. `<`, `>`, `BETWEEN` 같은 범위 조건에 주로 사용합니다.                |
| `avg_width`         | 컬럼 값의 평균 바이트 수입니다. 행 수가 아니라 실행 계획의 `width` 추정에 사용합니다.                                          |
| `correlation`       | 컬럼의 논리적 순서와 테이블의 물리적 저장 순서 사이의 상관관계입니다. 행 수보다 인덱스 스캔의 I/O 비용 추정에 영향을 줍니다.   |

예를 들어 `orders`가 100만 행이고 `status = 'PAID'`가 MCV에 있으며 빈도가 `0.25`라면 다음처럼 추정할 수 있습니다.

```text
예상 rows ≈ 1,000,000 × 0.25 = 250,000
```

등호 조건의 값이 MCV에 없다면 플래너는 대략 다음 방식으로 나머지 값의 평균 빈도를 구합니다.

```text
나머지 값 하나의 선택도
≈ (1 - null_frac - MCV 빈도 합계)
  / (n_distinct - MCV 개수)
```

### 대량 INSERT 뒤에 통계 갱신하기

`INSERT`마다 통계를 다시 계산하지는 않습니다. 전체 행 수는 파일 크기로 보정할 수 있지만 값 분포는 다음 `ANALYZE`까지 이전 상태로 남을 수 있습니다. 기존 100만 건에 `PAID` 주문 500만 건을 넣는 등 분포가 크게 바뀌었다면 계획을 확인하기 전에 통계를 갱신합니다.

```sql
ANALYZE orders;
```

특정 값에 데이터가 몰려 있는데 통계에 잘 반영되지 않았다면, 해당 컬럼의 통계 목표를 높여 더 많은 데이터를 표본으로 조사하도록 한 뒤 `ANALYZE`를 다시 실행할 수 있습니다.

```sql
ALTER TABLE orders
ALTER COLUMN status SET STATISTICS 500;

ANALYZE orders;
```

> 통계 목표란?  
> **통계 목표(statistics target)는 컬럼의 값 분포를 얼마나 자세히 수집할지 정하는 값**입니다.  
> 값을 높이면 `ANALYZE`가 더 많은 표본을 조사하고, MCV에 기록할 값의 수와 히스토그램 구간 수도 늘릴 수 있습니다. 예를 들어 `SET STATISTICS 500`은 표본 500개만 조사한다는 뜻이 아니라, 통계의 상세 수준을 500으로 지정한다는 뜻입니다.
{:.prompt-info}

통계 목표를 높이면 자주 등장하는 값과 값의 분포를 더 자세히 기록할 수 있습니다. 대신 통계를 수집하고 저장하거나 실행 계획을 만드는 데 드는 비용도 늘어납니다. 예상 행 수와 실제 행 수가 계속 크게 차이 나는 컬럼에 적용합니다.

`ANALYZE orders`는 `orders` 테이블의 통계를 갱신합니다. `EXPLAIN ANALYZE`는 쿼리를 실행해 시간과 행 수를 측정할 뿐, 통계를 갱신하지는 않습니다.

### autovacuum은 언제 자동 ANALYZE를 실행할까

autovacuum은 고정 주기마다 모든 테이블에 무조건 `ANALYZE`를 실행하지 않습니다. 런처가 주기적으로 데이터베이스를 확인하고, 테이블에서 마지막 분석 이후 변경된 행 수가 다음 임계치를 넘으면 자동 분석을 예약합니다.

> autovacuum은 PostgreSQL이 테이블을 정리하고 통계를 갱신하는 자동 관리 기능입니다.
{:.prompt-info}

```text
자동 분석 임계치
= autovacuum_analyze_threshold
  + autovacuum_analyze_scale_factor × pg_class.reltuples
```

PostgreSQL 18의 기본값은 `autovacuum_analyze_threshold = 50`, `autovacuum_analyze_scale_factor = 0.1`입니다. 따라서 1억 행으로 추정된 테이블은 단순 계산으로 약 1,000만 건이 넘게 변경돼야 자동 분석 조건을 만족할 수 있습니다. 비교 대상은 마지막 `ANALYZE` 이후 삽입·수정·삭제된 행의 합계입니다.

`autovacuum_naptime`의 기본값은 1분이지만, 이는 매분 모든 테이블의 통계를 갱신한다는 뜻이 아닙니다. 검사와 워커 실행의 최소 간격에 가깝고, 임계치를 넘은 뒤에도 다른 작업, 사용 가능한 워커 수, 잠금 경합에 따라 실제 실행 시점은 늦어질 수 있습니다.

분석 시점과 변경량은 다음처럼 확인할 수 있습니다.

```sql
SELECT relname,
       n_live_tup,
       n_mod_since_analyze,
       last_analyze,
       last_autoanalyze
FROM pg_stat_user_tables
WHERE relname = 'orders';
```

큰 테이블의 분포가 적은 변경에도 크게 달라진다면 테이블별 임계치를 낮출 수 있습니다.

```sql
ALTER TABLE orders SET (
  autovacuum_analyze_threshold = 1000,
  autovacuum_analyze_scale_factor = 0.02
);
```

임계치를 낮추면 적은 변경에도 통계를 갱신하므로 분석 작업이 더 자주 실행됩니다. 마지막 분석 이후 변경된 행 수인 `n_mod_since_analyze`, 분석에 걸린 시간, 예상 행 수와 실제 행 수의 차이를 보며 조정합니다.

파티션 테이블은 개별 파티션의 통계와 전체 파티션을 대상으로 한 부모 테이블의 통계를 구분해야 합니다. autovacuum은 개별 파티션의 통계는 갱신하지만 부모 테이블의 통계는 자동으로 갱신하지 않습니다. 데이터를 처음 적재하거나 분포가 크게 바뀌었다면 부모 테이블에 직접 `ANALYZE`를 실행합니다.

### 여러 조건이 서로 연관돼 있을 때

통계를 갱신해도 여러 컬럼에 조건을 걸면 예상 행 수가 실제와 크게 다를 수 있습니다. 기본 통계에는 각 컬럼의 값 분포만 담겨 있어 컬럼 사이의 관계를 알기 어렵기 때문입니다. 별도 통계가 없다면 플래너는 `AND`로 연결된 조건들이 서로 영향을 주지 않는다고 가정하고, 각 조건을 만족할 비율을 곱해 행 수를 추정합니다.

```text
tenant_id 선택도 = 0.1
status 선택도    = 0.1

두 조건의 선택도 ≈ 0.1 × 0.1 = 0.01
```

하지만 특정 테넌트의 주문이 대부분 같은 상태라면, 두 조건을 모두 만족하는 주문의 비율은 `0.01`과 크게 다를 수 있습니다. 이처럼 컬럼 사이의 관계 때문에 예상 행 수가 계속 빗나간다면, 여러 컬럼의 관계를 함께 수집하는 확장 통계를 만들 수 있습니다.

```sql
CREATE STATISTICS orders_tenant_status_stats (dependencies, mcv)
ON tenant_id, status
FROM orders;

ANALYZE orders;
```

`dependencies`는 한 컬럼의 값이 다른 컬럼의 값을 얼마나 결정하는지 기록하고, `mcv`는 자주 함께 나타나는 값 조합과 그 빈도를 기록합니다. `ndistinct`는 여러 컬럼을 묶었을 때 서로 다른 값 조합이 몇 개인지 추정해, `GROUP BY`의 결과 그룹 수를 계산할 때 사용합니다.

확장 통계를 만든 뒤에는 `ANALYZE`를 실행해야 실제 데이터에서 통계를 수집합니다.

## LIKE 'aa%'인데 Seq Scan이 나오는 이유

`LIKE 'aa%'`는 `aa`로 시작하는 문자열을 찾는 조건입니다. 인덱스의 정렬 규칙이 접두사 검색에 맞으면 B-tree 인덱스로 검색 범위를 좁힐 수 있습니다. 반면 `LIKE '%aa'`는 문자열의 시작 부분이 정해져 있지 않아 일반 B-tree 인덱스로 범위를 좁히기 어렵습니다.

`LIKE 'aa%'`에서도 다음과 같은 이유로 `Seq Scan`을 선택할 수 있습니다.

- 테이블이 작거나 조건에 맞는 행이 많아 순차 스캔의 비용이 더 낮습니다.
- 통계가 실제 문자열 분포를 반영하지 못해 조건에 맞는 행 수를 잘못 추정합니다.
- 준비된 문장에서 매개변수와 관계없이 재사용하는 일반 계획을 만들면 검색할 접두사를 알 수 없습니다.
- 문자열 정렬 규칙(collation) 때문에 `aa`로 시작하는 값을 인덱스의 검색 범위로 표현하기 어렵습니다.

### 실행 계획의 `~~`는 `LIKE`

PostgreSQL 파서는 `LIKE`를 내부 연산자인 `~~`로 변환합니다. 따라서 다음 두 표현은 같은 뜻입니다.

```sql
name LIKE 'aa%'
name ~~ 'aa%'
```

실행 계획에서는 원래 SQL 대신 다음처럼 내부 연산자가 나타날 수 있습니다.

```text
Seq Scan on customer_names
  Filter: (name ~~ 'aa%'::text)
  Rows Removed by Filter: 99900
```

관련 연산자는 다음과 같습니다.

| 실행 계획의 연산자 | SQL 표현    |
| ------------------ | ----------- |
| `~~`               | `LIKE`      |
| `~~*`              | `ILIKE`     |
| `!~~`              | `NOT LIKE`  |
| `!~~*`             | `NOT ILIKE` |

### 문자열 정렬 규칙과 text_pattern_ops

collation은 문자열 비교·정렬 규칙입니다. `C`·`POSIX` 이외의 locale에서는 B-tree 정렬 순서가 접두사 검색에 맞지 않을 수 있습니다. `text` 컬럼에 `text_pattern_ops`를 지정하면 문자를 하나씩 비교해 접두사 검색 범위를 만들 수 있습니다.

```sql
CREATE INDEX idx_customer_names_name_pattern
ON customer_names (name text_pattern_ops);
```

컬럼 타입에 따라 다음 연산자 클래스를 사용합니다.

| 컬럼 타입 | 연산자 클래스         |
| --------- | --------------------- |
| `text`    | `text_pattern_ops`    |
| `varchar` | `varchar_pattern_ops` |
| `char`    | `bpchar_pattern_ops`  |

PostgreSQL 18.6에서 문자열 정렬 규칙을 ICU `ko-KR`로 설정했을 때, 일반 B-tree 인덱스가 있어도 `Seq Scan`을 선택했습니다. `text_pattern_ops` 인덱스를 추가한 뒤에는 `aa`로 시작하는 범위를 인덱스로 찾는 계획으로 바뀌었습니다.

```text
Bitmap Heap Scan on customer_names
  Filter: (name ~~ 'aa%'::text)
  ->  Bitmap Index Scan on idx_customer_names_name_pattern
        Index Cond: (
          (name ~>=~ 'aa'::text)
          AND (name ~<~ 'ab'::text)
        )
```

- `~~ 'aa%'`는 원래 작성한 `LIKE 'aa%'` 조건입니다.
- `~>=~ 'aa'`는 패턴 정렬 규칙에서 `aa` 이상인 값을 찾는 하한 조건입니다.
- `~<~ 'ab'`는 `aa` 접두사의 다음 범위인 `ab` 미만까지만 찾는 상한 조건입니다.

> `text_pattern_ops` 인덱스는 `LIKE`와 정규 표현식의 접두사 검색, 동등 비교에 사용할 수 있지만 일반 `<`, `<=`, `>`, `>=` 비교에는 사용할 수 없습니다. locale 기준 범위 검색도 필요하다면 기본 연산자 클래스의 인덱스를 별도로 유지해야 합니다. 데이터베이스가 `C` locale을 사용한다면 일반 B-tree 인덱스로 패턴 검색을 처리할 수 있어 `text_pattern_ops`가 필요하지 않습니다.
{:.prompt-info}

`C` collation을 명시한 인덱스를 만드는 방법도 있습니다. 이 경우 쿼리에서도 같은 collation을 지정해야 합니다.

```sql
CREATE INDEX idx_customer_names_name_c
ON customer_names (name COLLATE "C");

SELECT id, name
FROM customer_names
WHERE name COLLATE "C" LIKE 'aa%';
```

대소문자를 구분하지 않는 접두사 검색에는 `lower(name)` 표현식과 `text_pattern_ops`를 결합한 인덱스를 검토할 수 있습니다. 이때 쿼리 조건도 인덱스 표현식과 같아야 합니다.

```sql
CREATE INDEX idx_customer_names_lower_pattern
ON customer_names (lower(name) text_pattern_ops);

SELECT id, name
FROM customer_names
WHERE lower(name) LIKE 'aa%';
```

## 실행 계획을 분석하고 변경 전후 비교하기

변경 전후에 매개변수, PostgreSQL 버전, 데이터량·분포, 통계, 인덱스, 설정과 캐시 상태를 맞춥니다.

```sql
EXPLAIN (ANALYZE, BUFFERS, VERBOSE, SETTINGS)
SELECT o.id, oi.product_id
FROM orders o
JOIN order_items oi ON oi.order_id = o.id
WHERE o.customer_id = 1004;
```

전체 실행 시간을 확인한 뒤 자식에서 부모로 행의 흐름을 따라갑니다. 예상 행 수가 처음 어긋난 지점과 반복 작업·버퍼 접근이 집중된 지점을 찾습니다. 여러 계획을 도구로 비교할 때는 `FORMAT JSON`을 사용할 수 있습니다.

| 확인한 문제                          | 먼저 확인할 내용                                                  |
| ------------------------------------ | ----------------------------------------------------------------- |
| 예상 행 수와 실제 행 수의 큰 차이    | 통계 최신성, 데이터 쏠림, 컬럼 상관관계, 매개변수별 분포          |
| 적은 결과를 위해 많은 행을 필터링    | 조건을 지원하는 인덱스, 조건식의 함수·형 변환, 부분 인덱스 가능성 |
| 중첩 루프 안쪽의 큰 `loops`          | 바깥쪽 실제 행 수, 안쪽 조인 키 인덱스, 추정 오류                 |
| `Sort Method: external merge`        | 정렬 대상 행 수, 인덱스 순서, `work_mem`, 동시 실행량             |
| 해시의 여러 `Batches`와 임시 I/O     | 입력 크기 추정, 행 너비, `work_mem`, 조인 순서                    |
| `Workers Launched < Workers Planned` | 병렬 워커 상한, 동시에 실행 중인 병렬 쿼리, 리소스 포화           |
| 워커별 실행 시간 편차                | 데이터·작업 분배, I/O 편차, 리더의 결과 수집 부담                 |

변경 후에는 여러 번 측정해 중앙값과 상위 지연 시간, 첫 실행과 반복 실행의 버퍼 읽기를 비교합니다. 캐시·체크포인트·autovacuum·동시 쿼리의 영향이 있으므로 한 번의 결과로 판단하지 않습니다. 읽기 성능과 함께 인덱스의 쓰기 비용, 메모리 사용량과 동시 처리량도 확인합니다.

## 정리

인덱스를 사용해도 행 수 추정이 빗나가고 조회가 반복되면 느려질 수 있습니다. `rows`, `loops`, `Buffers`로 작업량을 확인하고, 병렬 계획에서는 워커별 편차와 결과 수집 비용도 봅니다. 원인에 맞춰 통계·인덱스·쿼리·설정을 조정한 뒤 같은 조건에서 다시 측정합니다.

## 출처

- [PostgreSQL 18 Documentation: Using EXPLAIN](https://www.postgresql.org/docs/18/using-explain.html)
- [PostgreSQL 18 Documentation: EXPLAIN](https://www.postgresql.org/docs/18/sql-explain.html)
- [PostgreSQL 18 Documentation: Parallel Plans](https://www.postgresql.org/docs/18/parallel-plans.html)
- [PostgreSQL 18 Documentation: Statistics Used by the Planner](https://www.postgresql.org/docs/18/planner-stats.html)
- [PostgreSQL 18 Documentation: Routine Vacuuming](https://www.postgresql.org/docs/18/routine-vacuuming.html)
