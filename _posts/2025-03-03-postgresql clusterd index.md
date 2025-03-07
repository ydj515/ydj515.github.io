---
title: postgresql가 mysql보다 좋은점(feat. clustered index)
description: innoDB의 pk는 clustered index기 때문에
author: ydj515
date: 2025-03-03 11:33:00 +0800
categories: [mysql, postgresql, database, index, clustered index]
tags: [mysql, postgresql, rdb, database, clustered index, index, troubleshooting]
pin: true
math: true
mermaid: true
image:
  path: /assets/img/postgresql/logo.png
  lqip: data:image/webp;base64,UklGRpoAAABXRUJQVlA4WAoAAAAQAAAADwAABwAAQUxQSDIAAAARL0AmbZurmr57yyIiqE8oiG0bejIYEQTgqiDA9vqnsUSI6H+oAERp2HZ65qP/VIAWAFZQOCBCAAAA8AEAnQEqEAAIAAVAfCWkAALp8sF8rgRgAP7o9FDvMCkMde9PK7euH5M1m6VWoDXf2FkP3BqV0ZYbO6NA/VFIAAAA
  alt: postgresql
---

## PostgreSQL을 선택해야 하는 이유 중 하나는 PK 때문.

PostgreSQL과 MySQL은 둘 다 널리 사용되는 오픈 소스 관계형 데이터베이스 관리 시스템(RDBMS)이지만, 내부 구조와 확장성에서 큰 차이를 보입니다. 특히 MySQL(InnoDB)의 PK는 Clustered Index 구조를 가집니다. 반면에 PostgreSQL의 PK는  Non-Clustered Index 입니다.

**이러한 특징의 차이를 토대로 PostgreSQL을 선택해야하는 이유를 자세히 설명합니다.**

## Index 유형
우선 index의 유형은 크게 두개로 나눌 수 있습니다. 여기서 말하는 index 유형이란 index의 속성(unique index 등..)을 이야기하는 것이 아닙니다.

> Unique Index란?  
> 인덱스가 걸린 컬럼의 값이 **고유(Unique)** 하도록 강제하는 제약 조건을 가지게 하는 index의 속성입니다.  
> 중복된 값을 방지하여 데이터 무결성을 보장하며 PK는 기본적으로 Unique Index입니다.
> **Unique Index는 Clustered Index 또는 Non-Clustered Index의 속성**일 뿐, 별도의 새로운 인덱스 유형이 아닙니다.
{:.prompt-info}


## Clustered Index

Clustered Index는 데이터 자체를 정렬된 상태로 저장하는 인덱스입니다.
**즉, 기본 키(Primary Key, PK)가 clustered index로 지정되면, 테이블의 행 데이터 자체가 해당 PK 순서대로 디스크에 저장됩니다.**
이말은 인덱스의 정렬 순서가 곧 **실제 데이터 저장 순서**와 일치한다는 뜻입니다.

따라서, 한 테이블에서 데이터의 물리적 정렬 순서를 두 개 이상 유지하는 것은 불가능하기 때문에 하나의 테이블은 하나의 clustered index만 허용됩니다.

InnoDB의 경우 테이블을 생성할 때 PK 제약조건을 지정하면, 자동으로 clustered index로 지정되어 데이터가 자동으로 정렬됩니다.

Clustered Index는 트리 구조로 저장되며, **Root 페이지와 Leaf 페이지**로 구성됩니다. Root 페이지는 Leaf 페이지의 주소로 이루어지며, Leaf 페이지는 실제 데이터 페이지로 구성됩니다. 따라서, **추가적인 저장소에 인덱스 페이지를 생성하지 않습니다.**

clustered index를 지정한 컬럼을 기준으로 테이블의 데이터가 정렬되기 때문에 조회 성능이 우수하지만, **데이터 추가(INSERT), 수정(UPDATE), 삭제(DELETE) 시 매번 레코드를 정렬해야 하므로 성능이 저하될 수 있습니다.**

예를 들어보겠습니다.

| **ID** | **Name** |
| ------ | -------- |
| 1      | Alice    |
| 3      | Bob      |
| 5      | Carol    |

이 상태에서 ID=2인 데이터를 삽입하면, ID가 3 이상인 데이터가 모두 이동해야 하므로 삽입 비용이 증가합니다.

즉, **PK를 어떤 컬럼으로 설정하는가에 따라 데이터베이스 성능이 좌우**될 수 있습니다.

> 그래서 MySQL INNODB에서 ID를 PK로 설정하고 AUTO_INCREMENT 옵션을 설정하는 이유입니다.

아래의 테이블을 보겠습니다.

```sql
CREATE TABLE user (
  email VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255)
);
```

email이 중복될 수 없기에 PK로 지정하였지만, MySQL(InnoDB)에서는 **PK가 자동으로 Clustered Index가 됩니다.** 즉, "a"로 시작하는 email을 가진 사용자를 추가하면 **전체 레코드가 한 칸씩 이동**해야 하며, 이는 극심한 성능 저하를 유발할 수 있습니다.

따라서 우리는 ID라는 별도의 필드를 PK로 설정하고 `AUTO_INCREMENT` 옵션을 사용하여 Clustered Index에서 발생할 수 있는 문제를 방지하는 것입니다.
또한, PK 값이 지속적으로 증가하므로 Clustered Index에서 페이지 분할 가능성이 줄어듭니다.

### Clustered Index 구조
Clustered Index는 B-Tree(Balanced Tree) 구조를 기반으로 하며, 데이터 자체를 정렬하여 저장합니다.

> **B-Tree 구조 개요**  
- Root 노드 -> 최상위 노드, 검색 시작점  
- Branch 노드 -> 하위 노드로 연결되는 경로 제공  
- Leaf 노드 -> 실제 데이터가 저장되는 위치  
{:.prompt-info}

즉, Root 노드에서 시작하여 Branch 노드를 따라 이동하며, Leaf 노드에서 최종 데이터를 찾는 방식입니다.

### Clustered Index 동작 방식

1.  PK를 기준으로 데이터를 정렬하여 저장
    - InnoDB에서는 기본적으로 테이블의 PK를 Clustered Index로 설정합니다.
    - 따라서 PK 값이 증가하는 순서대로 데이터가 디스크에 물리적으로 정렬됩니다.

2. 데이터 조회 시 인덱스 트리 탐색
    - Root 노드에서 시작해 Branch 노드를 거쳐 Leaf 노드에 도달하여 원하는 데이터를 찾습니다.
    - PK 기반 검색 시 빠른 조회가 가능하지만, PK가 아닌 컬럼을 조건으로 검색할 경우 Secondary Index를 추가로 탐색해야 하므로 성능이 저하될 수 있습니다.

3. 데이터 삽입/삭제 시 재정렬 발생
    - 새 데이터가 들어올 때 PK 순서대로 배치해야 하므로, 기존 데이터가 이동하는 비용이 발생할 수 있습니다.
    - 특히 중간에 새로운 PK 값이 삽입되면 Leaf 페이지가 분할(Split)되면서 성능 저하를 유발할 가능성이 있습니다.

### Clustered Index 특징

- 테이블당 1개만 허용
- 물리적으로 레코드를 배열
- InnoDB에서는 PK 설정 시 해당 컬럼이 Clustered Index가 됨
- 데이터 검색 속도는 빠르지만, 데이터 추가/수정/삭제 성능 저하
- Root 페이지 > Leaf 페이지(데이터 페이지) 순서로 검색 수행
- 인덱스의 리프 페이지가 곧 데이터. 테이블 자체가 인덱스 이기 때문에 따로 인덱스 페이지를 만들지 않음

### Clustered Index 장점

- 테이블 데이터가 자주 업데이트되지 않는 경우
  - 데이터 변경이 적을 때 클러스터드 인덱스의 효율성이 높음.
- 범위 조회나 Group By 쿼리 시 유리
  - MAX, MIN, COUNT 등의 쿼리를 활용한 범위 조회나 Group By 작업에서 성능이 뛰어남.
- 정렬된 데이터 반환이 필요한 경우
  - 테이블이 이미 정렬되어 있으므로 ORDER BY 절을 사용해 효율적으로 데이터를 조회할 수 있음. 전체 테이블을 스캔하지 않고 원하는 데이터만 조회 가능.
- 읽기 작업이 많은 경우
  - 읽기 작업이 많은 환경에서 클러스터드 인덱스는 매우 빠른 조회 성능을 제공함.


### Clustered Index 단점

- 페이지 분할로 인한 성능 저하
  - 리프 페이지가 모두 차있을 때 새로운 데이터가 추가되면 페이지 분할이 발생. 이때 기존 데이터의 절반이 새로운 페이지로 이동하고 새로운 행이 추가되므로, 인덱스 생성/수정/삭제 시 페이지 분할과 재정렬로 인해 성능이 저하됨.
- 순서 유지 필요
  - 클러스터드 인덱스는 항상 데이터를 정렬된 순서로 저장해야 하므로, 데이터가 추가될 때마다 이 순서를 유지해야 한다는 제약이 있음. 이로 인해 삽입 및 삭제 작업이 복잡해질 수 있음.


## Non-Clustered Index

Non-Clustered Index는 **레코드의 원본을 정렬하지 않고, 별도의 장소에 인덱스 페이지를 생성하는 방식**입니다.
즉, 데이터 자체는 정렬되지 않으며, 인덱스 페이지에 정렬된 키 값과 해당 데이터를 가리키는 포인터(Row Identifier, RID)가 저장됩니다.

### Non-Clustered Index 구조

Non-Clustered Index 역시 B-Tree 구조를 따릅니다.

> **B-Tree 구조 개요**  
- Root 노드 -> 최상위 노드, 검색 시작점  
- Branch 노드 -> 하위 노드로 연결되는 경로 제공  
- Leaf 노드 -> 인덱스 값과 데이터 위치(RID) 저장  
{:.prompt-info}

즉, Root 노드에서 시작하여 Branch 노드를 따라 이동하며, Leaf 노드에서 데이터의 실제 위치를 확인한 후 해당 데이터를 조회하는 방식입니다.

### Non-Clustered Index 동작 방식

1. **인덱스 테이블을 생성하고, 인덱스 키 값과 데이터 위치(RID) 저장**
    - Non-Clustered Index는 데이터 자체가 아닌, 키 값과 해당 데이터를 가리키는 포인터(RID)를 저장합니다.
    - **이 포인터(RID)는 "파일 그룹 번호 + 데이터 페이지 번호 + 페이지 내 로우 번호" 로 구성됩니다.**
2. **조회 시 B-Tree 탐색 후 원본 데이터 접근 (Index Lookup 발생)**
    - Root 노드에서 시작해 Branch 노드를 거쳐 Leaf 노드에서 인덱스 값을 찾습니다.
    - Leaf 노드에는 실제 데이터가 있는 위치(RID)가 저장되므로, 다시 원본 데이터를 조회하는 과정이 필요합니다.
    - Clustered Index보다 한 단계 더 조회가 필요하기 때문에 상대적으로 성능이 낮습니다.
3. **데이터 변경(INSERT, UPDATE, DELETE) 시 인덱스만 업데이트됨**
    - Clustered Index는 데이터 자체를 정렬해야 하지만, Non-Clustered Index는 인덱스만 변경하면 되므로 삽입/수정/삭제가 상대적으로 빠릅니다.
    - 하지만, PK가 변경되거나 데이터가 재배열될 경우 Non-Clustered Index도 업데이트해야 하는 비용이 발생합니다.

### Non-Clustered Index 특징

- 테이블당 여러 개 생성 가능 (약 240개까지 가능)
- 데이터 자체는 정렬되지 않으며, 인덱스 페이지에 정렬된 키 값과 데이터 위치(RID)를 저장
- Clustered Index보다 검색 속도가 느리지만, 데이터 변경(INSERT, UPDATE, DELETE)에 유리
- Root 페이지 -> Leaf 페이지(인덱스 값 + RID) -> 데이터 페이지(Heap Page) 순서로 검색 수행
- Clustered Index 변경 시 해당 Non-Clustered Index도 업데이트됨

### Non-Clustered Index 장점

- 조건문을 활용한 필터링에 적합
  - WHERE 절이나 JOIN 절을 통한 조건 필터링에 효과적이며, 특정 컬럼의 빠른 조회를 지원함.
- 데이터 변경이 자주 발생하는 경우 유리
  - 데이터가 자주 변경되는 환경에서 클러스터드 인덱스보다 성능이 좋을 수 있음.
- 특정 컬럼이 자주 사용되는 쿼리에서 효과적
  - 자주 사용되는 컬럼에 인덱스를 적용하면 쿼리 성능을 향상시킬 수 있음.

### Non-Clustered Index 단점

- 추가 저장 공간 필요
  - 논클러스터드 인덱스는 인덱스 페이지를 별도로 저장해야 하므로 추가적인 저장 공간이 소모됨.
- 데이터 접근 속도가 클러스터드 인덱스보다 느림
  - 데이터가 논클러스터드 인덱스에 의존할 경우, 클러스터드 인덱스보다 상대적으로 데이터 접근 속도가 낮음.
- 클러스터드 인덱스 변경 시 연쇄적 업데이트 필요
  - 클러스터드 인덱스가 변경되면, 해당하는 논클러스터드 인덱스도 함께 업데이트되어야 하므로, 추가적인 리소스가 소모됨.

## clustered index vs. non-clustered index

clustered index와  non-clustered index를 간단히 비교한 표입니다.

| 비교 항목          | Clustered Index                                      | Non-Clustered Index                          |
| ------------------ | ---------------------------------------------------- | -------------------------------------------- |
| 데이터 저장 방식   | PK 순서대로 물리적 순서로 저장                       | 데이터는 그대로, 인덱스만 별도 저장          |
| 데이터 정렬 방식   | 인덱스 순서 == 데이터 저장 순서                      | 인덱스 순서 != 데이터 저장 순서              |
| 조회 성능          | PK 검색 시, 범위검색(PK기준으로 군집되어있어서) 빠름 | Index Lookup으로 한 단계 더 조회 필요        |
| 삽입/삭제 비용     | 데이터 재정렬 발생 가능                              | 인덱스만 업데이트하면 되므로 상대적으로 빠름 |
| 인덱스 개수        | 테이블당 1개만 가능                                  | 여러 개 생성 가능 (최대 240개)               |
| 데이터 페이지 접근 | B-Tree 탐색 후 Leaf 노드에서 바로 데이터 조회        | B-Tree 탐색 후 RID를 통해 원본 데이터 조회   |


Clustered Index는 데이터 자체가 정렬된 상태로 저장되기 때문에 PK 기반 검색이 매우 빠르지만, 데이터 삽입/삭제 시 정렬 유지 비용이 발생합니다.

반면 Non-Clustered Index는 데이터 자체는 정렬되지 않고, 인덱스만 별도로 저장되기 때문에 데이터 변경이 빈번한 경우 유리하지만, 조회 시 추가적인 Lookup 비용이 발생합니다.

**따라서, 조회 성능이 중요한 경우 Clustered Index를 활용하고, 특정 컬럼의 빠른 조회를 위해 Non-Clustered Index를 병행하여 사용하는 것이 일반적인 최적화 전략입니다.**

## MySQL(InnoDB)과 PostgreSQL의 인덱스 구조 비교
맨 위에서 언급했듯이, MySQL(InnoDB)의 PK는 Clustered Index, PostgreSQL의 PK는 Non clustered Index 구조 입니다.

> PostgreSQL에서 Primary Key(PK)는 **자동으로 유니크 인덱스(Unique Index)**를 생성하는데, 이 인덱스는 Non-Clustered Index로 유지됩니다.

| 비교 항목          | MySQL(InnoDB)                     | PostgreSQL                                     |
| ------------------ | --------------------------------- | ---------------------------------------------- |
| 기본 인덱스 구조   | Clustered Index (B-Tree)          | Non Clustered Index(Heap Table + B-Tree Index) |
| PK 변경 시 영향    | 데이터 재배열 발생                | 데이터 물리적 재배열 없음                      |
| Secondary Index    | PK를 포함 (추가 조회 필요)        | PK를 강제 포함하지 않음                        |
| 대용량 데이터 관리 | 페이지 분할로 인해 성능 저하 가능 | TOAST 기능 제공으로 효율적 저장                |

## postgres가 Non-Clustered Index를 유지하는 이유와 장점
그렇다면 postgres가 Non-Clustered Index를 유지하는 이유와 장점을 설명합니다.

1. 데이터 저장 방식이 독립적이다.
   - PostgreSQL의 데이터는 Heap Table에 저장됨 -> 테이블 자체가 특정 인덱스와 직접 연결되지 않습니다. 즉, PK에 의존하지 않고도 데이터를 독립적으로 저장 및 정렬 가능합니다.
   - MySQL(InnoDB)의 Clustered Index 방식과 다르게, PostgreSQL에서는 PK 변경(예: REINDEX)과 테이블의 물리적 저장 순서가 독립적입니다.

2. 모든 인덱스가 동등하게 동작 (Flexible Index Strategy)
   - Clustered Index 방식(MySQL InnoDB)에서는 PK 기반 정렬이 강제됩니다. 즉, PK를 기준으로 한 검색은 빠르지만, 다른 인덱스 검색 시 성능이 떨어질 수 있습니다.
   - 반면, PostgreSQL은 모든 인덱스가 독립적이므로, PK뿐만 아니라 다른 인덱스들도 균형적으로 활용됨. 즉, 다양한 쿼리 패턴에서도 고르게 좋은 성능을 낼 수 있습니다.

3. UPDATE 시 성능 저하가 적음
   - MySQL(InnoDB)의 Clustered Index는 PK 변경(예: UPDATE id SET id = new_value)이 비효율적.
   - PK 값이 변경되면 데이터 페이지의 재정렬이 발생 -> 성능 저하 📉
   - PostgreSQL에서는 PK가 Non-Clustered이므로, PK 변경 시 인덱스만 수정하면 됨.
   - 따라서 PK 변경이 잦은 시스템에서는 PostgreSQL이 유리함.

4. HOT(Heap-Only Tuple) 최적화 활용 가능
    - PostgreSQL은 HOT(Heap-Only Tuple) 최적화를 제공하는데, Non-Clustered Index 구조이기 때문에 가능함.

> HOT 최적화란?  
> PK가 바뀌지 않는 UPDATE의 경우, 새로운 row를 만들지 않고 기존 row를 재사용합니다.  
> 이를 통해 불필요한 TOAST/Tuple 복사 비용을 줄일 수 있습니다.  
> 즉, MySQL InnoDB의 Clustered Index 방식에서는 이런 최적화가 어렵거나 불가능합니다.
{:.prompt-info}

다만 이러한 Non-Clustered Indexs는 당연하게도 단점 또한 존재합니다.


1. PK 기반 Range Scan 성능이 다소 떨어질 수 있음
   - MySQL의 Clustered Index는 데이터가 PK 기준으로 정렬되기 때문에 PK 기반 Range Scan이 빠릅니다.
   - PostgreSQL에서는 PK를 기준으로 테이블이 정렬되지 않으므로, 추가적인 디스크 접근이 발생할 수 있습니다.

2. Insert 시 테이블 정렬 유지 불가
   - MySQL InnoDB는 PK 순서대로 데이터가 정렬되므로, 순차 INSERT가 빠를 수 있습니다.
   - PostgreSQL에서는 Heap Table에 INSERT가 발생하면 랜덤한 위치에 저장될 수 있음 -> Vacuum과 Autovacuum이 필요합니다.

> Vacuum과 Autovacuum이 뭔가요?  
> PostgreSQL에서 VACUUM과 Autovacuum은 **MVCC (Multi-Version Concurrency Control)**로 인해 발생하는 불필요한 데이터를 정리하는 역할을 합니다.  
> 자세한건 아래에서 다루겠습니다.
{:.prompt-info}

### VACUUM

PostgreSQL은 DELETE나 UPDATE를 수행할 때 기존 데이터를 바로 삭제하지 않고 **"죽은 튜플(dead tuple)"** 로 남겨둡니다.

이렇게 남은 불필요한 데이터를 정리하는 작업이 바로 VACUUM입니다.

- VACUUM 종류
    1. VACUUM
       - 단순히 삭제된 튜플을 정리하지만, 디스크 공간을 반환하지 않음
       - 성능 저하를 방지하기 위해 주기적으로 수행해야 함
    2. VACUUM FULL
       - 기존 테이블을 완전히 재작성(Rewrite) 하면서 디스크 공간을 회수
       - 하지만 성능 부담이 크고, 테이블을 잠금(Lock) 처리하므로 신중히 사용해야 함

### Autovacuum이란?

Autovacuum은 PostgreSQL이 자동으로 VACUUM을 실행하는 백그라운드 프로세스입니다. 기본적으로 활성화(enabled) 되어 있으며 일정 기준(튜플 삭제/갱신량 등)에 따라 자동으로 VACUUM 실행합니다.

또한 autovacuum_vacuum_threshold 등의 설정을 통해 실행 기준 조정 가능합니다.

- Autovacuum이 필요한 이유
  1. 수동으로 VACUUM을 실행하면 운영 부담이 크기 때문
  2. 죽은 튜플이 계속 쌓이면 쿼리 성능 저하 발생
  3. 일정 수준 이상 증가하면 데이터베이스 부하 증가 및 디스크 공간 낭비
  4. 자동으로 실행되므로 운영자가 직접 관리할 필요가 줄어듦

> PostgreSQL에서는 INSERT, UPDATE, DELETE가 많을 경우 Autovacuum을 통해 자동으로 정리되지만, 성능 최적화를 위해 때때로 수동 VACUUM 또는 VACUUM FULL을 실행하는 것이 필요합니다. 
{:.prompt-tip}

## PostgreSQL의 물리적 레코드 저장 방식

PostgreSQL에서는 테이블 레코드가 PK나 다른 인덱스의 정렬과 무관하게, 단순히 INSERT된 순서대로 저장되지 않습니다.

**즉, MySQL InnoDB처럼 PK 기반 정렬을 유지하지 않지만, 단순히 INSERT 순서로 저장되는 것도 아닙니다.**

그렇다면 ,Postgresql의 물리적 저장방식은 어떤방식일까요?

PostgreSQL은 Heap Table 구조를 사용하여 데이터를 저장합니다.

MySQL InnoDB와 달리, Clustered Index가 없으므로 PK 순서를 유지하지 않습니다.

즉, **새로운 레코드는 단순한 삽입 순서가 아니라, 기존 테이블의 빈 공간(FSM, Free Space Map)을 우선적으로 사용하여 저장됩니다.**

### Heap Table 저장 방식의 동작 과정

위에서 언급한 heap table 저장 방식의 동작과 정은 아래와 같습니다.

1. 초기 INSERT 시: 테이블이 비어 있으면, 단순히 순서대로 저장됨.
2. DELETE 후 INSERT 시: 삭제된 공간이 있으면, 그 공간을 먼저 재사용.
3. UPDATE 시: 기존 데이터를 직접 변경하지 않고, 새로운 공간에 INSERT하고 기존 데이터는 DEAD TUPLE이 됨.
4. VACUUM 실행 후 INSERT 시: 정리된 공간이 있다면 우선적으로 사용.

### MySQL vs PostgreSQL 저장 방식 비교

|                        | **MySQL InnoDB (Clustered Index)**                             | **PostgreSQL (Heap Table)**                                          |
| ---------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------- |
| **물리적 저장 순서**   | PK 기준으로 정렬됨                                             | 인덱스와 무관, 빈 공간을 우선 재사용                                 |
| **중간 삽입 시 성능**  | **PK 정렬을 유지해야 하므로 성능 저하 발생 (Page Split 가능)** | **Heap에 새로 추가되므로 영향 없음**                                 |
| **UPDATE 방식**        | In-Place 업데이트 가능하지만, PK 변경 시 재정렬 필요           | **새로운 공간에 INSERT 후 기존 Tuple은 DEAD 처리 (HOT 최적화 가능)** |
| **DELETE 후 INSERT**   | 삭제된 공간이 즉시 활용되지 않을 수도 있음                     | **삭제된 공간을 우선 활용하려고 시도**                               |
| **페이지 단편화 문제** | PK 정렬을 유지하기 위해 단편화 발생 가능                       | VACUUM으로 정리 가능                                                 |

## MySQL InnoDB에서 PK를 Non-Clustered로 할 수 있을까?

MySQL InnoDB에서는 기본적으로 Primary Key(PK)는 Clustered Index로 동작합니다. **즉, PK를 Non-Clustered Index로 설정할 수 없습니다.**

MySQL에서 PK를 Non-Clustered로 할 수 없는 이유는 다음과 같습니다.

1. InnoDB의 저장 방식
   - InnoDB는 Clustered Index를 기반으로 데이터를 저장하며, PK의 순서에 따라 물리적으로 정렬됩니다.
   - 즉, PK가 있는 테이블에서는 PK가 Clustered Index로 고정됩니다.

2. MySQL 다른 엔진인 MyISAM은 Clustered Index를 지원하지 않음
   - MyISAM 엔진을 사용하면 모든 인덱스가 Non-Clustered 이지만, MyISAM은 트랜잭션과 MVCC를 지원하지 않기 때문에 일반적으로 추천되지 않음.

3. InnoDB에서 Clustered Index를 변경할 수 없음
   - InnoDB는 테이블당 하나의 Clustered Index만 허용.
   - PK가 Clustered Index로 설정되지 않으면, MySQL은 자동으로 내부적으로 Clustered Index를 생성.

### MySQL의 InnoDB 외에 MyISAM의 인덱스 구조 비교

| 비교 항목          | InnoDB (MySQL)             | MyISAM (MySQL)                           |
| ------------------ | -------------------------- | ---------------------------------------- |
| 기본 인덱스 구조   | Clustered Index (B-Tree)   | Non-Clustered Index (Heap + B-Tree)      |
| 트랜잭션 지원      | O                          | X                                        |
| MVCC 지원          | O                          | X                                        |
| 외래 키 지원       | O                          | X                                        |
| 검색 성능          | PK 검색 빠름               | 일반적으로 빠르지만, PK 기반 성능은 낮음 |
| INSERT/DELETE 성능 | 정렬 유지로 인해 다소 느림 | 상대적으로 빠름                          |

### MySQ의 PK를 Clustered Index로 사용하지 않으려면?

MySQL에서 직접적으로 PK를 Non-Clustered Index로 변경할 수는 없지만, 다음과 같은 방법을 사용할 수 있습니다.

1. PK 없이 테이블 생성 (자동 Row ID 사용)
   - Primary Key를 지정하지 않으면, InnoDB는 자동으로 내부적인 Row ID (Hidden Clustered Index)를 생성.
```sql
CREATE TABLE my_table (
    id INT NOT NULL, 
    data VARCHAR(255),
    UNIQUE(id)  -- PK 대신 UNIQUE 사용
) ENGINE=InnoDB;
```

2. UUID + Secondary Index 사용
    - UUID를 PK로 사용하면 삽입 순서가 랜덤 → PK가 실제 데이터 정렬에 미치는 영향이 줄어들지만 UUID는 크고, 랜덤성이 강해 인덱스 관리 비용이 증가할 수 있음.
```sql
CREATE TABLE my_table (
    uuid CHAR(36) NOT NULL,
    data VARCHAR(255),
    PRIMARY KEY (uuid),  -- Clustered Index
    KEY idx_id (id)  -- Secondary Non-Clustered Index
) ENGINE=InnoDB;
```

3. AUTO_INCREMENT 대신 별도 UNIQUE KEY 사용
- MySQL은 PK가 없으면 내부적으로 Clustered Index를 만들기 때문에 완벽한 해결책은 아님.
```sql
CREATE TABLE my_table (
    id INT NOT NULL AUTO_INCREMENT,
    data VARCHAR(255),
    UNIQUE(id)  -- PK가 아닌 UNIQUE 제약 조건 사용
) ENGINE=InnoDB;
```

> 위에서 말한 방법으로 간접적으로 우회할 수는 있지만, 해결책이 아니기 때문에 완벽한 대체는 될 수 없습니다!
{:.prompt-danger}

결론을 내보자면,

1. MySQL에서는 PK를 Non-Clustered Index로 설정할 수 없습니다
2. InnoDB에서는 PK가 자동으로 Clustered Index가 됩니다.
3. MyISAM을 사용하면 모든 인덱스가 Non-Clustered지만, 트랜잭션 미지원으로 실무에서 잘 사용되지 않습니다.
4. UUID 또는 Unique Index를 활용하면 PK의 Clustered Index 특성을 완화할 수 있지만, 완벽한 대체는 아닙니다.


## MSA(Microservices Architecture) 환경에서 PostgreSQL이 유리한 이유

1) **스키마 변화에 대한 유연성**
   - MSA 환경에서는 서비스별로 데이터 스키마가 자주 변경될 수 있음.
   - PostgreSQL은 JSONB 지원, 파티셔닝, 확장 기능이 뛰어나 MySQL보다 스키마 변경에 유리함.

2) **분산 환경에서의 확장성**
   - MySQL의 Clustered Index 구조는 쓰기 연산(INSERT/UPDATE/DELETE)이 많은 분산 환경에서 성능 이슈를 유발할 수 있음.
   - PostgreSQL은 물리적 데이터 정렬을 강제하지 않으므로 **Sharding, Partitioning**에서 더 유리함.

3) **JSONB 지원을 통한 NoSQL 대체 가능**
   - PostgreSQL의 JSONB는 NoSQL과 유사한 스키마 유연성을 제공하면서도 SQL 쿼리를 활용할 수 있음.
   - 일부 서비스가 NoSQL을 필요로 할 때, MongoDB 대신 PostgreSQL을 사용할 수 있는 대안이 됨.

## 결론

PostgreSQL은 MSA 기반 아키텍처에서 확장성과 유연성이 필요한 경우 훌륭한 선택지가 될 수 있습니다. 특히 Clustered Index 구조의 차이, Secondary Index 성능, 대용량 데이터 처리 측면에서 MySQL보다 장점을 가지며, Sharding과 Partitioning이 필요한 환경에서도 강력한 기능을 제공합니다.

PostgreSQL의 레코드는 PK 순서대로 저장되지 않으며, 기본적으로 INSERT된 순서대로 저장되지만 DELETE와 UPDATE 이후에는 빈 공간을 우선 활용하기 때문에 순서가 보장되지 않습니다. Heap Table 구조 덕분에 중간 삽입이 많은 경우에도 성능 저하 없이 데이터를 추가할 수 있으며, 유연한 데이터 저장 방식이 가능합니다.

그러나 시간이 지나면서 테이블이 단편화될 수 있어 주기적인 VACUUM이 필요합니다. 또한, MySQL InnoDB와 비교했을 때 PK 기반 검색 속도가 상대적으로 느릴 수 있지만, 다양한 인덱스를 균형 있게 활용하면 충분히 성능을 최적화할 수 있습니다.

이러한 특징 덕분에 PostgreSQL은 MSA 환경에서의 확장성과 데이터 관리의 유연성을 고려할 때 더욱 적합한 데이터베이스로 평가됩니다.
