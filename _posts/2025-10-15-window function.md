---
title: WindowFunction
description: WindowFunction
author: ydj515
date: 2025-10-15 11:33:00 +0800
categories: [database, WindowFunction]
tags: [database, WindowFunction]
pin: true
math: true
mermaid: true
image:
  path: /assets/img/sql/logo.png
  lqip: data:image/webp;base64,UklGRpoAAABXRUJQVlA4WAoAAAAQAAAADwAABwAAQUxQSDIAAAARL0AmbZurmr57yyIiqE8oiG0bejIYEQTgqiDA9vqnsUSI6H+oAERp2HZ65qP/VIAWAFZQOCBCAAAA8AEAnQEqEAAIAAVAfCWkAALp8sF8rgRgAP7o9FDvMCkMde9PK7euH5M1m6VWoDXf2FkP3BqV0ZYbO6NA/VFIAAAA
  alt: sql
---

## 윈도우 함수란?

윈도우 함수는 "집계는 하되 행은 유지"합니다. `OVER` 절로 **계산 범위(윈도우)** 를 지정하고, 계산 결과는 기존 행 옆에 새 컬럼처럼 붙습니다. 덕분에 집계 결과를 다른 칼럼들과 함께 비교하거나, 누적 값·순위처럼 **컨텍스트가 필요한 계산**을 아주 쉽게 할 수 있습니다.

```sql
sql_function() OVER (
    PARTITION BY <그룹 기준>
    ORDER BY <정렬 기준>
    [ROWS | RANGE | GROUPS BETWEEN ...]
)
```

| 구문                    | 역할                                                                        |
| ----------------------- | --------------------------------------------------------------------------- |
| `PARTITION BY`          | 파티션(그룹) 기준을 정합니다. 부서별, 사용자별 등으로 나눌 때 사용합니다.   |
| `ORDER BY`              | 파티션 내부에서의 정렬 기준을 정합니다. 누적 합계나 순위 계산에 필수입니다. |
| `ROWS / RANGE / GROUPS` | 현재 행을 중심으로 어떤 범위를 포함할지 세밀하게 정의합니다.                |

윈도우 함수는 Oracle 8i, SQL Server 2005, PostgreSQL 8.4, MySQL 8.0.2, MariaDB 10.2 이상에서 사용할 수 있습니다.

## GROUP BY 와 무엇이 다른가요?
`GROUP BY` 는 그룹당 **딱 한 행**만 남기고 나머지를 묶어버립니다. 반면 윈도우 함수는 원본 행을 그대로 유지한 채 결과만 덧붙입니다.

```sql
-- GROUP BY
SELECT dept_id, SUM(salary) AS total_salary
FROM employees
GROUP BY dept_id;
```

| dept_id | total_salary |
| ------- | ------------ |
| 10      | 15000        |
| 20      | 20000        |

```sql
-- Window Function
SELECT
  emp_name,
  dept_id,
  salary,
  SUM(salary) OVER (PARTITION BY dept_id) AS total_salary
FROM employees;
```

| emp_name | dept_id | salary | total_salary |
| -------- | ------- | ------ | ------------ |
| Alice    | 10      | 8000   | 15000        |
| Bob      | 10      | 7000   | 15000        |
| Carol    | 20      | 9000   | 20000        |
| Dave     | 20      | 11000  | 20000        |

같은 부서 합계를 구하면서도 각 사원의 기본 정보가 함께 남아 있으니, 보고서에 바로 써먹기 좋습니다.

## 샘플 데이터 소개

다음 두 개 테이블을 사용하겠습니다.

- `account(id bigint, iban varchar(255), owner varchar(255))`
- `account_transaction(id bigint, account_id bigint, created_on timestamp, amount bigint)`  
  ↳ `account_transaction.account_id` 는 `account.id` 를 참조합니다.

테스트용 데이터는 아래 표처럼 준비했습니다.

| id  | account_id | created_on          | amount |
| --- | ---------- | ------------------- | ------ |
| 1   | 1          | 2019-10-13 12:23:00 | 2560   |
| 2   | 1          | 2019-10-14 13:23:00 | -200   |
| 3   | 1          | 2019-10-14 13:23:00 | 500    |
| 4   | 1          | 2019-10-15 10:15:00 | -1850  |
| 5   | 2          | 2019-10-13 15:23:00 | 2560   |
| 6   | 2          | 2019-10-13 15:23:00 | 300    |
| 7   | 2          | 2019-10-14 14:45:00 | -500   |
| 8   | 2          | 2019-10-15 10:15:00 | -150   |

중복된 타임스탬프가 포함되어 있어 `RANGE` 와 `ROWS` 의 차이를 체감하기에 딱 좋습니다.

---

## 윈도우 프레임

윈도우 함수의 핵심은 프레임(Frame) 설정입니다. 기본적으로 `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW` 가 설정되어, 현재 행과 같은 `ORDER BY` 값을 가진 행이 모두 포함됩니다.

| 키워드   | 설명                                                                                      |
| -------- | ----------------------------------------------------------------------------------------- |
| `ROWS`   | 물리적인 행 단위로 프레임을 지정합니다. "이전 두 행 + 다음 한 행" 같은 계산에 사용합니다. |
| `RANGE`  | 정렬 값 기준으로 범위를 묶습니다. 동일한 정렬 값이 여러 행이면 한꺼번에 포함합니다.       |
| `GROUPS` | 동일한 정렬 값을 하나의 그룹으로 취급합니다. 날짜 등으로 묶어서 계산할 때 유용합니다.     |

### 기본 프레임 동작

```sql
SELECT
  id,
  account_id,
  created_on,
  COUNT(*) OVER (
    PARTITION BY account_id
    ORDER BY created_on
  ) AS row_count
FROM account_transaction;
```

| id  | account_id | created_on          | row_count |
| --- | ---------- | ------------------- | --------- |
| 1   | 1          | 2019-10-13 12:23:00 | 1         |
| 2   | 1          | 2019-10-14 13:23:00 | 3         |
| 3   | 1          | 2019-10-14 13:23:00 | 3         |
| 4   | 1          | 2019-10-15 10:15:00 | 4         |
| 5   | 2          | 2019-10-13 15:23:00 | 2         |
| 6   | 2          | 2019-10-13 15:23:00 | 2         |
| 7   | 2          | 2019-10-14 14:45:00 | 3         |
| 8   | 2          | 2019-10-15 10:15:00 | 4         |

동일 타임스탬프인 2·3행, 5·6행이 동시에 프레임에 들어와 카운트가 3 또는 2로 뜨는 것을 확인할 수 있습니다. 이런 중복을 피하고 싶다면 정렬 키에 `id` 도 함께 넣어 `ROWS` 기반으로 바꿔주면 됩니다.

```sql
SELECT
  id,
  account_id,
  created_on,
  COUNT(*) OVER (
    PARTITION BY account_id
    ORDER BY created_on, id
  ) AS row_count
FROM account_transaction;
```

| id  | account_id | created_on          | row_count |
| --- | ---------- | ------------------- | --------- |
| 1   | 1          | 2019-10-13 12:23:00 | 1         |
| 2   | 1          | 2019-10-14 13:23:00 | 2         |
| 3   | 1          | 2019-10-14 13:23:00 | 3         |
| 4   | 1          | 2019-10-15 10:15:00 | 4         |
| 5   | 2          | 2019-10-13 15:23:00 | 1         |
| 6   | 2          | 2019-10-13 15:23:00 | 2         |
| 7   | 2          | 2019-10-14 14:45:00 | 3         |
| 8   | 2          | 2019-10-15 10:15:00 | 4         |

### 파티션 전체를 보고 싶다면?

```sql
COUNT(*) OVER (
  PARTITION BY account_id
  ORDER BY created_on
  ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
) AS row_count
```

| id  | account_id | created_on          | row_count |
| --- | ---------- | ------------------- | --------- |
| 1   | 1          | 2019-10-13 12:23:00 | 4         |
| 2   | 1          | 2019-10-14 13:23:00 | 4         |
| 3   | 1          | 2019-10-14 13:23:00 | 4         |
| 4   | 1          | 2019-10-15 10:15:00 | 4         |
| 5   | 2          | 2019-10-13 15:23:00 | 4         |
| 6   | 2          | 2019-10-13 15:23:00 | 4         |
| 7   | 2          | 2019-10-14 14:45:00 | 4         |
| 8   | 2          | 2019-10-15 10:15:00 | 4         |

프레임을 파티션 전체로 잡았기 때문에 항상 4가 반환됩니다.

### 자주 쓰는 프레임 패턴

- `ROWS BETWEEN 2 PRECEDING AND 1 FOLLOWING` : 현재 행 기준으로 앞 2개, 뒤 1개를 포함합니다.
- `GROUPS BETWEEN CURRENT ROW AND CURRENT ROW` : 동일 정렬 값을 하나의 그룹으로 묶어 그 그룹만 계산합니다.
- `RANGE BETWEEN CURRENT ROW AND INTERVAL '3' HOUR FOLLOWING` : 타임스탬프를 기준으로 3시간 이내 데이터를 포함합니다.

예시로 `ROWS BETWEEN 2 PRECEDING AND 1 FOLLOWING` 을 적용하면 아래처럼 나옵니다.

| id  | account_id | created_on          | row_count |
| --- | ---------- | ------------------- | --------- |
| 1   | 1          | 2019-10-13 12:23:00 | 2         |
| 2   | 1          | 2019-10-14 13:23:00 | 3         |
| 3   | 1          | 2019-10-14 13:23:00 | 4         |
| 4   | 1          | 2019-10-15 10:15:00 | 3         |
| 5   | 2          | 2019-10-13 15:23:00 | 2         |
| 6   | 2          | 2019-10-13 15:23:00 | 3         |
| 7   | 2          | 2019-10-14 14:45:00 | 4         |
| 8   | 2          | 2019-10-15 10:15:00 | 3         |

---

## EXCLUDE 절로 프레임 다듬기
프레임을 잡은 뒤에도 `EXCLUDE` 를 사용하면 특정 행을 제외할 수 있습니다.

| 옵션            | 설명                                       |
| --------------- | ------------------------------------------ |
| `NO OTHERS`     | 아무 행도 제외하지 않습니다(기본값).       |
| `CURRENT ROW`   | 현재 행을 제외합니다.                      |
| `CURRENT GROUP` | 현재 그룹(동일 정렬 값)을 제외합니다.      |
| `TIES`          | 동점인 행은 제외하지만 현재 행은 남깁니다. |

예를 들어 `ROWS BETWEEN 2 PRECEDING AND 1 FOLLOWING EXCLUDE CURRENT ROW` 를 쓰면 현재 행 없이 이웃 행만 집계합니다.

| id  | account_id | created_on          | row_count |
| --- | ---------- | ------------------- | --------- |
| 1   | 1          | 2019-10-13 12:23:00 | 1         |
| 2   | 1          | 2019-10-14 13:23:00 | 2         |
| 3   | 1          | 2019-10-14 13:23:00 | 3         |
| 4   | 1          | 2019-10-15 10:15:00 | 2         |
| 5   | 2          | 2019-10-13 15:23:00 | 1         |
| 6   | 2          | 2019-10-13 15:23:00 | 2         |
| 7   | 2          | 2019-10-14 14:45:00 | 3         |
| 8   | 2          | 2019-10-15 10:15:00 | 2         |

`GROUPS` 모드에서 `EXCLUDE CURRENT GROUP` 을 쓰면 동일 날짜(동료 레코드)를 제거한 상태로 이전/다음 날짜를 합산할 수 있습니다.

| id  | account_id | created_on          | row_count |
| --- | ---------- | ------------------- | --------- |
| 1   | 1          | 2019-10-13 12:23:00 | 3         |
| 2   | 1          | 2019-10-14 13:23:00 | 2         |
| 3   | 1          | 2019-10-14 13:23:00 | 2         |
| 4   | 1          | 2019-10-15 10:15:00 | 2         |
| 5   | 2          | 2019-10-13 15:23:00 | 2         |
| 6   | 2          | 2019-10-13 15:23:00 | 2         |
| 7   | 2          | 2019-10-14 14:45:00 | 3         |
| 8   | 2          | 2019-10-15 10:15:00 | 1         |

`EXCLUDE TIES` 는 동점만 쏙 빼고 현재 행만 남길 때 쓰는데, 다음과 같이 중복 타임스탬프가 있는 경우 유용합니다.

| id  | account_id | created_on          | row_count |
| --- | ---------- | ------------------- | --------- |
| 1   | 1          | 2019-10-13 12:23:00 | 1         |
| 2   | 1          | 2019-10-14 13:23:00 | 2         |
| 3   | 1          | 2019-10-14 13:23:00 | 1         |
| 4   | 1          | 2019-10-15 10:15:00 | 2         |
| 5   | 2          | 2019-10-13 15:23:00 | 1         |
| 6   | 2          | 2019-10-13 15:23:00 | 1         |
| 7   | 2          | 2019-10-14 14:45:00 | 2         |
| 8   | 2          | 2019-10-15 10:15:00 | 2         |

---

## 실전 예제 모음
이제부터는 대표적인 윈도우 함수를 실제로 적용해보며 데이터가 어떻게 변하는지 살펴보겠습니다.

### 1. 누적 잔고 계산 – `SUM` + 기본 프레임

```sql
SELECT
  id,
  account_id,
  created_on,
  amount,
  SUM(amount) OVER (
    PARTITION BY account_id
    ORDER BY created_on
  ) AS balance
FROM account_transaction
ORDER BY id;
```

| id  | account_id | created_on          | amount | balance |
| --- | ---------- | ------------------- | ------ | ------- |
| 1   | 1          | 2019-10-13 12:23:00 | 2560   | 2560    |
| 2   | 1          | 2019-10-14 13:23:00 | -200   | 2360    |
| 3   | 1          | 2019-10-14 13:23:00 | 500    | 2860    |
| 4   | 1          | 2019-10-15 10:15:00 | -1850  | 1010    |
| 5   | 2          | 2019-10-13 15:23:00 | 2560   | 2560    |
| 6   | 2          | 2019-10-13 15:23:00 | 300    | 2860    |
| 7   | 2          | 2019-10-14 14:45:00 | -500   | 2360    |
| 8   | 2          | 2019-10-15 10:15:00 | -150   | 2210    |

재무 대시보드에서 "입출금 내역 + 잔액"을 한 번에 보여주고 싶을 때 바로 사용할 수 있는 패턴입니다.

### 2. 주차별 거래 번호 – `ROW_NUMBER`

```sql
SELECT
  id,
  amount,
  EXTRACT(WEEK FROM created_on) AS week_number,
  ROW_NUMBER() OVER (
    PARTITION BY EXTRACT(WEEK FROM created_on)
    ORDER BY created_on
  ) AS transaction_number
FROM account_transaction
WHERE account_id = 1
ORDER BY id;
```

| id  | amount | week_number | transaction_number |
| --- | ------ | ----------- | ------------------ |
| 1   | 2560   | 41          | 1                  |
| 2   | -200   | 42          | 1                  |
| 3   | 500    | 42          | 2                  |
| 4   | -1850  | 42          | 3                  |

주차마다 번호가 다시 1부터 시작하는 것을 확인할 수 있습니다.

### 3. 순위 매기기 – `RANK` vs `DENSE_RANK`

```sql
SELECT
  id,
  amount,
  EXTRACT(WEEK FROM created_on) AS week_number,
  RANK() OVER (
    PARTITION BY EXTRACT(WEEK FROM created_on)
    ORDER BY amount DESC
  ) AS transaction_ranking
FROM account_transaction
ORDER BY week_number, transaction_ranking, account_id;
```

| id  | account_id | amount | week_number | transaction_ranking |
| --- | ---------- | ------ | ----------- | ------------------- |
| 1   | 1          | 2560   | 41          | 1                   |
| 5   | 2          | 2560   | 41          | 1                   |
| 6   | 2          | 300    | 41          | 3                   |
| 3   | 1          | 500    | 42          | 1                   |
| 8   | 2          | -150   | 42          | 2                   |
| 2   | 1          | -200   | 42          | 3                   |
| 7   | 2          | -500   | 42          | 4                   |
| 4   | 1          | -1850  | 42          | 5                   |

동점이 있으면 순서가 건너뜁니다. 건너뛰지 않고 연속 순위를 주고 싶다면 `DENSE_RANK()` 를 사용하면 됩니다.

| id  | account_id | amount | week_number | transaction_ranking |
| --- | ---------- | ------ | ----------- | ------------------- |
| 1   | 1          | 2560   | 41          | 1                   |
| 5   | 2          | 2560   | 41          | 1                   |
| 6   | 2          | 300    | 41          | 2                   |
| 3   | 1          | 500    | 42          | 1                   |
| 8   | 2          | -150   | 42          | 2                   |
| 2   | 1          | -200   | 42          | 3                   |
| 7   | 2          | -500   | 42          | 4                   |
| 4   | 1          | -1850  | 42          | 5                   |

### 4. 이전/다음 값 참조 – `LAG`, `LEAD`

```sql
SELECT
  id,
  created_on,
  LAG(created_on, 1) OVER (
    PARTITION BY account_id
    ORDER BY created_on
  ) AS prev_timestamp,
  LEAD(created_on, 1) OVER (
    PARTITION BY account_id
    ORDER BY created_on
  ) AS next_timestamp
FROM account_transaction
ORDER BY id;
```

| id  | created_on          | prev_timestamp      | next_timestamp      |
| --- | ------------------- | ------------------- | ------------------- |
| 1   | 2019-10-13 12:23:00 | NULL                | 2019-10-14 13:23:00 |
| 2   | 2019-10-14 13:23:00 | 2019-10-13 12:23:00 | 2019-10-14 13:23:00 |
| 3   | 2019-10-14 13:23:00 | 2019-10-14 13:23:00 | 2019-10-15 10:15:00 |
| 4   | 2019-10-15 10:15:00 | 2019-10-14 13:23:00 | NULL                |
| 5   | 2019-10-13 15:23:00 | NULL                | 2019-10-13 15:23:00 |
| 6   | 2019-10-13 15:23:00 | 2019-10-13 15:23:00 | 2019-10-14 14:45:00 |
| 7   | 2019-10-14 14:45:00 | 2019-10-13 15:23:00 | 2019-10-15 10:15:00 |
| 8   | 2019-10-15 10:15:00 | 2019-10-14 14:45:00 | NULL                |

### 5. 첫 거래부터 지난 시간 – `FIRST_VALUE`, `LAST_VALUE`

```sql
SELECT
  id,
  account_id,
  created_on - FIRST_VALUE(created_on) OVER (
    PARTITION BY account_id
    ORDER BY created_on
    RANGE BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
  ) AS since_first_transaction,
  LAST_VALUE(created_on) OVER (
    PARTITION BY account_id
    ORDER BY created_on
    RANGE BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
  ) - created_on AS until_last_transaction
FROM account_transaction
ORDER BY id;
```

| id  | account_id | created_on          | since_first_transaction | until_last_transaction |
| --- | ---------- | ------------------- | ----------------------- | ---------------------- |
| 1   | 1          | 2019-10-13 12:23:00 | 00:00:00                | 1 day 21:52:00         |
| 2   | 1          | 2019-10-14 13:23:00 | 1 day 01:00:00          | 20:52:00               |
| 3   | 1          | 2019-10-14 13:23:00 | 1 day 01:00:00          | 20:52:00               |
| 4   | 1          | 2019-10-15 10:15:00 | 1 day 21:52:00          | 00:00:00               |
| 5   | 2          | 2019-10-13 15:23:00 | 00:00:00                | 1 day 18:52:00         |
| 6   | 2          | 2019-10-13 15:23:00 | 00:00:00                | 1 day 18:52:00         |
| 7   | 2          | 2019-10-14 14:45:00 | 23:22:00                | 19:30:00               |
| 8   | 2          | 2019-10-15 10:15:00 | 1 day 18:52:00          | 00:00:00               |

### 6. 백분위수 – `PERCENTILE_CONT`, `PERCENTILE_DISC`

```sql
SELECT
  account_id,
  PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY amount) AS median,
  PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY amount) AS p75,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY amount) AS p95,
  PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY amount) AS p99
FROM account_transaction
GROUP BY account_id
ORDER BY account_id;
```

| account_id | median | p75    | p95    | p99    |
| ---------- | ------ | ------ | ------ | ------ |
| 1          | 150.0  | 1015.0 | 2251.0 | 2498.2 |
| 2          | 75.0   | 865.0  | 2221.0 | 2492.2 |

`PERCENTILE_DISC` 는 실제 데이터 중에서 가장 가까운 값을 고릅니다.

| account_id | median | p75 | p95  | p99  |
| ---------- | ------ | --- | ---- | ---- |
| 1          | -200   | 500 | 2560 | 2560 |
| 2          | -150   | 300 | 2560 | 2560 |

참고로 정규 분포에서 평균 ±1σ 는 약 68.26%, ±2σ 는 95.44%, ±3σ 는 99.74%, ±4σ 는 99.87% 를 포함합니다.

### 7. 누적 분포와 상대 순위 – `CUME_DIST`, `PERCENT_RANK`

```sql
SELECT
  id,
  amount,
  CUME_DIST() OVER (
    PARTITION BY account_id
    ORDER BY amount
  ) AS cumulative_dist,
  PERCENT_RANK() OVER (
    PARTITION BY account_id
    ORDER BY amount
  ) AS percentage_rank
FROM account_transaction
ORDER BY account_id, amount;
```

| account_id | id  | amount | cumulative_dist | percentage_rank |
| ---------- | --- | ------ | --------------- | --------------- |
| 1          | 4   | -1850  | 0.25            | 0.0             |
| 1          | 2   | -200   | 0.50            | 0.33333333      |
| 1          | 3   | 500    | 0.75            | 0.66666667      |
| 1          | 1   | 2560   | 1.00            | 1.0             |
| 2          | 7   | -500   | 0.25            | 0.0             |
| 2          | 8   | -150   | 0.50            | 0.33333333      |
| 2          | 6   | 300    | 0.75            | 0.66666667      |
| 2          | 5   | 2560   | 1.00            | 1.0             |

### 8. 데이터를 버킷으로 나누기 – `NTILE`

```sql
SELECT
  id,
  amount,
  NTILE(3) OVER (
    PARTITION BY account_id
    ORDER BY amount
  ) AS tertile_rank
FROM account_transaction
ORDER BY account_id, tertile_rank;
```

| account_id | id  | amount | tertile_rank |
| ---------- | --- | ------ | ------------ |
| 1          | 4   | -1850  | 1            |
| 1          | 2   | -200   | 2            |
| 1          | 3   | 500    | 3            |
| 1          | 1   | 2560   | 3            |
| 2          | 7   | -500   | 1            |
| 2          | 8   | -150   | 2            |
| 2          | 6   | 300    | 3            |
| 2          | 5   | 2560   | 3            |

정확히 나눠떨어지지 않으면 앞쪽 버킷부터 하나씩 더 배정된다는 점도 확인할 수 있습니다.

## 결론

윈도우 함수는 "행을 잃지 않는 집계"를 가능하게 해주는 강력한 도구입니다. 누적 합계, 시계열 비교, 상대 순위, 백분위 분석 등 데이터 분석 작업에서 반복적으로 등장하는 요구사항을 모두 해결할 수 있습니다.  
