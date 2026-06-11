---
title: ORDER BY가 없다면 데이터 정렬 순서는 어떻게 될까
description: ORDER BY 없이 조회하면 데이터는 어떤 순서로 반환될까? Oracle, MySQL, PostgreSQL, SQL Server, MongoDB까지 DB별 내부 동작 원리와 공식 문서 근거를 비교 정리합니다.
author: ydj515
date: 2026-06-11 01:00:00 +0900
categories: [database]
tags: [order-by, oracle, mysql, postgresql, sql-server, mongodb, sorting, pagination, offset-fetch, cursor-pagination]
pin: true
---

`ORDER BY`를 생략한 `SELECT`가 매번 같은 순서로 결과를 반환한다면, 그것은 **보장**이 아니라 **운**입니다.

```sql
-- 이 쿼리의 결과 순서는 보장될까?
SELECT * FROM users;
```

이 글에서는 `ORDER BY`가 없을 때 각 DB가 어떤 순서로 데이터를 반환하는지, 왜 그 순서에 의존하면 안 되는지, 그리고 DB별로 어떤 차이가 있는지 정리합니다. 실제 운영 환경에서 겪은 페이지네이션 중복 조회 사례와 커서 기반 페이지네이션에서 같은 문제가 어떻게 나타나는지도 함께 다룹니다.

다루는 내용:
[SQL 표준](#1-sql-표준은-뭐라고-말하는가),
[DB별 실제 동작](#2-db별-실제-동작-비교),
[DB별 비교 요약](#3-db별-비교-요약),
[순서가 뒤바뀌는 시나리오](#4-순서가-뒤바뀌는-실제-시나리오),
[PK와 ORDER BY 조합](#5-pk-구성과-order-by-조합별-정렬-동작),
[Stable Sort와 Unstable Sort](#6-stable-sort와-unstable-sort),
[결론](#7-실전규칙)

---

## 1. SQL 표준은 뭐라고 말하는가

ANSI SQL 표준(ISO/IEC 9075-2)은 이 점에 대해 명확합니다.

> "If an `<order by clause>` is not specified, then the ordering of the rows of Q is implementation-dependent."

SQL 표준은 쿼리 결과를 **집합(multiset/bag)** 으로 정의합니다. 수학적으로 집합에는 순서가 없습니다. `ORDER BY`가 명시되어야만 결과가 **시퀀스(sequence)** 로 변환되어 순서가 보장됩니다.

즉, `ORDER BY`가 없는 쿼리에서 어떤 순서로 결과가 반환되든 그것은 SQL 표준을 위반하는 것이 아닙니다. 모든 RDBMS가 이 원칙을 따릅니다.

---

## 2. DB별 실제 동작 비교

### 2.1. Oracle

#### 공식 문서

Oracle 공식 문서는 다음과 같이 명시합니다.

> "Use the ORDER BY clause to order the rows selected by a query. Without an ORDER BY clause, **no guarantee exists that the same query executed more than once will retrieve rows in the same order**."
>
> — [Oracle SELECT 문서](https://docs.oracle.com/en/database/oracle/oracle-database/19/sqlrf/SELECT.html)

#### 실제로는 어떻게 동작하는가

Oracle에서 `ORDER BY` 없이 조회할 때 결과 순서는 **옵티마이저가 선택한 실행 계획**에 전적으로 의존합니다.

**Full Table Scan의 경우:**

테이블 전체를 순차적으로 읽기 때문에 데이터 블록에 저장된 물리적 순서(ROWID 순서)대로 반환되는 경향이 있습니다. 하지만 이 순서는 다음 상황에서 변할 수 있습니다.

- 데이터 삭제 후 빈 공간에 새 행이 삽입되는 경우
- `ALTER TABLE ... MOVE`나 세그먼트 재구성이 수행된 경우
- Direct Path INSERT로 HWM(High Water Mark) 이후에 데이터가 적재된 경우

**Index Scan의 경우:**

옵티마이저가 인덱스를 사용하면 해당 인덱스의 정렬 순서대로 결과가 반환됩니다. 하지만 이것은 **인덱스 사용의 부수 효과**이지 정렬 보장이 아닙니다. 옵티마이저가 통계 정보 변경이나 Adaptive Cursor Sharing에 의해 다른 실행 계획을 선택하면 순서는 달라집니다.

**Parallel Query의 경우:**

```sql
SELECT /*+ PARALLEL(users, 4) */ * FROM users;
```

병렬 쿼리가 실행되면 여러 Parallel Slave가 각자 담당한 데이터 범위를 읽고 결과를 병합합니다. 이 병합 과정에서 순서가 섞이므로, 같은 쿼리를 두 번 실행해도 결과 순서가 달라질 수 있습니다.

> Oracle에서는 `ROWNUM`을 사용한 필터링도 `ORDER BY` 없이는 비결정적입니다. `WHERE ROWNUM <= 10`은 "처음 10건"이 아니라 "옵티마이저가 먼저 찾은 아무 10건"을 반환합니다.
{: .prompt-warning }

---

### 2.2. MySQL (InnoDB)

#### 공식 문서

MySQL 공식 문서는 다음과 같이 설명합니다.

> "If you combine LIMIT row_count with ORDER BY, MySQL stops sorting as soon as it has found the first row_count rows of the sorted result... **If ORDER BY is not used, the row order is unspecified.**"
>
> — [MySQL SELECT 문서](https://dev.mysql.com/doc/refman/8.0/en/select.html)

#### 실제로는 어떻게 동작하는가

MySQL의 경우 스토리지 엔진에 따라 동작이 달라집니다.

**InnoDB (기본 엔진):**

InnoDB는 **클러스터형 인덱스(Clustered Index)** 를 사용합니다. 데이터 자체가 PK 순서로 물리적으로 정렬되어 저장됩니다.

```sql
CREATE TABLE users (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50)
);

-- ORDER BY 없이 조회하면 대체로 PK(id) 순서로 반환
SELECT * FROM users;
```

Full Table Scan이 발생하면 클러스터형 인덱스를 순서대로 읽으므로, **대부분의 경우 PK 순서**로 결과가 반환됩니다. 하지만 이것은 InnoDB의 내부 저장 구조에 의한 부수 효과이지, 문서상 보장이 아닙니다.

**보조 인덱스를 사용하는 경우:**

옵티마이저가 보조 인덱스(Secondary Index)를 선택하면 해당 인덱스의 정렬 순서로 결과가 반환됩니다.

```sql
-- name 컬럼에 인덱스가 있고 옵티마이저가 해당 인덱스를 선택하면
-- name 순서로 결과가 반환될 수 있음
SELECT * FROM users WHERE name LIKE 'Kim%';
```

**MySQL 8.0의 GROUP BY 변경:**

MySQL 8.0 이전에는 `GROUP BY`가 **암묵적으로 정렬을 포함**했습니다. 8.0부터 이 동작이 제거되어, `GROUP BY`만으로는 정렬이 보장되지 않습니다.

```sql
-- MySQL 5.7: GROUP BY가 암묵적 ORDER BY를 포함
-- MySQL 8.0: GROUP BY는 정렬을 보장하지 않음
SELECT department, COUNT(*) FROM employees GROUP BY department;

-- 8.0에서 정렬이 필요하면 명시적으로 ORDER BY 추가
SELECT department, COUNT(*) FROM employees GROUP BY department ORDER BY department;
```

> MySQL 5.7에서 8.0으로 업그레이드 후 `GROUP BY` 결과의 순서가 달라져서 장애가 발생한 사례가 적지 않습니다. 암묵적 동작에 의존하지 않아야 하는 대표적인 예시입니다.
{: .prompt-warning }

---

### 2.3. PostgreSQL

#### 공식 문서

PostgreSQL 공식 문서는 다음과 같이 설명합니다.

> "If sorting is not chosen, the rows will be returned in an unspecified order. The actual order in that case will depend on the scan and join plan types and the order on disk, but **it must not be relied on.** A particular output ordering can only be guaranteed if the sort step is explicitly chosen."
>
> — [PostgreSQL SELECT 문서](https://www.postgresql.org/docs/current/sql-select.html)

#### 실제로는 어떻게 동작하는가

PostgreSQL은 다른 DB에 비해 정렬 순서가 **더 예측하기 어렵습니다.** 그 이유는 저장 구조에 있습니다.

**Heap 기반 저장:**

PostgreSQL은 InnoDB와 달리 **힙(Heap) 테이블**을 기본으로 사용합니다. 데이터가 PK 순서로 물리적으로 정렬되어 저장되지 않습니다. 새 행은 빈 공간이 있는 아무 페이지에 삽입될 수 있습니다.

```sql
CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(50)
);

-- PostgreSQL에서 ORDER BY 없는 조회는
-- 행이 저장된 물리적 위치(ctid) 순서로 반환되는 경향이 있지만
-- 이 순서는 수시로 변할 수 있음
SELECT * FROM users;
```

**VACUUM의 영향:**

PostgreSQL의 MVCC는 삭제된 행을 즉시 제거하지 않고 "dead tuple"로 남겨둡니다. `VACUUM`이 실행되면 이 공간이 재활용되면서 새로 삽입되는 행의 물리적 위치가 달라집니다. `VACUUM FULL`은 테이블 전체를 재작성하므로 물리적 순서가 완전히 바뀔 수 있습니다.

```text
-- VACUUM 전
ctid  | id | name
------+----+------
(0,1) |  1 | Alice
(0,2) |  2 | Bob
(0,3) |  3 | Carol

-- DELETE id=2 후 VACUUM, INSERT id=4
ctid  | id | name
------+----+------
(0,1) |  1 | Alice
(0,2) |  4 | Dave    -- 빈 공간 재사용
(0,3) |  3 | Carol
```

**Parallel Sequential Scan:**

대용량 테이블에서 PostgreSQL은 병렬 순차 스캔을 사용합니다. 여러 워커가 서로 다른 블록을 읽고 결과를 모으므로, 실행할 때마다 순서가 달라집니다.

> PostgreSQL은 클러스터형 인덱스를 기본으로 사용하지 않기 때문에, "대체로 PK 순서로 나온다"는 MySQL InnoDB의 경험적 기대조차 통하지 않습니다. PostgreSQL에서 `ORDER BY` 없는 조회의 순서 예측은 사실상 불가능합니다.
{: .prompt-info }

---

### 2.4. SQL Server

#### 공식 문서

SQL Server 공식 문서는 다음과 같이 명시합니다.

> "The order in which rows are returned in a result set are not guaranteed unless an ORDER BY clause is specified."
>
> — [SQL Server ORDER BY 문서](https://learn.microsoft.com/en-us/sql/t-sql/queries/select-order-by-clause-transact-sql)

#### 실제로는 어떻게 동작하는가

**클러스터형 인덱스가 있는 경우:**

SQL Server에서 `PRIMARY KEY`를 지정하면 기본적으로 클러스터형 인덱스가 생성됩니다. Full Table Scan 시 클러스터형 인덱스 순서대로 반환되는 경향이 있지만, 역시 보장되는 것은 아닙니다.

**Heap 테이블의 경우:**

클러스터형 인덱스가 없는 Heap 테이블에서는 페이지 할당 순서에 따라 결과가 반환됩니다.

**OFFSET-FETCH는 ORDER BY 필수:**

SQL Server의 `OFFSET-FETCH` 구문은 `ORDER BY` 없이 사용하면 **문법 오류**가 발생합니다. 이것은 SQL Server가 "정렬 없는 페이지네이션은 의미가 없다"는 점을 문법 레벨에서 강제한 것입니다.

```sql
-- SQL Server: 문법 오류 발생
SELECT * FROM users
OFFSET 10 ROWS FETCH NEXT 10 ROWS ONLY;

-- 반드시 ORDER BY가 있어야 함
SELECT * FROM users
ORDER BY id
OFFSET 10 ROWS FETCH NEXT 10 ROWS ONLY;
```

**TOP은 ORDER BY 없이 사용 가능하지만 비결정적:**

```sql
-- 동작하지만 어떤 10건이 반환될지 보장되지 않음
SELECT TOP 10 * FROM users;
```

> SQL Server가 `OFFSET-FETCH`에 `ORDER BY`를 문법적으로 강제한 것은 다른 DB에서는 볼 수 없는 설계입니다. "정렬 없는 페이지네이션"이라는 잘못된 패턴을 원천 차단합니다.
{: .prompt-tip }

---

### 2.5. MongoDB

#### 공식 문서

MongoDB 공식 문서는 다음과 같이 설명합니다.

> "Unless you specify the sort() method or use the $near operator, MongoDB does not guarantee the order of query results."
>
> — [MongoDB cursor.sort() 문서](https://www.mongodb.com/docs/manual/reference/method/cursor.sort/)

#### 실제로는 어떻게 동작하는가

**Natural Order:**

MongoDB에는 "자연 순서(natural order)"라는 개념이 있습니다. 이것은 문서가 디스크에 저장된 순서를 의미합니다.

```javascript
// sort()가 없으면 자연 순서로 반환
db.users.find();

// $natural을 명시할 수도 있음
db.users.find().sort({ $natural: 1 });
```

**WiredTiger 스토리지 엔진 (기본):**

MongoDB 3.2부터 기본 스토리지 엔진이 WiredTiger로 변경되었습니다. WiredTiger에서 자연 순서는 내부 저장 순서에 의존하며, 문서 크기 변경으로 인한 재배치 등에 의해 삽입 순서와 달라질 수 있습니다.

**Capped Collection:**

유일하게 `Capped Collection`에서는 자연 순서가 **삽입 순서를 보장**합니다.

```javascript
// Capped Collection에서는 자연 순서 = 삽입 순서
db.createCollection("logs", { capped: true, size: 10485760 });
db.logs.find();  // 삽입 순서 보장
```

---

## 3. DB별 비교 요약

| 항목                         | Oracle           | MySQL (InnoDB)             | PostgreSQL             | SQL Server                  | MongoDB                   |
| :--------------------------- | :--------------- | :------------------------- | :--------------------- | :-------------------------- | :------------------------ |
| **순서 보장**                | 보장 없음        | 보장 없음                  | 보장 없음              | 보장 없음                   | 보장 없음                 |
| **경험적 순서**              | ROWID(블록) 순서 | PK(클러스터형 인덱스) 순서 | 물리적 위치(ctid) 순서 | 클러스터형 인덱스 순서      | 자연 순서(내부 저장 순서) |
| **저장 구조**                | Heap + ROWID     | 클러스터형 인덱스          | Heap                   | 클러스터형 인덱스 또는 Heap | WiredTiger B-Tree         |
| **병렬 쿼리 시**             | 순서 무작위      | 순서 변동 가능             | 순서 무작위            | 순서 무작위                 | 해당 없음                 |
| **LIMIT 없이 ORDER BY 강제** | 강제 안 함       | 강제 안 함                 | 강제 안 함             | OFFSET-FETCH는 강제         | 강제 안 함                |
| **GROUP BY 암묵적 정렬**     | 없음             | 8.0부터 제거               | 없음                   | 없음                        | 해당 없음                 |

---

## 4. 순서가 뒤바뀌는 실제 시나리오

"지금까지 잘 되고 있었는데 갑자기 순서가 바뀌었다"는 보통 다음 상황에서 발생합니다.

### 4.1. 통계 정보 갱신으로 실행 계획 변경

```sql
-- 통계 정보 갱신 전: Index Scan → 인덱스 순서로 반환
-- 통계 정보 갱신 후: Full Table Scan → 물리적 순서로 반환
ANALYZE TABLE users;  -- MySQL
ANALYZE users;        -- PostgreSQL
```

옵티마이저가 통계 정보를 기반으로 더 효율적인 실행 계획을 선택하면서 결과 순서가 달라질 수 있습니다.

### 4.2. 데이터 양 증가로 인한 실행 계획 변경

테이블의 데이터가 적을 때는 Full Table Scan이 빨라서 Index Scan을 하지 않다가, 데이터가 늘어나면 Index Scan으로 바뀌는 경우입니다. 반대의 경우도 있습니다.

### 4.3. 인덱스 추가 또는 삭제

```sql
-- 인덱스 추가 전: Full Table Scan → 물리적 순서
-- 인덱스 추가 후: Index Scan → 인덱스 순서
CREATE INDEX idx_users_name ON users(name);
```

### 4.4. DB 버전 업그레이드

앞서 언급한 MySQL 8.0의 `GROUP BY` 암묵적 정렬 제거가 대표적입니다. DB 버전 업그레이드 시 옵티마이저 개선으로 실행 계획이 변경되어 결과 순서가 달라질 수 있습니다.

### 4.5. 병렬 처리 활성화

단일 스레드에서 병렬 처리로 전환되면 결과 순서가 예측 불가능해집니다.

---

## 5. PK 구성과 ORDER BY 조합별 정렬 동작

실무에서 가장 혼동이 많은 부분은 **PK가 있으면 ORDER BY가 없어도 PK 순서로 나오는 것 아닌가?**, **ORDER BY를 지정했으면 정렬이 보장되는 것 아닌가?** 같은 질문입니다.

아래 테이블을 예시로 사용합니다. 실제 운영 환경에서 페이지네이션 중복 조회가 발생했던 구조와 유사합니다.

```sql
CREATE TABLE orders (
    region_code  VARCHAR(10),
    order_type   VARCHAR(10),
    order_seq    INT,
    created_at   DATE,
    product      VARCHAR(100),
    PRIMARY KEY (region_code, order_type, order_seq)
);
```

PK가 `region_code`, `order_type`, `order_seq` 세 컬럼의 복합 키로 구성된 테이블입니다.

### 5.1. PK가 있고 ORDER BY가 없는 경우

```sql
SELECT * FROM orders WHERE region_code = 'KR';
```

| DB                 | 경험적 동작                                        | 보장 여부  |
| :----------------- | :------------------------------------------------- | :--------- |
| **MySQL (InnoDB)** | PK(클러스터형 인덱스) 순서로 반환되는 경향         | 보장 안 됨 |
| **Oracle**         | 인덱스 사용 시 인덱스 순서, Full Scan 시 블록 순서 | 보장 안 됨 |
| **PostgreSQL**     | 물리적 위치(ctid) 순서, PK 순서와 무관             | 보장 안 됨 |
| **SQL Server**     | 클러스터형 인덱스 순서로 반환되는 경향             | 보장 안 됨 |

MySQL InnoDB에서는 PK가 클러스터형 인덱스이므로 대체로 PK 순서가 유지되는 것처럼 보입니다. 하지만 옵티마이저가 보조 인덱스를 선택하거나 병렬 처리가 적용되면 이 순서는 깨집니다.

PostgreSQL은 Heap 기반이므로 PK의 존재와 조회 순서 사이에 **아무 상관관계가 없습니다.** PK 인덱스는 유일성 보장을 위한 것이지, 물리적 저장 순서를 결정하지 않습니다.

> PK가 존재한다는 것은 **데이터의 유일성을 보장하는 것**이지, **조회 순서를 보장하는 것이 아닙니다.** 이 두 가지는 완전히 다른 개념입니다.
{: .prompt-warning }

### 5.2. PK가 있고 ORDER BY에 PK가 아닌 컬럼을 지정한 경우

이 시나리오는 실제 운영 환경에서 페이지네이션 중복 조회 장애를 일으킨 패턴입니다.

**배경:** 조회 API에서 OFFSET/FETCH 기반 페이지네이션을 사용하고 있었습니다. 초기 쿼리에는 `ORDER BY`가 없었는데, 조회 결과를 날짜 최신순으로 보여주기 위해 `ORDER BY`를 추가했습니다.

```sql
-- 수정 전: ORDER BY 없이 운영 (우연히 순서가 일정하게 보였음)
SELECT *
FROM orders
WHERE region_code = 'KR'
OFFSET 0 ROWS FETCH NEXT 20 ROWS ONLY;

-- 수정 후: 날짜 최신순 정렬 추가
SELECT *
FROM orders
WHERE region_code = 'KR'
ORDER BY created_at DESC
OFFSET 0 ROWS FETCH NEXT 20 ROWS ONLY;
```

`ORDER BY`를 추가한 이후, 1페이지와 2페이지 조회 결과에 **동일 데이터가 중복 노출**되는 현상이 발생했습니다.

**원인:** `created_at`이 같은 행이 여러 건 존재했기 때문입니다.

```text
-- 데이터 예시: created_at이 동일한 행이 30건 이상
region_code | order_type | order_seq | created_at | product
KR          | A          | 1         | 2026-06-01 | 키보드
KR          | A          | 2         | 2026-06-01 | 마우스
KR          | B          | 1         | 2026-06-01 | 모니터
KR          | B          | 2         | 2026-06-01 | 헤드셋
...         | ...        | ...       | 2026-06-01 | ...
```

`ORDER BY created_at DESC`는 **날짜 순서만 결정**합니다. 같은 날짜를 가진 30건의 행 사이의 순서는 DB가 자유롭게 결정합니다.

```text
-- 1차 조회 (1페이지, 20건)
KR-A-1, KR-A-2, KR-B-1, KR-B-2, ... KR-C-5

-- 2차 조회 (2페이지, 20건)
KR-B-2, KR-C-5, ...  ← 1페이지에 있던 데이터가 다시 등장
```

페이지 경계에 있는 동일 `created_at` 데이터의 순서가 실행마다 달라지면서, **1페이지에서 조회된 데이터가 2페이지에서 다시 조회**됩니다.

그렇다면 기존에 `ORDER BY`가 없었을 때는 왜 문제가 없었을까요? 당시에는 실행 계획, 인덱스 접근 경로, 데이터 상태 등에 의해 **우연히 같은 순서로 조회되었을 가능성이 높습니다.** 문제가 없었던 것이 아니라 **문제가 드러나지 않았던 상태**였습니다.

> `ORDER BY`에 PK가 아닌 컬럼만 지정하면, 해당 컬럼 값이 중복될 때 **정렬이 비결정적**이 됩니다. 페이지네이션에서는 중복 조회 또는 데이터 누락으로 이어집니다.
{: .prompt-warning }

### 5.3. PK가 있고 ORDER BY에 PK를 포함한 경우

```sql
SELECT *
FROM orders
WHERE region_code = 'KR'
ORDER BY created_at DESC, region_code ASC, order_type ASC, order_seq ASC
OFFSET 0 ROWS FETCH NEXT 20 ROWS ONLY;
```

이 경우 정렬 순서가 **완전히 결정적**입니다.

1. 먼저 `created_at DESC`로 날짜 기준 최신순 정렬
2. 날짜가 같으면 `region_code ASC`로 정렬
3. `region_code`도 같으면 `order_type ASC`로 정렬
4. `order_type`도 같으면 `order_seq ASC`로 정렬

PK 조합이 유일하므로, 4단계까지 도달하면 모든 행의 순서가 하나로 확정됩니다. 동일 쿼리를 아무리 반복해도 같은 순서가 나옵니다.

```text
-- 항상 동일한 결과
1페이지: KR-A-1, KR-A-2, KR-B-1, KR-B-2, ... KR-C-5
2페이지: KR-C-6, KR-C-7, KR-D-1, KR-D-2, ... KR-E-3
```

> 위 5.2의 페이지네이션 중복 조회 이슈의 해결 방법이 바로 이것이었습니다. `ORDER BY created_at DESC, region_code ASC, order_type ASC, order_seq ASC`로 PK를 tie-breaker에 포함시켜 정렬을 결정적으로 만드는 것입니다.
{: .prompt-tip }

### 5.4. 커서 기반 페이지네이션도 ORDER BY 전체를 커서에 포함해야 한다

OFFSET/FETCH가 아니라 커서 기반으로 바꾸면 문제가 사라질 것처럼 보일 수 있습니다. 하지만 커서가 `created_at`처럼 중복 가능한 값만 기준으로 잡혀 있다면 여전히 안전하지 않습니다.

```sql
-- 1페이지 조회
SELECT *
FROM orders
WHERE region_code = 'KR'
ORDER BY created_at DESC
LIMIT 20;
```

첫 페이지가 다음처럼 조회되었다고 가정합니다.

```text
-- 1차 조회 (1페이지, 20건)
KR-A-1, KR-A-2, KR-B-1, KR-B-2, ... KR-C-5

-- 마지막 행의 커서
created_at = 2026-06-01
```

이제 다음 페이지를 조회하기 위해 마지막 행의 `created_at`을 커서로 사용합니다.

```sql
-- 2페이지 조회: created_at만 커서로 사용하는 경우
SELECT *
FROM orders
WHERE region_code = 'KR'
  AND created_at < DATE '2026-06-01'
ORDER BY created_at DESC
LIMIT 20;
```

이 쿼리는 `created_at = '2026-06-01'`인 나머지 행을 모두 건너뜁니다.

```text
-- 실제 데이터에는 아직 같은 날짜의 행이 남아 있음
KR-C-6, KR-C-7, KR-D-1, KR-D-2, ... KR-E-3  -- 누락됨

-- 2차 조회 결과
KR-F-1, KR-F-2, ...  -- 2026-05-31 이하 데이터부터 조회됨
```

누락을 피하려고 조건을 `created_at <= DATE '2026-06-01'`로 바꾸면 반대로 중복이 발생할 수 있습니다.

```sql
-- 2페이지 조회: <= 를 사용하면 이전 페이지 데이터가 다시 포함될 수 있음
SELECT *
FROM orders
WHERE region_code = 'KR'
  AND created_at <= DATE '2026-06-01'
ORDER BY created_at DESC
LIMIT 20;
```

```text
-- 2차 조회 결과
KR-A-2, KR-B-1, KR-C-5, ...  -- 1페이지에 있던 데이터가 다시 등장 가능
```

커서 기반 페이지네이션에서도 해결책은 동일합니다. 정렬 기준과 커서 조건이 모두 **유일하게 결정적인 순서**를 사용해야 합니다.

```sql
-- 1페이지 조회: 정렬 기준에 PK tie-breaker 포함
SELECT *
FROM orders
WHERE region_code = 'KR'
ORDER BY created_at DESC, order_type ASC, order_seq ASC
LIMIT 20;
```

```text
-- 1차 조회 (1페이지, 20건)
KR-A-1, KR-A-2, KR-B-1, KR-B-2, ... KR-C-5

-- 마지막 행의 커서
created_at = 2026-06-01
order_type = C
order_seq = 5
```

다음 페이지는 `created_at`뿐 아니라 같은 날짜 안에서의 PK 순서까지 함께 비교해야 합니다.

```sql
-- 2페이지 조회: created_at + PK tie-breaker를 함께 커서로 사용
SELECT *
FROM orders
WHERE region_code = 'KR'
  AND (
    created_at < DATE '2026-06-01'
    OR (
      created_at = DATE '2026-06-01'
      AND (
        order_type > 'C'
        OR (order_type = 'C' AND order_seq > 5)
      )
    )
  )
ORDER BY created_at DESC, order_type ASC, order_seq ASC
LIMIT 20;
```

```text
-- 2차 조회 (2페이지, 20건)
KR-C-6, KR-C-7, KR-D-1, KR-D-2, ... KR-E-3
```

즉, 커서 기반 페이지네이션의 핵심은 **OFFSET을 없애는 것**이 아니라, 커서가 `ORDER BY`의 결정적 정렬 기준 전체를 표현하도록 만드는 것입니다.

### 5.5. PK가 없고 ORDER BY가 없는 경우

```sql
CREATE TABLE temp_logs (
    message    TEXT,
    created_at TIMESTAMP
);

SELECT * FROM temp_logs;
```

PK도 없고 `ORDER BY`도 없으면 **가장 예측 불가능한 상태**입니다.

| DB                 | 동작                                                                                                                       |
| :----------------- | :------------------------------------------------------------------------------------------------------------------------- |
| **MySQL (InnoDB)** | 숨겨진 클러스터형 인덱스(`GEN_CLUST_INDEX`)의 `ROW_ID` 순서. 내부 카운터 기반이라 삽입 순서와 대체로 일치하지만 보장 안 됨 |
| **Oracle**         | 블록 저장 순서. 삭제/재삽입 시 순서 변동                                                                                   |
| **PostgreSQL**     | Heap 저장 순서. VACUUM 후 완전히 달라질 수 있음                                                                            |
| **SQL Server**     | Heap 테이블의 IAM(Index Allocation Map) 페이지 할당 순서. 삽입 순서와 다를 수 있음                                         |

> PK가 없는 테이블에서 `ORDER BY` 없이 순서에 의존하는 것은 **모든 DB에서 가장 위험한 패턴**입니다.
{: .prompt-danger }

### 5.6. PK가 있고 ORDER BY에 PK만 지정한 경우

```sql
SELECT *
FROM orders
ORDER BY region_code ASC, order_type ASC, order_seq ASC
OFFSET 0 ROWS FETCH NEXT 20 ROWS ONLY;
```

이 경우도 정렬은 완전히 결정적입니다. PK 자체가 유일성을 보장하므로 tie-breaker가 필요 없습니다.

다만 비즈니스 요구사항이 "최신순 정렬"이라면 `ORDER BY`에 정렬 목적 컬럼을 먼저 두고 PK를 뒤에 추가하는 것이 일반적입니다.

```sql
-- 비즈니스 정렬 + PK tie-breaker
ORDER BY created_at DESC, region_code ASC, order_type ASC, order_seq ASC
```

### 5.7. 조합별 정리

| 시나리오                        | ORDER BY     | 정렬 결정성 | 페이지네이션 안전 |
| :------------------------------ | :----------- | :---------- | :---------------- |
| PK 있음, ORDER BY 없음          | 없음         | 비결정적    | 안전하지 않음     |
| PK 있음, ORDER BY에 비PK 컬럼만 | 중복 가능 값 | 비결정적    | 안전하지 않음     |
| PK 있음, ORDER BY에 PK 포함     | 유일값 포함  | **결정적**  | **안전**          |
| PK 있음, ORDER BY에 PK만        | PK만         | **결정적**  | **안전**          |
| PK 없음, ORDER BY 없음          | 없음         | 비결정적    | 안전하지 않음     |
| PK 없음, ORDER BY에 비유일 컬럼 | 중복 가능 값 | 비결정적    | 안전하지 않음     |

> 결론은 단순합니다. `ORDER BY`의 마지막 정렬 기준이 **행을 유일하게 식별할 수 있는 컬럼(PK 또는 Unique Key)을 포함**하는지가 핵심입니다.
{: .prompt-tip }

---

## 6. Stable Sort와 Unstable Sort

`ORDER BY`를 명시하더라도 정렬 기준 컬럼에 **동일한 값이 존재**하면, 동일 값을 가진 행들 사이의 상대적 순서는 보장되지 않습니다. 이것은 대부분의 DB가 **불안정 정렬(Unstable Sort)** 을 사용하기 때문입니다.

| 정렬 방식         | 동작                         | 설명                      |
| :---------------- | :--------------------------- | :------------------------ |
| **Stable Sort**   | 동일 값의 상대적 순서 유지   | 입력 순서가 그대로 유지됨 |
| **Unstable Sort** | 동일 값의 상대적 순서 미보장 | 실행마다 달라질 수 있음   |

```sql
-- created_at이 같은 행이 여러 건이면
-- 그 행들 사이의 순서는 매번 달라질 수 있음
SELECT * FROM orders ORDER BY created_at DESC;
```

앞서 5.2에서 다룬 페이지네이션 중복 조회 이슈가 정확히 이 상황입니다. `ORDER BY`가 있어도 정렬 기준이 유일하지 않으면 페이지네이션에서 중복이 발생합니다.

해결은 정렬 기준의 마지막에 **유일성을 보장하는 컬럼(PK 등)** 을 추가하는 것입니다.

```sql
-- 불안정 정렬 문제 해결: PK를 tie-breaker로 추가
SELECT * FROM orders
ORDER BY created_at DESC, region_code ASC, order_type ASC, order_seq ASC
OFFSET 0 ROWS FETCH NEXT 20 ROWS ONLY;
```

---

## 7. 실전규칙

### 규칙 1: ORDER BY 없이 순서에 의존하지 않는다

```sql
-- 잘못된 예: ORDER BY 없이 "첫 번째 행"을 기대
SELECT * FROM users LIMIT 1;

-- 올바른 예: 명시적으로 어떤 기준의 "첫 번째"인지 정의
SELECT * FROM users ORDER BY id ASC LIMIT 1;
```

### 규칙 2: 페이지네이션에는 결정적 정렬을 사용한다

```sql
-- 잘못된 예: 중복 가능한 값으로만 정렬
SELECT * FROM products ORDER BY created_at DESC LIMIT 20 OFFSET 40;

-- 올바른 예: PK를 tie-breaker로 추가
SELECT * FROM products ORDER BY created_at DESC, id ASC LIMIT 20 OFFSET 40;
```

### 규칙 3: "지금 잘 되고 있다"를 신뢰하지 않는다

현재 결과 순서가 일정하더라도, 그것은 현재의 실행 계획, 데이터 분포, 물리적 저장 순서에 의한 우연입니다. 다음 상황 중 하나라도 발생하면 순서는 바뀔 수 있습니다.

- 통계 정보 갱신
- 데이터 증가 또는 삭제
- 인덱스 변경
- DB 버전 업그레이드
- 서버 재시작
- 병렬 처리 활성화

### 규칙 4: DB별 특성을 알되 의존하지 않는다

| 상황                       | 경험적 동작 | 의존해도 되는가 |
| :------------------------- | :---------- | :-------------- |
| InnoDB Full Table Scan     | PK 순서     | 안 됨           |
| Oracle Index Scan          | 인덱스 순서 | 안 됨           |
| PostgreSQL Sequential Scan | ctid 순서   | 안 됨           |
| MongoDB find()             | 자연 순서   | 안 됨           |

---

## 정리

`ORDER BY`가 없는 쿼리의 결과 순서는 **모든 DB에서 보장되지 않습니다.** 이것은 SQL 표준의 명확한 규정이고, Oracle, MySQL, PostgreSQL, SQL Server, MongoDB 모두 공식 문서에서 이 점을 명시하고 있습니다.

실무에서 순서가 일정하게 보이는 것은 현재의 실행 계획과 데이터 상태에 의한 우연이며, 통계 갱신, 인덱스 변경, 데이터 증감, 병렬 처리 등 어떤 변화에 의해서든 깨질 수 있습니다.

> 결과의 순서가 필요하다면 반드시 `ORDER BY`를 명시하고, 페이지네이션이라면 정렬 기준이 **유일하게 결정적**인지까지 확인해야 합니다.
{: .prompt-tip }

---

## 출처

- [ISO/IEC 9075-2:2023 - SQL Standard](https://www.iso.org/standard/76584.html)
- [Oracle 공식 문서 - SELECT](https://docs.oracle.com/en/database/oracle/oracle-database/19/sqlrf/SELECT.html)
- [MySQL 공식 문서 - SELECT](https://dev.mysql.com/doc/refman/8.0/en/select.html)
- [MySQL 공식 문서 - LIMIT Optimization](https://dev.mysql.com/doc/refman/8.0/en/limit-optimization.html)
- [PostgreSQL 공식 문서 - SELECT](https://www.postgresql.org/docs/current/sql-select.html)
- [PostgreSQL 공식 문서 - Sorting Rows](https://www.postgresql.org/docs/current/queries-order.html)
- [SQL Server 공식 문서 - ORDER BY](https://learn.microsoft.com/en-us/sql/t-sql/queries/select-order-by-clause-transact-sql)
- [MongoDB 공식 문서 - cursor.sort()](https://www.mongodb.com/docs/manual/reference/method/cursor.sort/)
