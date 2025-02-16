---
title: Lock in database
description: transaction isolation level, mvcc, lock..
author: ydj515
date: 2024-12-27 11:33:00 +0800
categories: [lock, mysql]
tags: [lock, mysql, mvcc, transaction, isolation level]
pin: true
math: true
mermaid: true
image:
  path: /assets/img/lock/logo.png
  lqip: data:image/webp;base64,UklGRpoAAABXRUJQVlA4WAoAAAAQAAAADwAABwAAQUxQSDIAAAARL0AmbZurmr57yyIiqE8oiG0bejIYEQTgqiDA9vqnsUSI6H+oAERp2HZ65qP/VIAWAFZQOCBCAAAA8AEAnQEqEAAIAAVAfCWkAALp8sF8rgRgAP7o9FDvMCkMde9PK7euH5M1m6VWoDXf2FkP3BqV0ZYbO6NA/VFIAAAA
  alt: lock
---

## 트랜잭션 격리 수준과 Lock
트랜잭션 격리 수준과 Lock에 대해 설명한다. 특히 mysql 기준으로 작성되었다.


## 트랜잭션 격리 수준(Transaction Isolation level)
트랜잭션 격리 수준은 여러 트랜잭션이 동시에 실행될 때, 서로 간섭하지 않도록 데이터를 격리하는 정도를 정의합니다. SQL 표준에서는 다음과 같은 4가지 격리 수준을 정의합니다.

### 1. Read Uncommitted (읽기 미완료)
- **설명**:
  - 다른 트랜잭션이 아직 커밋하지 않은 데이터를 읽을 수 있습니다.
  - 가장 낮은 격리 수준으로, **Dirty Read** 문제가 발생할 수 있습니다.
  
  >Dirty Read란?  
  커밋되지 않은 트랜잭션에 접근해 아직 정상 반영되지 않은 데이터를 읽는 현상
  {: .prompt-info }

  - dirty read 발생 예시
    ```sql
    -- 트랜잭션 A
    START TRANSACTION;
    UPDATE accounts SET balance = balance - 100 WHERE id = 1;

    -- 트랜잭션 B
    START TRANSACTION;
    SELECT balance FROM accounts WHERE id = 1; -- Dirty Read 가능

    -- 트랜잭션 A 롤백
    ROLLBACK;
    ```

- **특징**:
  - 성능이 가장 좋음.
  - 데이터 무결성 보장이 약함.
- **문제**:
  - Dirty Read: 트랜잭션 A가 변경한 내용을 트랜잭션 B가 읽었으나, A가 롤백하면 잘못된 데이터를 읽은 상황 발생.

```sql
SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
```

### 2. Read Committed (읽기 완료)
- **설명**:
    - 다른 트랜잭션이 커밋한 데이터만 읽을 수 있습니다.
    - MySQL에서는 기본적으로 InnoDB가 사용하는 격리 수준입니다.
- **특징**:
    - Dirty Read 방지.
    - Non-Repeatable Read 문제가 발생할 수 있음.
- **문제**:
    - Non-Repeatable Read: 같은 트랜잭션 내에서 같은 데이터를 읽을 때 값이 달라질 수 있음.

```sql
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;
```

- non-repeatable read 발생 예시

```sql
-- 트랜잭션 A
START TRANSACTION;
SELECT balance FROM accounts WHERE id = 1;

-- 트랜잭션 B
START TRANSACTION;
UPDATE accounts SET balance = balance - 50 WHERE id = 1;
COMMIT;

-- 트랜잭션 A에서 같은 쿼리 실행
SELECT balance FROM accounts WHERE id = 1; -- 결과가 달라짐
```

### 3. Repeatable Read (반복 읽기)
- **설명**:
    - 동일한 트랜잭션 내에서 같은 데이터를 반복해서 읽을 때 항상 동일한 결과를 보장합니다.
    - MySQL InnoDB의 기본 격리 수준입니다.
- **특징**:
    - Non-Repeatable Read 방지.
    - Phantom Read 문제가 발생할 수 있음.
- **문제**:
    - Phantom Read: 한 트랜잭션 내에서 동일한 조건으로 조회했을 때, 다른 트랜잭션의 삽입으로 인해 추가된 행이 나타남.
    
    > MySQL 에서는 Phantom Read 가 발생하지 않음.  
    InnoDB 엔진에 의해 `select ~ for update` 구문을 지원, Next Key Lock 형태의 배타락을 지원하기 때문
    {: .prompt-info }

```sql
SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;
```

- phantom read 발생 예시

```sql
-- 트랜잭션 A
START TRANSACTION;
SELECT * FROM products WHERE price > 100;

-- 트랜잭션 B
START TRANSACTION;
INSERT INTO products (id, name, price) VALUES (4, 'NewProduct', 150);
COMMIT;

-- 트랜잭션 A에서 같은 쿼리 실행
SELECT * FROM products WHERE price > 100; -- 새로운 데이터가 나타남
```

### 4. Serializable (직렬화)
- **설명**:
    - 가장 높은 격리 수준으로, 트랜잭션을 순차적으로 실행하여 완벽한 데이터 무결성을 보장합니다.
- **특징**:
    - Dirty Read, Non-Repeatable Read, Phantom Read 모두 방지.
    - 성능 저하가 가장 큼.
- **적용**:
    - 높은 무결성이 필요한 환경에서 사용.

```sql
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
```

- 완전한 직렬화 예시

```sql
-- 트랜잭션 A
START TRANSACTION;
SELECT balance FROM accounts WHERE id = 1;

-- 트랜잭션 B
START TRANSACTION;
UPDATE accounts SET balance = balance - 50 WHERE id = 1; -- 대기 상태 발생
```


### 트랜잭션 격리 수준 비교

| 격리 수준        | Dirty Read | Non-Repeatable Read | Phantom Read          | 성능      |
| ---------------- | ---------- | ------------------- | --------------------- | --------- |
| Read Uncommitted | 허용       | 허용                | 허용                  | 높음      |
| Read Committed   | 방지       | 허용                | 허용                  | 보통      |
| Repeatable Read  | 방지       | 방지                | 허용->mysql은 안생김. | 낮음      |
| Serializable     | 방지       | 방지                | 방지                  | 매우 낮음 |


## Lock
트랜잭션 격리 수준을 구현하기 위해 Lock 메커니즘이 사용됩니다. MySQL에서는 여러 종류의 Lock이 존재하며, 데이터 동시성을 유지하고 충돌을 방지하기 위해 활용됩니다.

### Lock 종류

### Shared Lock (S Lock, 공유 락)
데이터를 읽기 위해 사용됩니다. 여러 트랜잭션이 동시에 읽을 수 있습니다.

다른 트랜잭션의 쓰기 작업을 방지합니다.

```sql
SELECT * FROM table_name LOCK IN SHARE MODE;
```

### Exclusive Lock (X Lock, 배타 락)
데이터를 수정하기 위해 사용됩니다. 다른 트랜잭션이 읽기나 쓰기 작업을 할 수 없습니다.

```sql
SELECT * FROM table_name FOR UPDATE;
```

### Deadlock (교착 상태)
두 트랜잭션이 서로 상대방이 보유한 리소스를 기다리면서 무한 대기 상태에 빠지는 상황입니다.

**데드락을 방지 하기 위해서는 트랜잭션 순서 조정, 락 타임아웃 설정, 짧은 트랜잭션 유지를 하여야합니다.**


## InnoDB의 Lock 구현 방식
MySQL InnoDB는 레코드 기반 락을 사용합니다. `Row Lock`을 하여 행 단위로 락을 설정하여 병행성을 높이며, `Gap Lock`을 이용해 새로운 레코드 삽입을 방지합니다. (`Phantom Read 방지`)

## **Lock**
트랜잭션 격리 수준을 구현하기 위해 Lock 메커니즘이 사용됩니다. MySQL에서는 여러 종류의 Lock이 존재하며, 데이터 동시성을 유지하고 충돌을 방지하기 위해 활용됩니다.

### Shared Lock ( 공유락 )
    - 데이터를 읽을 때 사용하는 Lock
    - 공유 Lock 끼리는 여러 사용자가 동시에 `읽기` 가 가능
    - 공유 Lock 이 먼저 설정된 데이터에는 배타 Lock 을 사용하는 것이 불가능

### Exclusive Lock ( 배타락 )
    - 데이터를 변경할 때 사용하는 Lock
    - 트랜잭션이 완료될 때까지 유지됨 ( e.g. select for update )
    - 배타 Lock 이 적용되어 있다면 다른 트랜잭션은 해당 리소스에 접근하지 못하고 대기
    - 배타 Lock 은 이미 다른 트랜잭션 내에서 사용하고 있는 데이터에 대해 접근해 Lock 을 설정할 수 없음

## **트랜잭션 격리 수준**

- **Uncommitted Read** ( 커밋되지 않은 읽기 )
    - 다른 트랜잭션에서 커밋되지 않은 데이터에도 접근할 수 있게 해주는 격리 수준
    - `DirtyRead` - 커밋되지 않은 트랜잭션에 접근해 아직 정상 반영되지 않은 데이터를 읽는 현상( 해당 데이터는 롤백되어 없어질 수도 있다 )
- **Committed Read** ( 커밋된 읽기 )
    - 다른 트랜잭션에서 커밋된 데이터에만 접근할 수 있게 해주는 격리 수준
    - `Non-Repeatable Read` - 하나의 트랜잭션에서 동일한 SELECT 쿼리를 실행했을 때 커밋 전의 데이터, 커밋 된 후의 데이터가 읽히면서 다른 결과가 조회되는 현상
- **Repeatable Read** ( 반복 가능한 읽기 )
    - 커밋된 데이터만 읽을 수 있으며, 자신보다 빨리 수행된 트랜잭션에서 커밋한 데이터만 읽을 수 있는 격리 수준
    - **MVCC** 를 통해 Undo 로그를 기반으로 동일한 데이터가 조회되도록 보장 ( Non-Repeatable Read 문제 해결 )
    - 이를 지원하지 않는 DB (e.g. OracleDB ) 에서는 배타 락을 이용해 문제를 해결
    - `Phantom Read` - 하나의 트랜잭션 내에서 동일한 SELECT 쿼리의 결과 레코드 수가 달라지는 현상
            
        > MySQL 에서는 Phantom Read 가 발생하지 않음  
        => InnoDB 엔진에 의해 `select ~ for update` 구문을 지원, Next Key Lock 형태의 배타락을 지원하기 때문
        {: .prompt-tip }
            
- **Serealizable**
    - 모든 트랜잭션을 순차적으로 실행시키는 격리 수준
    - 트랜잭션이 서로 끼어들 수 있는 상황이 없으므로 데이터의 부정합 문제는 발생하지 않음
    - 위 특성 때문에 트랜잭션이 동기적으로 처리되면서 처리속도 저하가 발생
    - 트랜잭션이 개입하려는 시도 ( e.g. shared Lock 으로 조회 후 Update 하려고 하는 경우 )  대기상태가 되므로 데드락 문제가 발생함


[참조]  
https://velog.io/@fishphobiagg/MySQL-%ED%8A%B8%EB%9E%9C%EC%9E%AD%EC%85%98-%EA%B2%A9%EB%A6%AC-%EC%88%98%EC%A4%80-InnoDB-Locking\