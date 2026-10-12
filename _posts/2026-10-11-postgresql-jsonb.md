---
title: "PostgreSQL JSONB: 검색과 인덱스, JSON·MySQL 비교"
date: 2026-10-11 00:00:00 +0900
description: "PostgreSQL JSONB의 저장과 검색"
author: ydj515
categories: [database, postgresql]
tags: [postgresql, jsonb, json, gin, b-tree, jsonpath, mysql, indexing, query-optimization]
image:
  path: /assets/img/postgresql/logo.png
  alt: "PostgreSQL JSONB 저장과 검색 인덱스를 설명하는 PostgreSQL 로고"
---

PostgreSQL `jsonb`는 JSON 데이터를 저장하고 내부 값을 검색할 수 있는 타입입니다. 신청서 수정 이력처럼 변경 항목에 따라 구조가 달라지거나, 알림 설정처럼 사용자마다 필요한 항목이 다른 데이터를 저장할 때 사용할 수 있습니다.

수정 이력에서 주소가 변경된 내역을 찾거나 이메일 알림을 켠 사용자를 조회하려면 JSONB 내부의 값을 검색 조건으로 사용해야 합니다. 일반 숫자나 문자열 컬럼처럼 JSONB 컬럼 자체에 B-tree 인덱스를 만드는 것만으로는 내부 값의 검색을 처리할 수 없습니다. 문서에 특정 구조가 포함되는지 검색할 때는 GIN 인덱스를, 특정 값을 꺼내 비교하거나 정렬할 때는 해당 표현식에 B-tree 인덱스를 적용합니다.

이 글에서는 사용자 설정, 상품 정보, 신청서 수정 이력을 예로 JSONB의 검색과 인덱스, 갱신 비용을 살펴봅니다. 일반 컬럼으로 분리할 기준과 PostgreSQL JSON·MySQL JSON과의 차이도 정리합니다.

## 구조가 달라지는 사용자 설정 저장하기

관계형 모델은 구조가 일정한 데이터를 다루기 좋습니다. 타입, `NOT NULL`, 외래 키, 유니크 제약으로 잘못된 데이터의 저장을 막을 수 있고, 자주 조회하는 컬럼에는 목적에 맞는 인덱스를 만들 수 있습니다.

반면 사용자 설정과 알림 옵션은 사용자나 기능에 따라 구조가 달라집니다. 어떤 사용자는 이메일과 푸시 알림을 함께 사용하고, 어떤 사용자는 방해 금지 시간이나 이벤트별 알림 규칙을 추가합니다. 기능이 늘어날 때마다 일부 사용자만 쓰는 컬럼을 추가하면 테이블과 애플리케이션의 변경 범위가 커집니다.

사용자 식별자는 일반 컬럼에, 선택적인 설정은 `settings`에 모아 저장합니다.

```sql
CREATE TABLE user_preferences (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id bigint NOT NULL,
  user_id bigint NOT NULL,
  settings jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_user_preferences_tenant_user
    UNIQUE (tenant_id, user_id),
  CONSTRAINT ck_user_preferences_settings_object
    CHECK (jsonb_typeof(settings) = 'object')
);
```

`UNIQUE` 제약으로 테넌트별 사용자 설정의 중복을 막고, `CHECK` 제약으로 `settings`에 JSON 객체만 저장하도록 제한했습니다. 검색 예제에 사용할 데이터를 넣습니다.

```sql
INSERT INTO user_preferences (tenant_id, user_id, settings)
VALUES
  (1, 101,
   '{
      "locale": "ko-KR",
      "theme": "dark",
      "memo": "업무용 알림 설정",
      "notifications": {
        "channels": ["email", "push"],
        "categories": ["application-status", "security"],
        "categoryIds": [101, 205],
        "dailyDigestHour": 9,
        "email": {"enabled": true},
        "push": {"enabled": true},
        "quietHours": {"start": 22, "end": 7},
        "rules": [
          {"channel": "push", "event": "application-status", "enabled": true},
          {"channel": "email", "event": "marketing", "enabled": false}
        ]
      }
    }'::jsonb),
  (1, 102,
   '{
      "locale": "ko-KR",
      "theme": "light",
      "memo": "마케팅 알림 제외",
      "notifications": {
        "channels": ["email"],
        "categories": ["application-status"],
        "categoryIds": [101],
        "dailyDigestHour": 18,
        "email": {"enabled": true},
        "push": {"enabled": false}
      }
    }'::jsonb),
  (1, 103,
   '{
      "locale": "en-US",
      "theme": "system",
      "memo": "모바일 전용 설정",
      "notifications": {
        "channels": ["push", "sms"],
        "categories": ["marketing"],
        "categoryIds": [301],
        "dailyDigestHour": 12,
        "email": {"enabled": false},
        "push": {"enabled": true},
        "rules": [
          {"channel": "push", "event": "marketing", "enabled": true}
        ]
      }
    }'::jsonb),
  (2, 201,
   '{
      "locale": "ja-JP",
      "theme": "dark",
      "memo": "보안 알림 우선",
      "notifications": {
        "channels": ["email", "push"],
        "categories": ["security"],
        "categoryIds": [205],
        "dailyDigestHour": 8,
        "email": {"enabled": true},
        "push": {"enabled": true},
        "quietHours": {"start": 23, "end": 6}
      }
    }'::jsonb);
```

## JSON과 JSONB의 차이

PostgreSQL은 `json`과 `jsonb` 두 타입을 제공합니다. 둘 다 입력값이 올바른 JSON 문법인지 검사하고 JSON 전용 함수와 연산자를 사용할 수 있지만, **저장 방식에 차이가 있습니다.**

| 구분                    | `json`                            | `jsonb`                                    |
| ----------------------- | --------------------------------- | ------------------------------------------ |
| 저장 방식               | 입력 문자열의 원문을 저장         | 파싱한 값을 분해된 바이너리 형식으로 저장  |
| 공백과 객체 키 순서     | 보존                              | 보존하지 않음                              |
| 중복 객체 키            | 입력에 있는 키를 모두 보존        | 마지막 키의 값만 보존                      |
| 읽기                    | 사용할 때 다시 파싱               | 파싱된 구조를 바로 처리                    |
| 입력                    | 원문 저장이므로 상대적으로 단순   | 변환 과정이 추가됨                         |
| JSON 문서 검색용 인덱스 | GIN 인덱스를 직접 적용할 수 없음  | GIN 인덱스 지원                            |
| 동등 비교               | `json` 동등 연산자 없음           | 동등·순서 비교 가능                        |
| 주요 용도               | 원문 형식 보존이 중요한 특수 사례 | 조회와 검색이 필요한 일반적인 애플리케이션 |

아래 쿼리를 두 컬럼에 실행해보면 `json`은 입력 문자열을 보존하지만, 값을 읽는 함수는 마지막 키를 유효한 값으로 취급합니다. `jsonb`는 변환할 때 중복 키를 제거하고 마지막 값만 저장합니다.

```sql
SELECT '{ "name": "old", "name": "new" }'::json;
-- { "name": "old", "name": "new" }

SELECT '{ "name": "old", "name": "new" }'::jsonb;
-- {"name": "new"}
```

`jsonb`의 바이너리 형식은 BSON처럼 PostgreSQL 외부에서 그대로 교환하는 범용 포맷이 아닙니다. PostgreSQL이 내부 조회와 비교에 사용하는 저장 형식입니다. 따라서 애플리케이션과 통신할 때는 다시 JSON 문자열로 직렬화합니다.

`jsonb`는 입력할 때 파싱과 변환 비용이 듭니다. 문서의 구조와 값에 따라 원문 JSON보다 저장 공간이 커질 수도 있습니다. 반복 조회 시 원문을 다시 파싱하지 않아도 되고 GIN 인덱스를 사용할 수 있다는 이점이 있습니다.

> PostgreSQL 공식 문서는 객체 키의 원래 순서를 보존해야 하는 특수한 요구가 없다면 대부분의 애플리케이션에서 `jsonb`를 권장합니다.
{:.prompt-tip}

## JSONB 검색 예제

저장한 설정은 화면에 표시할 값으로 꺼내거나, 알림을 받을 사용자를 찾는 조건으로 사용합니다.

### 설정값 꺼내기

사용자 설정에서 테마와 방해 금지 시작 시간을 꺼냅니다.

```sql
SELECT
  settings->>'theme' AS theme,
  settings #>> '{notifications,quietHours,start}' AS quiet_start
FROM user_preferences
WHERE tenant_id = 1
  AND user_id = 101;
```

`settings->'theme'`은 JSONB 문자열인 `"dark"`를 반환하고, `settings->>'theme'`은 SQL의 `text` 값인 `dark`를 반환합니다. 비교, 정렬, 타입 변환이 필요하면 보통 `->>`나 `#>>`를 사용합니다.

경로가 없거나 구조가 맞지 않으면 추출 연산자는 오류 대신 SQL `NULL`을 반환합니다. 다만 JSON의 `null`과 키가 없어서 발생한 SQL `NULL`은 의미가 다르므로 존재 여부까지 구분해야 할 때는 `?` 연산자나 `jsonb_typeof`를 함께 사용합니다.

### 문서가 특정 구조를 포함하는지 검색

이메일 알림을 사용하는 사용자는 `@>`로 찾을 수 있습니다. 왼쪽 JSONB가 오른쪽에 지정한 구조를 포함하는지 검사하는 연산자입니다.

```sql
SELECT tenant_id, user_id, settings->>'theme' AS theme
FROM user_preferences
WHERE settings @> '{"notifications": {"email": {"enabled": true}}}'::jsonb;
```

객체의 키 순서는 결과에 영향을 주지 않습니다. 오른쪽에 적지 않은 `locale`, `memo`, `push`, `rules` 같은 키가 왼쪽 문서에 더 있어도 조건을 만족합니다.

중첩 배열도 같은 방식으로 검색할 수 있습니다.

```sql
SELECT tenant_id, user_id
FROM user_preferences
WHERE settings @>
  '{"notifications": {"categories": ["application-status"]}}'::jsonb;
```

### 배열에 모든 알림 채널이 포함됐는지 검색

JSONB 포함 연산은 배열 원소의 순서와 중복 횟수를 구분하지 않습니다. 다음 쿼리는 이메일과 푸시 알림을 모두 사용하는 사용자를 찾습니다.

```sql
SELECT tenant_id, user_id
FROM user_preferences
WHERE settings @>
  '{"notifications": {"channels": ["email", "push"]}}'::jsonb;
```

배열 원소 두 개가 모두 있어야 하므로 의미상 `AND` 검색입니다. 하나라도 포함하는 `OR` 검색은 `?|`를 사용할 수 있습니다.

```sql
SELECT tenant_id, user_id
FROM user_preferences
WHERE (settings #> '{notifications,channels}')
      ?| ARRAY['push', 'sms'];
```

여기서 `?|`는 `settings` 전체가 아니라 `settings #> '{notifications,channels}'`라는 표현식에 적용됩니다. 이 조건을 인덱스로 검색하려면 경로를 추출하는 표현식도 인덱스 정의에 맞춰야 합니다.

### 키 존재 여부 검색

방해 금지 시간처럼 선택적인 설정은 어떤 값을 저장했는지보다 해당 설정이 있는지를 확인할 때도 있습니다. `?`는 최상위 객체에 키가 있는지 또는 최상위 배열에 문자열 원소가 있는지 검사합니다. 다음 쿼리는 방해 금지 시간을 설정한 사용자를 찾습니다.

```sql
SELECT tenant_id, user_id,
       settings #> '{notifications,quietHours}' AS quiet_hours
FROM user_preferences
WHERE (settings->'notifications') ? 'quietHours';
```

`settings ? 'quietHours'`로는 중첩된 `notifications.quietHours`를 찾지 못합니다. 중첩 키의 존재 여부는 위 쿼리처럼 상위 경로를 먼저 추출하거나 JSONPath를 사용합니다.

### 중첩된 스칼라 값 검색

구조의 포함 여부나 키의 존재를 검사하는 대신 특정 경로의 값을 직접 비교하려면 `#>`를 사용합니다.

```sql
SELECT tenant_id, user_id
FROM user_preferences
WHERE settings #>> '{notifications,push,enabled}' = 'true';
```

숫자 범위 검색은 `text`를 숫자 타입으로 변환해야 합니다. 문자열 상태로 시간을 비교하면 사전식 순서를 사용하므로 `10`이 `9`보다 작다고 판단할 수 있습니다. JSON에 숫자로 저장했더라도 `#>>`의 결과는 `text`이므로 명시적으로 변환해야 합니다.

```sql
SELECT tenant_id, user_id,
       (settings #>> '{notifications,dailyDigestHour}')::smallint
         AS digest_hour
FROM user_preferences
WHERE (settings #>> '{notifications,dailyDigestHour}')::smallint
      BETWEEN 8 AND 12
ORDER BY (settings #>> '{notifications,dailyDigestHour}')::smallint;
```

> 하나의 경로에 `9`와 `"9"`처럼 숫자와 문자열을 섞어 저장하면 검색과 인덱스가 복잡해집니다. JSONB가 문법을 검증해 주더라도 애플리케이션 스키마까지 보장하지는 않습니다.
{:.prompt-warning}

## 포함·존재 검색에 GIN 인덱스 적용하기

데이터가 많아지면 포함·존재 조건을 모든 행에 적용하는 비용도 커집니다. GIN 인덱스로 검색 후보를 줄일 수 있습니다.

GIN(Generalized Inverted Index)은 JSONB 문서에서 추출한 항목별로 행의 위치를 저장하는 역색인입니다.

### GIN은 JSONB 문서에서 검색 후보를 어떻게 찾는가

B-tree는 일반적으로 행마다 하나의 정렬 가능한 인덱스 값을 저장하고 값의 순서를 따라 행을 찾습니다. 반면 GIN은 JSONB 문서 하나에서 여러 인덱스 항목을 추출하고, 각 항목이 등장한 행의 위치 목록(posting list)을 저장합니다.

예를 들어 기본 연산자 클래스인 `jsonb_ops`가 사용자 설정을 인덱싱하는 모습을 단순화하면 다음과 같습니다. 여기서 토큰은 형태소 분석으로 만든 단어가 아니라 GIN 연산자 클래스가 JSONB에서 추출한 키와 값입니다. 실제 인덱스는 테이블의 물리적 행 위치를 저장하지만, 아래에서는 이해하기 쉽게 `user_id`로 표시합니다.

```text
theme         -> [101, 102, 103, 201]
dark          -> [101, 201]
notifications -> [101, 102, 103, 201]
push          -> [101, 102, 103, 201]
true          -> [101, 102, 103, 201]
```

`@>` 조건이 여러 키와 값을 요구하면 PostgreSQL은 관련 위치 목록을 조합해 후보 행을 좁힙니다. 문서에서 추출한 항목마다 해당 항목이 있는 행의 위치를 저장하는 방식은 Elasticsearch가 내부적으로 사용하는 Lucene 역색인과 비슷합니다. 다만 PostgreSQL GIN은 데이터베이스 안에서 특정 연산자를 빠르게 실행하는 인덱스 접근 방식이며, 언어 분석·관련도 점수·분산 검색까지 제공하는 전문 검색 엔진과는 역할이 다릅니다.

같은 JSONB 컬럼이라도 쿼리 형태에 따라 필요한 인덱스가 달라집니다. 문서가 특정 구조를 포함하는지 반복해서 검색한다면 JSONB 컬럼 전체에 GIN 인덱스를 만듭니다.

```sql
CREATE INDEX idx_user_preferences_settings_gin
  ON user_preferences
  USING GIN (settings);

SELECT tenant_id, user_id
FROM user_preferences
WHERE settings @> '{"theme": "dark"}'::jsonb;
```

반대로 추출한 경로의 값 하나를 동등 비교하거나 정렬한다면 그 표현식에 B-tree 인덱스를 만들 수 있습니다.

```sql
CREATE INDEX idx_user_preferences_theme_btree
  ON user_preferences ((settings->>'theme'));

SELECT tenant_id, user_id
FROM user_preferences
WHERE settings->>'theme' = 'dark';
```

첫 번째 GIN 인덱스는 `settings @> ...`를 지원하지만 `settings->>'theme' = ...` 조건을 대신 인덱싱하지 않습니다. 두 번째 B-tree 인덱스도 문서 전체의 포함 검색에는 사용할 수 없습니다. 인덱스는 실제 `WHERE` 표현식과 연산자에 맞춰 선택합니다.

### 기본 GIN 인덱스인 jsonb_ops

연산자 클래스를 생략하면 기본값인 `jsonb_ops`를 사용합니다. `jsonb_ops`가 지원하는 주요 연산자는 다음과 같습니다.

- 키 존재: `?`, `?|`, `?&`
- 포함: `@>`
- JSONPath 일치: `@?`, `@@`

### 성능 측정용 상품 예제

GIN 인덱스를 적용하기 전후의 성능은 상품 데이터로 비교합니다. 카테고리와 판매 여부로 조건에 맞는 행의 비율을 일정하게 맞출 수 있어 순차 스캔과 GIN 스캔을 비교하기 좋습니다.

성능 측정과 가격·상품 변형 검색에 사용할 테이블을 만들고 기준 데이터 네 건을 넣습니다.

```sql
CREATE TABLE products (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id bigint NOT NULL,
  sku text NOT NULL,
  document jsonb NOT NULL,
  CONSTRAINT uq_products_tenant_sku UNIQUE (tenant_id, sku),
  CONSTRAINT ck_products_document_object
    CHECK (jsonb_typeof(document) = 'object')
);

INSERT INTO products (tenant_id, sku, document)
VALUES
  (1, 'KB-75-BRN',
   '{"name":"75% 기계식 키보드","category":"keyboard","price":129000,
     "available":true,"tags":["wireless","hot-swap"],
     "specs":{"layout":"75%","switch":"brown"},
     "variants":[{"color":"black","stock":12},{"color":"white","stock":0}]}'::jsonb),
  (1, 'KB-TKL-RED',
   '{"name":"텐키리스 게이밍 키보드","category":"keyboard","price":89000,
     "available":true,"tags":["wired","hot-swap"],
     "specs":{"layout":"tkl","switch":"red"}}'::jsonb),
  (1, 'MS-ERG-WL',
   '{"name":"무선 인체공학 마우스","category":"mouse","price":79000,
     "available":false,"tags":["wireless","ergonomic"],
     "specs":{"dpi":24000,"buttons":6},"discountRate":10}'::jsonb),
  (2, 'MN-4K-144',
   '{"name":"4K 144Hz 모니터","category":"monitor","price":699000,
     "available":true,"tags":["4k","gaming"],
     "specs":{"size":32,"refreshRate":144}}'::jsonb);
```

행이 네 개뿐이면 대개 순차 스캔이 더 저렴하므로 실행 계획의 차이가 잘 드러나지 않습니다. 다음 SQL은 기존 네 행에 테스트 데이터 10만 건을 추가합니다. 운영 데이터에 실행해서는 안 됩니다.

```sql
INSERT INTO products (tenant_id, sku, document)
SELECT
  1,
  'AUTO-' || g,
  jsonb_build_object(
    'name', '자동 생성 상품 ' || g,
    'category', CASE WHEN g % 100 = 0 THEN 'keyboard' ELSE 'accessory' END,
    'price', 10000 + (g % 1000) * 100,
    'available', g % 7 <> 0,
    'tags', CASE
      WHEN g % 50 = 0 THEN jsonb_build_array('wireless', 'hot-swap')
      ELSE jsonb_build_array('basic')
    END
  )
FROM generate_series(1, 100000) AS g;

ANALYZE products;
```

전체 100,004행 중 다음 조건을 만족하는 행은 860개로 약 0.86%입니다.

```sql
SELECT count(*)
FROM products
WHERE document @> '{"category": "keyboard", "available": true}'::jsonb;
```

먼저 GIN 인덱스가 없는 상태에서 실행 계획을 확인합니다. `TIMING OFF`는 각 노드의 시간 측정 오버헤드를 줄이지만 전체 `Execution Time`은 계속 출력합니다.

```sql
EXPLAIN (ANALYZE, BUFFERS, TIMING OFF)
SELECT id, sku
FROM products
WHERE document @> '{"category": "keyboard", "available": true}'::jsonb;
```

대표 실행 계획은 다음과 같습니다. PostgreSQL은 100,004행을 모두 읽은 뒤 99,144행을 필터링했습니다.

```text
Seq Scan on products (actual rows=860 loops=1)
  Filter: (document @> '{"category": "keyboard", "available": true}'::jsonb)
  Rows Removed by Filter: 99144
  Buffers: shared hit=2440
Execution Time: 6.011 ms
```

기본 `jsonb_ops` GIN 인덱스를 만들고 같은 쿼리를 다시 실행합니다.

```sql
CREATE INDEX idx_products_document_gin
  ON products
  USING GIN (document);

EXPLAIN (ANALYZE, BUFFERS, TIMING OFF)
SELECT id, sku
FROM products
WHERE document @> '{"category": "keyboard", "available": true}'::jsonb;
```

실행 계획은 `Bitmap Index Scan`으로 조건에 맞는 행 위치를 찾은 뒤 `Bitmap Heap Scan`으로 실제 행을 읽는 방식으로 바뀝니다.

```text
Bitmap Heap Scan on products (actual rows=860 loops=1)
  Recheck Cond: (document @> '{"category": "keyboard", "available": true}'::jsonb)
  Heap Blocks: exact=859
  Buffers: shared hit=952
  -> Bitmap Index Scan on idx_products_document_gin
       (actual rows=860 loops=1)
       Index Cond: (document @> '{"category": "keyboard", "available": true}'::jsonb)
Execution Time: 0.738 ms
```

실행 순서는 다음과 같습니다.

```text
JSONB 조건
  -> Bitmap Index Scan: GIN의 위치 목록에서 후보 행을 찾음
  -> Bitmap Heap Scan: 후보가 있는 테이블 페이지와 행을 읽음
  -> Recheck Cond: 원본 JSONB에 조건을 다시 적용함
  -> 최종 결과
```

`jsonb_ops`는 키와 값을 독립된 인덱스 항목으로 저장하므로, 같은 키와 값이 다른 구조에 등장한 행이 후보에 포함될 수 있습니다. 또한 비트맵이 메모리 제약으로 페이지 단위의 손실 압축을 사용하면 후보 범위가 넓어질 수 있습니다. `Recheck Cond`는 이런 후보를 원본 JSONB와 다시 비교해 거짓 양성을 제거하는 재검사 단계입니다.

아래는 PostgreSQL 18.6에서 EXPLAIN (ANALYZE, BUFFERS, TIMING OFF)`를 5회 실행해 `Execution Time`실행 시간을 측정한 결과입니다.

| 조건            | 실행 계획                                | 공유 버퍼 접근 | 실행 시간 중앙값 |
| --------------- | ---------------------------------------- | -------------: | ---------------: |
| GIN 인덱스 없음 | `Seq Scan`                               |          2,440 |          6.011ms |
| `jsonb_ops` GIN | `Bitmap Index Scan` + `Bitmap Heap Scan` |            952 |          0.738ms |

이 환경에서는 GIN 적용 후 실행 시간 중앙값이 약 87.7% 줄어 약 8.1배 빨라졌고, 공유 버퍼 접근도 약 61.0% 줄었습니다. 대신 19MB 테이블에 약 12MB의 GIN 인덱스가 추가됐으며, 행을 추가하거나 갱신할 때 인덱스도 함께 갱신해야 합니다.

측정 결과는 일치하는 행의 비율, 문서 크기와 키 분포, 캐시 상태, 하드웨어에 따라 달라집니다. 인덱스가 해당 연산자를 지원해도 항상 선택되지는 않습니다. 반환 비율이 높으면 인덱스보다 순차 스캔이 더 cost가 낮을 수 있습니다.

`EXPLAIN ANALYZE`는 쿼리를 실제로 실행합니다. `SELECT`가 아닌 `UPDATE`와 `DELETE`를 분석할 때는 트랜잭션에서 실행한 뒤 롤백하거나 복제된 테스트 환경을 사용해야 합니다.

앞에서 만든 사용자 설정 GIN 인덱스는 이메일 알림 활성화와 알림 카테고리 같은 포함 검색도 지원합니다.

```sql
SELECT tenant_id, user_id
FROM user_preferences
WHERE settings @>
  '{"notifications": {"email": {"enabled": true}}}'::jsonb;
```

사용자 설정 테이블에서도 실제 데이터로 실행 계획을 확인해야 합니다.

### jsonb_path_ops

인덱스의 크기와 검색 후보를 줄이기 위해 항목을 저장하는 방식을 바꿀 수도 있습니다. 검색이 `@>`, `@?`, `@@` 중심이고 키 존재 연산자가 필요 없다면 `jsonb_path_ops`를 검토합니다.

```sql
CREATE INDEX idx_products_document_path_gin
  ON products
  USING GIN (document jsonb_path_ops);
```

두 연산자 클래스는 인덱스 항목을 만드는 방식이 다릅니다.

| 구분               | `jsonb_ops`                                                | `jsonb_path_ops`                         |
| ------------------ | ---------------------------------------------------------- | ---------------------------------------- |
| 인덱스 항목        | 키와 값을 각각 저장                                        | 값과 그 값까지의 경로를 해시로 묶어 저장 |
| 키 존재 연산자     | <code>?</code>, <code>?&#124;</code>, <code>?&</code> 지원 | 미지원                                   |
| `@>`, `@?`, `@@`   | 지원                                                       | 지원                                     |
| 크기               | 상대적으로 클 수 있음                                      | 일반적으로 더 작음                       |
| 후보를 좁히는 방식 | 흔한 키와 값이 많으면 후보가 늘 수 있음                    | 경로와 값을 묶어 더 구체적으로 찾음      |
| 빈 객체 검색       | 가능                                                       | 값이 없어 인덱스 항목을 만들지 못함      |

예를 들어 `{"specs": {"layout": "75%"}}`를 `jsonb_path_ops`로 인덱싱하면 `specs`, `layout`, `75%`로 이어지는 경로와 값을 하나의 해시 항목으로 만듭니다. 같은 키와 값이 여러 경로에 반복되는 문서에서는 기본 `jsonb_ops`보다 검색 후보를 더 구체적으로 줄일 수 있습니다.

반면 `{"specs": {}}`처럼 값이 없는 구조는 인덱스 항목을 만들지 않습니다. 빈 객체를 포함하는 문서를 자주 검색하거나 키 존재 연산자가 필요하면 기본 `jsonb_ops`가 적합합니다.

> `jsonb_path_ops`가 항상 더 빠르다는 뜻은 아닙니다. 실제 쿼리 연산자, 문서 구조, 키와 값의 분포, 인덱스 크기, 쓰기량을 같은 데이터로 측정해야 합니다.
{:.prompt-warning}

### 특정 경로만 인덱싱하기

태그만 반복해서 검색한다면 인덱싱할 범위를 줄일 수 있습니다. 다음 쿼리는 `?` 연산자를 `document->'tags'`에 적용합니다.

```sql
SELECT id, sku
FROM products
WHERE (document->'tags') ? 'wireless';
```

문서 전체에 만든 GIN 인덱스는 이 표현식에 `?`가 직접 적용된 형태를 지원하지 않습니다. 태그 검색이 중요하면 같은 표현식으로 GIN 인덱스를 만듭니다.

```sql
CREATE INDEX idx_products_tags_gin
  ON products
  USING GIN ((document->'tags'));
```

이 인덱스는 `tags` 아래의 데이터만 저장하므로 문서 전체를 인덱싱할 때보다 크기를 줄일 수 있습니다.

다른 방법은 문서 전체에 적용할 수 있는 포함 조건으로 쿼리를 바꾸는 것입니다.

```sql
SELECT id, sku
FROM products
WHERE document @> '{"tags": ["wireless"]}'::jsonb;
```

두 쿼리가 필요한 결과를 동일하게 반환하는지 확인합니다. 태그 외의 경로도 검색하는지, 인덱스를 몇 개 유지해야 하는지를 기준으로 선택합니다.

### GIN 인덱스의 쓰기 비용

JSONB 문서 한 행에는 여러 키와 값이 들어 있습니다. GIN 인덱스는 행 하나를 추가하거나 변경할 때 문서에서 추출한 여러 인덱스 항목을 갱신해야 하므로 일반 B-tree 인덱스보다 쓰기 비용이 커질 수 있습니다.

PostgreSQL은 기본적으로 GIN의 `fastupdate`를 켜고 새 항목을 정렬되지 않은 pending list에 먼저 모읍니다. 이후 autovacuum, autoanalyze, `gin_clean_pending_list` 또는 크기 제한 도달 시 메인 인덱스로 합칩니다. 평균 쓰기 비용은 줄지만 다음 특성을 고려해야 합니다.

- pending list가 커지면 조회할 때 읽을 항목도 늘어 검색이 느려질 수 있습니다.
- 크기 제한을 넘긴 쓰기 요청이 pending list를 직접 정리하면 해당 요청의 응답 시간이 길어질 수 있습니다.
- autovacuum이 제때 동작하지 않으면 pending list 정리와 죽은 튜플 제거가 늦어질 수 있습니다.

`fastupdate = off`를 검토한다면 쓰기 처리량, p95·p99 지연, GIN 인덱스 크기, autovacuum 동작을 함께 측정합니다.

## 표현식 인덱스와 B-tree

GIN은 문서 포함과 키 존재 검색에 적합하지만, 숫자의 범위 검색이나 정렬을 대신하지 않습니다. `price >= 100000`, `ORDER BY price` 같은 조건에는 B-tree 표현식 인덱스가 적합합니다.

### 숫자 범위와 정렬

상품의 가격을 `numeric`으로 꺼내는 표현식에 인덱스를 만듭니다. 사용자 설정의 알림 시간을 숫자로 변환했던 것과 같은 방식입니다.

```sql
CREATE INDEX idx_products_price
  ON products (((document->>'price')::numeric));
```

다음 쿼리는 같은 표현식을 `WHERE`와 `ORDER BY`에 사용하므로 B-tree 인덱스로 범위를 찾을 수 있습니다.

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, sku, document->>'name' AS name,
       (document->>'price')::numeric AS price
FROM products
WHERE (document->>'price')::numeric >= 100000
  AND (document->>'price')::numeric < 200000
ORDER BY (document->>'price')::numeric;
```

선택도가 높고 `LIMIT`이 작으면 플래너가 B-tree 순서를 유지하는 `Index Scan`을 선택해 별도 정렬을 피할 수 있습니다. 반면 넓은 범위에서 `Bitmap Heap Scan`이 더 저렴하다고 판단하면 B-tree로 후보 행을 찾은 뒤 `Sort`를 수행합니다. B-tree가 있다는 사실만으로 `ORDER BY`의 정렬 단계가 항상 사라지는 것은 아닙니다.

표현식 인덱스는 인덱스를 만들거나 행을 변경할 때 표현식을 계산합니다. JSONB에 문자열 가격이나 객체가 섞여 있으면 `numeric` 변환 중 오류가 발생해 인덱스 생성이나 쓰기가 실패합니다. 검색에 사용하는 경로는 제약 조건으로 값의 타입을 보장하는 편이 좋습니다.

```sql
ALTER TABLE products
ADD CONSTRAINT ck_products_price
CHECK (
  document ? 'price'
  AND jsonb_typeof(document->'price') = 'number'
  AND (document->>'price')::numeric >= 0
);
```

### 테넌트 조건과 함께 검색

대부분의 조회가 한 테넌트 안에서 가격을 검색한다면 테넌트 컬럼과 JSONB 표현식을 하나의 B-tree 인덱스로 묶을 수 있습니다.

```sql
CREATE INDEX idx_products_tenant_price
  ON products (tenant_id, ((document->>'price')::numeric));
```

```sql
SELECT id, sku, document->>'name' AS name
FROM products
WHERE tenant_id = 1
  AND (document->>'price')::numeric BETWEEN 80000 AND 150000
ORDER BY (document->>'price')::numeric;
```

반면 테넌트 조건과 JSONB 포함 조건을 함께 사용한다면 일반적으로 `tenant_id` B-tree 인덱스와 `document` GIN 인덱스를 따로 두고 실행 계획을 확인합니다. PostgreSQL은 두 인덱스의 비트맵을 `BitmapAnd`로 합칠 수도 있고, 선택도가 높은 한 인덱스만 사용한 뒤 나머지를 필터로 처리할 수도 있습니다.

### 일부 행만 대상으로 하는 부분 인덱스

`discountRate`가 있는 상품이 전체의 일부이고 할인 상품만 자주 조회한다면 부분 인덱스로 크기와 유지 비용을 줄일 수 있습니다.

```sql
CREATE INDEX idx_products_discount_rate
  ON products (((document->>'discountRate')::numeric))
  WHERE jsonb_typeof(document->'discountRate') = 'number';
```

부분 인덱스를 사용하려면 쿼리 조건이 인덱스의 조건을 논리적으로 포함한다는 사실을 플래너가 인식할 수 있어야 합니다.

```sql
SELECT id, sku, document->>'name' AS name
FROM products
WHERE jsonb_typeof(document->'discountRate') = 'number'
  AND (document->>'discountRate')::numeric >= 10;
```

사람이 보기에 같은 의미라도 쿼리의 표현이 크게 다르면 부분 인덱스를 사용하지 못할 수 있습니다. 부분 인덱스는 실제 애플리케이션이 생성하는 SQL과 함께 검증해야 합니다.

### 검색 패턴별 인덱스 선택

| 검색 패턴             | SQL 예시                               | 우선 검토할 인덱스                          |
| --------------------- | -------------------------------------- | ------------------------------------------- |
| 객체·배열 포함        | `settings @> ...`                      | 문서 전체 GIN                               |
| 최상위 키 존재        | `settings ? 'key'`                     | 기본 `jsonb_ops` GIN                        |
| 특정 배열 원소 존재   | `(document->'tags') ? 'x'`             | 해당 경로의 표현식 GIN                      |
| 특정 경로 동등 비교   | `settings->>'theme' = 'dark'`          | B-tree 표현식 인덱스                        |
| 숫자·시간 범위와 정렬 | `(document->>'price')::numeric >= ...` | 타입을 맞춘 B-tree 표현식 인덱스            |
| 희소한 값 검색        | `document ? 'discountRate'`            | 쿼리와 조건을 맞춘 부분 인덱스              |
| 문자열 부분 검색      | `settings->>'memo' ILIKE '%알림%'`     | `pg_trgm` 표현식 GIN                        |
| 전체 문서 동등 비교   | `settings = ...`                       | 필요한 경우에만 전체 JSONB B-tree 또는 hash |

전체 JSONB에 B-tree 인덱스를 만들 수도 있지만, 주로 문서 전체의 동등 비교가 중요할 때 사용합니다. JSON 내부 숫자 범위나 특정 문자열 정렬을 전체 문서 B-tree가 대신해 주지는 않습니다.

## 설정 메모의 부분 문자열 검색

메모에서 `알림`이 들어간 내용을 찾으려면 값을 꺼낸 뒤 `ILIKE`로 검색합니다. 이 조건은 JSONB 구조 검색용 GIN 인덱스가 지원하지 않습니다.

```sql
SELECT tenant_id, user_id, settings->>'memo' AS memo
FROM user_preferences
WHERE settings->>'memo' ILIKE '%알림%';
```

앞에 와일드카드가 붙은 조건은 일반 B-tree 인덱스로 검색 범위를 좁히기 어렵습니다. 부분 문자열 검색이 필요하면 `pg_trgm` 확장과 표현식 GIN 인덱스를 사용할 수 있습니다.

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX idx_user_preferences_memo_trgm
  ON user_preferences
  USING GIN ((settings->>'memo') gin_trgm_ops);

SELECT tenant_id, user_id, settings->>'memo' AS memo
FROM user_preferences
WHERE settings->>'memo' ILIKE '%알림%';
```

`pg_trgm`은 문자열 유사도와 부분 일치에 적합하지만, 한국어 형태소를 이해하는 검색 엔진은 아닙니다. 단어의 의미, 오타 교정, 형태소 분석, 랭킹이 필요하면 전문 검색 엔진이나 한국어 분석기를 지원하는 PostgreSQL 확장을 별도로 검토해야 합니다.

## JSONPath 검색

앞의 예제는 정해진 경로의 값을 꺼내거나 특정 구조가 포함되는지 검사했습니다. 상품의 `variants`처럼 배열 안 객체에 여러 조건을 적용하려면 SQL/JSON Path로 표현할 수 있습니다. PostgreSQL의 `jsonpath`는 `$`에서 시작해 객체와 배열을 탐색합니다.

다음 쿼리는 검은색 변형 상품 중 재고가 0보다 큰 상품을 찾습니다.

```sql
SELECT id, sku, document->>'name' AS name
FROM products
WHERE document @?
  '$.variants[*] ? (@.color == "black" && @.stock > 0)';
```

`@?`는 JSONPath가 하나 이상의 항목을 반환하는지 검사합니다. `@@`는 경로 식이 반환한 단일 불리언 결과를 사용합니다.

```sql
SELECT id, sku, document->>'name' AS name
FROM products
WHERE document @@ '$.category == "keyboard" && $.available == true';
```

두 연산자는 누락된 필드, 예상하지 않은 타입, 일부 숫자·날짜 변환 오류를 억제합니다. 구조가 조금씩 다른 문서를 한 번에 검색할 때 유용하지만, 데이터 오류까지 조용히 숨길 수 있으므로 필수 필드는 제약 조건으로 검증해야 합니다.

GIN은 JSONPath 조건 전체를 인덱싱하지 않고, `접근 경로 == 상수` 형태의 조건을 추출해 검색합니다. 앞의 변형 상품 예제에서는 `color == "black"` 같은 동등 조건을 후보 검색에 활용할 수 있지만, `stock > 0` 같은 범위 조건은 B-tree 범위 검색처럼 처리하지 못합니다. 최종 조건은 행을 다시 확인하면서 평가합니다.

JSONPath는 복잡한 검색을 한 문장으로 표현할 수 있지만, 단순한 포함 검색에는 `@>`만으로도 충분할 수 있습니다. `@>`가 요구사항을 명확하게 표현한다면 더 짧은 연산자를 우선 사용하고 실행 계획을 비교하는 편이 좋습니다.

## 갱신 비용과 데이터 모델링

검색할 때뿐 아니라 값을 바꿀 때도 JSONB 문서의 크기와 인덱스가 비용에 영향을 줍니다.

### JSONB의 일부 값 변경

`jsonb_set`은 지정한 경로의 값을 바꾼 새 JSONB 값을 반환합니다. 방해 금지 시작 시간을 21시로 변경합니다.

```sql
UPDATE user_preferences
SET settings = jsonb_set(
  settings,
  '{notifications,quietHours,start}',
  '21'::jsonb,
  false
)
WHERE tenant_id = 1
  AND user_id = 101;
```

네 번째 인자인 `false`는 경로가 없을 때 새 키를 만들지 않겠다는 뜻입니다. 경로가 반드시 있어야 하는 수정이라면 오타로 새 구조가 생기는 일을 막을 수 있습니다.

PostgreSQL은 JSONB 첨자 대입도 지원합니다.

```sql
UPDATE user_preferences
SET settings['notifications']['push']['enabled'] = 'false'::jsonb
WHERE tenant_id = 1
  AND user_id = 101;
```

문법상 특정 경로만 바꾸더라도 PostgreSQL의 MVCC는 갱신된 행의 새 버전을 만듭니다. 변경된 JSONB가 인덱싱돼 있다면 관련 인덱스 항목도 갱신해야 합니다. 큰 문서에서 작은 필드를 매우 자주 바꾸는 구조는 쓰기량, WAL, TOAST 저장, vacuum 비용을 키울 수 있습니다.

특히 읽지 않은 알림 수처럼 갱신 빈도가 높고 동시 수정이 많은 값은 JSONB 밖의 일반 컬럼이나 별도 테이블에 두는 편이 낫습니다. 서로 다른 JSON 경로를 수정하더라도 잠금은 같은 행에 걸리며 JSONB가 필드 단위 동시성 제어를 제공하지는 않습니다.

### 신청서 수정 이력과 버전 관리

신청서 수정 이력은 현재 상태를 덮어쓰는 사용자 설정과 저장 목적이 다릅니다. 누가 언제 어떤 값을 바꿨는지 보존해야 하므로 기존 이력을 갱신하지 않고 수정할 때마다 새 행을 추가하는 append-only 방식이 적합합니다.

신청서 ID, 버전, 수정자는 일반 컬럼에 둡니다. 변경 항목마다 구조가 달라지는 변경 내역과 해당 버전의 전체 상태는 JSONB에 저장합니다.

```sql
CREATE TABLE application_revisions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  application_id bigint NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  editor_id bigint NOT NULL,
  edited_at timestamptz NOT NULL DEFAULT now(),
  changes jsonb NOT NULL,
  snapshot jsonb,
  CONSTRAINT uq_application_revisions_version
    UNIQUE (application_id, version),
  CONSTRAINT ck_application_revisions_changes_array
    CHECK (jsonb_typeof(changes) = 'array'),
  CONSTRAINT ck_application_revisions_snapshot_object
    CHECK (snapshot IS NULL OR jsonb_typeof(snapshot) = 'object')
);
```

신청서의 주소와 회사명이 변경된 두 번째 버전을 기록합니다.

```sql
INSERT INTO application_revisions (
  application_id,
  version,
  editor_id,
  changes,
  snapshot
)
VALUES (
  1001,
  2,
  501,
  '[
     {
       "path": "applicant.address",
       "before": "서울시 강남구",
       "after": "서울시 송파구"
     },
     {
       "path": "employment.companyName",
       "before": "A 회사",
       "after": "B 회사"
     }
   ]'::jsonb,
  '{
     "applicant": {"address": "서울시 송파구"},
     "employment": {"companyName": "B 회사"}
   }'::jsonb
);
```

변경 경로를 검색해야 한다면 `changes`에 GIN 인덱스를 만들 수 있습니다.

```sql
CREATE INDEX idx_application_revisions_changes_gin
  ON application_revisions
  USING GIN (changes);

SELECT application_id, version, editor_id, edited_at
FROM application_revisions
WHERE changes @> '[{"path": "applicant.address"}]'::jsonb;
```

오른쪽 객체에 `before`와 `after`를 적지 않아도 같은 `path`를 가진 배열 원소가 있으면 포함 조건을 만족합니다. 다만 변경 경로별 통계와 조인을 자주 수행한다면 변경 항목을 별도 자식 테이블의 행으로 저장하는 편이 낫습니다.

변경분만 저장하면 공간을 덜 사용하지만 특정 버전의 전체 신청서를 복원하려면 이전 이력을 순서대로 적용해야 합니다. 매 버전의 `snapshot`을 함께 저장하면 읽기와 복원은 단순해지지만 저장 공간과 개인정보 보존 범위가 커집니다. 이력이 길다면 일정 버전마다 스냅샷을 만들고 중간 버전은 변경분만 저장하는 방식을 검토할 수 있습니다.

`MAX(version) + 1`을 애플리케이션에서 계산해 바로 삽입하면 동시 수정 시 같은 버전 번호를 삽입하려다 충돌할 수 있습니다. 부모 신청서 행을 잠그고 버전을 증가시키거나 별도의 버전 할당 규칙을 같은 트랜잭션에 두어야 합니다. 변경 전후 값에는 개인정보가 계속 남을 수 있으므로 접근 권한, 암호화·마스킹, 보존 기간과 파기 정책도 함께 설계해야 합니다.

### JSONB에 저장할 키와 타입 검증

사용자 설정을 갱신하거나 신청서 이력을 추가할 때도 저장할 값의 구조는 검증해야 합니다. JSONB는 JSON 문법이 올바른지는 검사하지만, 애플리케이션이 기대하는 키와 타입까지 자동으로 검사하지 않습니다. 필요한 규칙은 `CHECK` 제약으로 명시할 수 있습니다.

```sql
ALTER TABLE user_preferences
ADD CONSTRAINT ck_user_preferences_required_settings
CHECK (
  settings ?& ARRAY['locale', 'theme', 'notifications']
  AND jsonb_typeof(settings->'locale') = 'string'
  AND jsonb_typeof(settings->'theme') = 'string'
  AND jsonb_typeof(settings->'notifications') = 'object'
  AND jsonb_typeof(
        settings #> '{notifications,channels}'
      ) = 'array'
);
```

### 일반 컬럼으로 옮겨야하는 기준

필수 키와 타입을 제약으로 보완할 수는 있습니다. 다만 같은 경로에 제약과 인덱스를 계속 추가하고 있다면, 그 값이 대부분의 행에서 필요한 공통 속성이 됐는지 확인합니다. 다음 항목은 일반 컬럼으로 옮길지 판단하는 기준입니다.

- 거의 모든 행에 같은 키가 존재합니다.
- `NOT NULL`, 외래 키, 유니크 제약이 필요합니다.
- 동등·범위 검색, 정렬, 조인, 집계에 자주 사용합니다.
- 해당 값만 독립적으로 자주 갱신합니다.
- 표현식 인덱스와 `CHECK` 제약이 계속 늘어납니다.
- 애플리케이션 여러 곳에서 같은 타입 변환 식을 반복합니다.

## MySQL JSON과의 차이

MySQL에는 PostgreSQL처럼 `json`과 `jsonb`가 따로 있지 않습니다. MySQL의 `JSON` 타입은 입력 문자열을 검증한 뒤 요소를 빠르게 찾을 수 있는 내부 바이너리 형식으로 변환해 저장합니다. 이름은 `JSON`이지만 파싱한 값을 저장한다는 점에서 PostgreSQL의 `jsonb`와 비슷합니다.

검색에 사용할 인덱스를 만드는 방식에는 차이가 있습니다.

| 구분                       | PostgreSQL `jsonb`                      | MySQL 8.4 `JSON`                                          |
| -------------------------- | --------------------------------------- | --------------------------------------------------------- |
| JSON 타입                  | 원문형 `json`과 바이너리형 `jsonb` 제공 | 바이너리 내부 형식을 사용하는 `JSON` 하나 제공            |
| 문법 검증                  | 유효한 JSON인지 검사                    | 유효한 JSON인지 검사                                      |
| 문서 전체 구조 검색 인덱스 | GIN으로 키와 값 또는 경로·값을 인덱싱   | JSON 컬럼 자체를 직접 인덱싱하지 않음                     |
| 스칼라 경로 인덱스         | B-tree 표현식 인덱스                    | 생성 컬럼 또는 함수 인덱스                                |
| 배열 원소 인덱스           | GIN 포함·존재 검색                      | InnoDB 다중 값 인덱스                                     |
| 경로 언어                  | PostgreSQL 연산자와 SQL/JSON Path       | MySQL JSON Path와 JSON 함수                               |
| 부분 갱신 저장 최적화      | 행의 새 버전을 만들고 JSONB 값을 갱신   | 조건을 만족하면 `JSON_SET` 등으로 부분 in-place 갱신 가능 |

### MySQL의 스칼라 경로 인덱스

MySQL에서는 검색할 경로의 값을 SQL 타입으로 추출해 함수 인덱스를 만듭니다. 다음은 일일 요약 알림 시간을 `UNSIGNED`로 변환하는 예제입니다.

```sql
CREATE TABLE user_preferences_mysql (
  id bigint NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id bigint NOT NULL,
  user_id bigint NOT NULL,
  settings json NOT NULL,
  UNIQUE KEY uq_user_preferences_tenant_user (tenant_id, user_id),
  INDEX idx_user_preferences_digest_hour (
    (
      JSON_VALUE(
        settings,
        '$.notifications.dailyDigestHour' RETURNING UNSIGNED
      )
    )
  )
);
```

쿼리에서도 인덱스 정의와 호환되는 표현식을 사용합니다.

```sql
EXPLAIN
SELECT id, user_id,
       JSON_VALUE(settings, '$.theme') AS theme
FROM user_preferences_mysql
WHERE JSON_VALUE(
        settings,
        '$.notifications.dailyDigestHour' RETURNING UNSIGNED
      ) BETWEEN 8 AND 12;
```

함수 인덱스를 사용하지 않는 버전이나 같은 값을 여러 곳에서 명시적으로 참조해야 하는 경우에는 생성 컬럼을 만들고 그 컬럼에 인덱스를 적용할 수 있습니다.

```sql
ALTER TABLE user_preferences_mysql
ADD COLUMN daily_digest_hour tinyint
  GENERATED ALWAYS AS (
    JSON_VALUE(
      settings,
      '$.notifications.dailyDigestHour' RETURNING UNSIGNED
    )
  ) STORED,
ADD INDEX idx_user_preferences_generated_digest_hour (
  daily_digest_hour
);
```

PostgreSQL의 문서 전체 GIN은 정해지지 않은 여러 경로를 포함 검색할 때 유연합니다. MySQL의 함수 인덱스는 검색할 경로를 미리 알아야 하지만, 그 경로의 동등·범위 검색과 정렬을 B-tree로 처리할 수 있습니다.

### MySQL의 배열 검색과 다중 값 인덱스

MySQL InnoDB는 JSON 배열의 각 원소를 보조 인덱스 항목으로 만드는 다중 값 인덱스(multi-valued index)를 제공합니다. 다음 예시에서는 숫자로 관리하는 알림 카테고리 ID 배열을 인덱싱합니다.

```sql
ALTER TABLE user_preferences_mysql
ADD INDEX idx_user_preferences_category_ids (
  (
    CAST(
      settings->'$.notifications.categoryIds'
      AS UNSIGNED ARRAY
    )
  )
);
```

이 인덱스는 `MEMBER OF`, `JSON_CONTAINS`, `JSON_OVERLAPS`를 사용하는 조건에 활용할 수 있습니다.

```sql
-- categoryIds에 신청 상태 알림 ID 101이 있는 사용자
SELECT id, user_id
FROM user_preferences_mysql
WHERE 101 MEMBER OF (
  settings->'$.notifications.categoryIds'
);

-- 신청 상태 101과 보안 205를 모두 구독한 사용자
SELECT id, user_id
FROM user_preferences_mysql
WHERE JSON_CONTAINS(
  settings->'$.notifications.categoryIds',
  CAST('[101, 205]' AS JSON)
);

-- 101 또는 205 중 하나 이상을 구독한 사용자
SELECT id, user_id
FROM user_preferences_mysql
WHERE JSON_OVERLAPS(
  settings->'$.notifications.categoryIds',
  CAST('[101, 205]' AS JSON)
);
```

다중 값 인덱스는 PostgreSQL의 문서 전체 GIN과 같지 않습니다. 한 인덱스에 다중 값 키 파트는 하나만 둘 수 있고, 정렬·범위 스캔·인덱스 전용 스캔을 지원하지 않습니다. 빈 배열에는 인덱스 항목도 만들지 않습니다. 배열에 특정 원소가 있는지 찾는 용도로 사용합니다.

### MySQL의 부분 갱신

MySQL 8.4는 일정 조건을 만족하면 `JSON_SET`, `JSON_REPLACE`, `JSON_REMOVE`로 변경한 부분만 제자리 갱신할 수 있습니다.

```sql
UPDATE user_preferences_mysql
SET settings = JSON_SET(
  settings,
  '$.notifications.push.enabled',
  false
)
WHERE tenant_id = 1
  AND user_id = 101;
```

부분 갱신은 항상 적용되는 것이 아닙니다. 같은 JSON 컬럼을 입력과 대상으로 사용해야 하고, 기존 값을 교체해야 하며, 새 값이 기존 저장 공간보다 크지 않은 등의 조건이 있습니다. 행 기반 복제의 바이너리 로그에 부분 변경만 기록하려면 `binlog_row_value_options=PARTIAL_JSON` 설정도 별도로 필요합니다.

이 최적화는 저장할 데이터와 로그의 크기를 줄입니다. 서로 다른 JSON 경로를 동시에 수정할 때 필드별 잠금을 제공한다는 뜻은 아닙니다. PostgreSQL과 MySQL 모두 같은 행을 동시에 수정할 때의 잠금과 트랜잭션 처리를 고려해야 합니다.

## 적용 전에 확인할 기준

예제에서 살펴본 차이를 실제 모델에 적용할 때는 저장할 값의 성격부터 정하고, 조회와 갱신 패턴에 맞춰 인덱스를 선택합니다.

### JSONB가 잘 맞는 경우

- 외부 API 응답이나 이벤트 원문처럼 구조가 공급자별로 다릅니다.
- 사용자별 설정·알림 옵션처럼 일부 사용자에게만 필요한 키가 있습니다.
- 신청서 버전별 변경 경로와 이전·이후 값의 구조가 달라집니다.
- 구조 전체의 포함 여부나 배열 원소를 자주 검색합니다.
- 스키마 변경 없이 선택적 속성을 점진적으로 추가해야 합니다.
- 원본 스냅샷을 보존하면서 일부 공통 필드만 일반 컬럼으로 추출합니다.

### 일반 컬럼과 테이블이 더 나은 경우

- 신청서 ID, 버전, 수정자, 사용자 ID처럼 핵심 도메인 규칙에 속합니다.
- 외래 키, 유니크, `NOT NULL` 등 강한 무결성이 필요합니다.
- 조인, 범위 검색, 정렬, 그룹 집계에 반복해서 사용합니다.
- 서로 다른 필드를 높은 빈도로 독립 갱신합니다.
- 문서 크기가 제한 없이 커지거나 배열 원소를 개별 행처럼 다뤄야 합니다.

### 인덱스를 선택하는 순서

JSONB에 저장할 범위를 정했다면 실제 쿼리의 조건과 정렬 방식에 맞춰 인덱스를 선택합니다.

1. 운영 쿼리의 `WHERE`, `ORDER BY`, 조인 조건을 수집합니다.
2. 포함·존재 검색인지 스칼라의 동등·범위 검색인지 구분합니다.
3. 포함·존재 검색이면 GIN과 연산자 클래스를 검토합니다.
4. 특정 경로의 범위·정렬이면 타입을 고정한 B-tree 표현식 인덱스를 검토합니다.
5. 특정 경로만 반복 검색하면 문서 전체보다 표현식 인덱스를 우선 비교합니다.
6. `ANALYZE` 후 실제 데이터 분포에서 `EXPLAIN (ANALYZE, BUFFERS)`로 확인합니다.
7. 읽기 성능뿐 아니라 인덱스 크기, 쓰기 처리량, p95·p99 지연, vacuum 비용도 함께 측정합니다.

문서 전체 GIN, 경로별 GIN, 여러 B-tree 표현식 인덱스를 함께 두면 JSONB 갱신 시 유지할 인덱스도 늘어납니다. 사용하지 않는 인덱스는 읽기 이점 없이 저장 공간과 쓰기 비용만 늘립니다.

## 연산자와 함수 참고

본문에서 다룬 예제 외에 필요한 연산자와 함수를 찾아볼 수 있도록 모았습니다.

<details markdown="1">
<summary>연산자와 함수 목록 펼치기</summary>

### JSON과 JSONB 연산자

PostgreSQL 18이 제공하는 JSON·JSONB 연산자를 역할별로 정리하면 다음과 같습니다. 추출 연산자는 `json`과 `jsonb`에서 모두 사용할 수 있고, 나머지 JSON 전용 연산자는 `jsonb`에서만 사용할 수 있습니다. 일반 비교 연산자도 `jsonb`에는 적용할 수 있지만 `json`에는 적용할 수 없습니다.

#### 추출

- `-> text` → 입력과 같은 `json` 또는 `jsonb`: 객체에서 지정한 키의 값을 JSON으로 반환합니다.
  - 예시: `'{"a": 1}'::jsonb -> 'a'` → `1`
- `-> integer` → 입력과 같은 `json` 또는 `jsonb`: 배열에서 지정한 위치의 값을 JSON으로 반환합니다. 위치는 0부터 시작하며 음수는 끝에서부터 계산합니다.
  - 예시: `'["a", "b"]'::jsonb -> 1` → `"b"`
- `->> text` → `text`: 객체에서 지정한 키의 값을 문자열로 반환합니다.
  - 예시: `'{"a": 1}'::jsonb ->> 'a'` → `1`(text)
- `->> integer` → `text`: 배열에서 지정한 위치의 값을 문자열로 반환합니다.
  - 예시: `'["a", "b"]'::jsonb ->> 1` → `b`
- `#> text[]` → 입력과 같은 `json` 또는 `jsonb`: 지정한 경로의 값을 JSON으로 반환합니다.
  - 예시: `'{"a": {"b": "x"}}'::jsonb #> '{a,b}'` → `"x"`
- `#>> text[]` → `text`: 지정한 경로의 값을 문자열로 반환합니다.
  - 예시: `'{"a": {"b": "x"}}'::jsonb #>> '{a,b}'` → `x`

#### 포함과 존재

- `@> jsonb` → `boolean`: 왼쪽 JSONB가 오른쪽 JSONB 구조를 포함하는지 검사합니다.
  - 예시: `'{"a": 1}'::jsonb @> '{"a": 1}'::jsonb` → `true`
- `<@ jsonb` → `boolean`: 왼쪽 JSONB가 오른쪽 JSONB 구조에 포함되는지 검사합니다.
  - 예시: `'{"a": 1}'::jsonb <@ '{"a": 1, "b": 2}'::jsonb` → `true`
- `? text` → `boolean`: 문자열이 최상위 객체 키나 배열 원소로 존재하는지 검사합니다.
  - 예시: `'{"a": 1}'::jsonb ? 'a'` → `true`
- `?| text[]` → `boolean`: 문자열 배열 중 하나 이상이 최상위 키나 배열 원소로 존재하는지 검사합니다.
  - 예시: `'{"a": 1}'::jsonb ?| ARRAY['a', 'b']` → `true`
- `?& text[]` → `boolean`: 문자열 배열의 모든 값이 최상위 키나 배열 원소로 존재하는지 검사합니다.
  - 예시: `'{"a": 1, "b": 2}'::jsonb ?& ARRAY['a', 'b']` → `true`

#### 결합과 삭제

- `|| jsonb` → `jsonb`: 배열을 이어 붙이거나 객체의 최상위 키를 병합합니다. 중복 키는 오른쪽 값이 우선하며 재귀적으로 병합하지 않습니다.
  - 예시: `'{"a": 1}'::jsonb || '{"b": 2}'::jsonb` → `{"a": 1, "b": 2}`
- `- text` → `jsonb`: 객체 키 또는 배열에서 일치하는 문자열 원소를 삭제합니다.
  - 예시: `'{"a": 1, "b": 2}'::jsonb - 'a'` → `{"b": 2}`
- `- text[]` → `jsonb`: 객체 키 또는 배열에서 일치하는 여러 원소를 삭제합니다.
  - 예시: `'{"a": 1, "b": 2}'::jsonb - ARRAY['a', 'b']` → `{}`
- `- integer` → `jsonb`: 배열에서 지정한 위치의 원소를 삭제합니다. 음수는 끝에서부터 계산합니다.
  - 예시: `'["a", "b"]'::jsonb - 0` → `["b"]`
- `#- text[]` → `jsonb`: 지정한 경로의 객체 필드나 배열 원소를 삭제합니다.
  - 예시: `'{"a": {"b": 1}}'::jsonb #- '{a,b}'` → `{"a": {}}`

#### JSONPath

- `@? jsonpath` → `boolean`: JSONPath가 하나 이상의 항목을 반환하는지 검사합니다.
  - 예시: `'{"a": [1, 2]}'::jsonb @? '$.a[*] ? (@ > 1)'` → `true`
- `@@ jsonpath` → `boolean`: JSONPath 조건식이 반환한 단일 불리언 결과를 사용합니다.
  - 예시: `'{"a": 2}'::jsonb @@ '$.a > 1'` → `true`

#### 비교

- `=`, `<>` → `boolean`: 전체 JSONB 값이 같거나 다른지 비교합니다.
  - 예시: `'{"a": 1}'::jsonb = '{"a": 1}'::jsonb` → `true`
- `<`, `<=`, `>`, `>=` → `boolean`: JSONB의 B-tree 정렬 규칙에 따라 전체 값을 비교합니다.
  - 예시: `'1'::jsonb < '2'::jsonb` → `true`

### 자주 사용하는 JSONB 함수

#### 생성과 변환

- `to_jsonb(anyelement) → jsonb`: SQL 값을 JSONB로 변환합니다.
  - 예시: `to_jsonb(ROW(1, 'a'::text))` → `{"f1": 1, "f2": "a"}`
- `jsonb_build_array(VARIADIC any) → jsonb`: 여러 SQL 값으로 JSONB 배열을 만듭니다.
  - 예시: `jsonb_build_array(1, 'a'::text)` → `[1, "a"]`
- `jsonb_build_object(VARIADIC any) → jsonb`: 키와 값을 번갈아 받아 JSONB 객체를 만듭니다.
  - 예시: `jsonb_build_object('a', 1)` → `{"a": 1}`
- `jsonb_object(text[]) → jsonb`: 문자열 배열을 키·값 쌍으로 해석해 객체를 만듭니다.
  - 예시: `jsonb_object(ARRAY['a', '1'])` → `{"a": "1"}`

#### 정보 확인과 분해

- `jsonb_typeof(jsonb) → text`: 최상위 값의 JSON 타입을 반환합니다.
  - 예시: `jsonb_typeof('{"a": 1}'::jsonb)` → `object`
- `jsonb_array_length(jsonb) → integer`: 최상위 배열의 원소 수를 반환합니다.
  - 예시: `jsonb_array_length('[1, 2]'::jsonb)` → `2`
- `jsonb_object_keys(jsonb) → setof text`: 최상위 객체의 키를 행으로 반환합니다.
  - 예시: `SELECT jsonb_object_keys('{"a": 1, "b": 2}'::jsonb)` → `a`, `b`
- `jsonb_array_elements(jsonb) → setof jsonb`: 최상위 배열 원소를 JSONB 행으로 반환합니다.
  - 예시: `SELECT jsonb_array_elements('[1, 2]'::jsonb)` → `1`, `2`
- `jsonb_array_elements_text(jsonb) → setof text`: 최상위 배열 원소를 문자열 행으로 반환합니다.
  - 예시: `SELECT jsonb_array_elements_text('["a", "b"]'::jsonb)` → `a`, `b`
- `jsonb_each(jsonb) → setof record`: 최상위 객체를 `key`, JSONB `value` 행으로 반환합니다.
  - 예시: `SELECT * FROM jsonb_each('{"a": 1}'::jsonb)` → `(a, 1)`
- `jsonb_each_text(jsonb) → setof record`: 최상위 객체를 `key`, text `value` 행으로 반환합니다.
  - 예시: `SELECT * FROM jsonb_each_text('{"a": 1}'::jsonb)` → `(a, 1)`

#### 경로 추출과 레코드 변환

- `jsonb_extract_path(jsonb, VARIADIC text[]) → jsonb`: 가변 길이 경로의 값을 JSONB로 반환하며 `#>`와 같은 역할을 합니다.
  - 예시: `jsonb_extract_path('{"a": {"b": 1}}'::jsonb, 'a', 'b')` → `1`
- `jsonb_extract_path_text(jsonb, VARIADIC text[]) → text`: 경로의 값을 문자열로 반환하며 `#>>`와 같은 역할을 합니다.
  - 예시: `jsonb_extract_path_text('{"a": {"b": 1}}'::jsonb, 'a', 'b')` → `1`(text)
- `jsonb_to_record(jsonb) → record`: JSONB 객체를 지정한 SQL 레코드 타입으로 변환합니다.
  - 예시: `SELECT * FROM jsonb_to_record('{"a": 1, "b": "x"}') AS x(a int, b text)` → `(1, x)`
- `jsonb_to_recordset(jsonb) → setof record`: JSONB 객체 배열을 SQL 레코드 행으로 변환합니다.
  - 예시: `SELECT * FROM jsonb_to_recordset('[{"a": 1}, {"a": 2}]') AS x(a int)` → `(1)`, `(2)`

#### 수정

- `jsonb_set(jsonb, text[], jsonb [, boolean]) → jsonb`: 지정한 경로의 값을 교체하거나 `create_if_missing`이 참이면 생성합니다.
  - 예시: `jsonb_set('{"a": 1}', '{a}', '2')` → `{"a": 2}`
- `jsonb_set_lax(jsonb, text[], jsonb [, boolean [, text]]) → jsonb`: 새 값이 SQL `NULL`일 때 유지·JSON null·삭제·오류 중 처리 방식을 선택합니다.
  - 예시: `jsonb_set_lax('{"a": 1}', '{a}', NULL, true, 'delete_key')` → `{}`
- `jsonb_insert(jsonb, text[], jsonb [, boolean]) → jsonb`: 배열 위치나 존재하지 않는 객체 키에 값을 삽입합니다.
  - 예시: `jsonb_insert('{"a": [1, 2]}', '{a,1}', '0')` → `{"a": [1, 0, 2]}`
- `jsonb_strip_nulls(jsonb [, boolean]) → jsonb`: 객체의 JSON null 필드를 제거하며, 두 번째 인자가 참이면 배열의 null도 제거합니다.
  - 예시: `jsonb_strip_nulls('{"a": null, "b": 1}')` → `{"b": 1}`

#### JSONPath

- `jsonb_path_exists(jsonb, jsonpath [, jsonb [, boolean]]) → boolean`: JSONPath가 하나 이상의 항목을 찾는지 검사합니다.
  - 예시: `jsonb_path_exists('{"a": [1, 2]}', '$.a[*] ? (@ > 1)')` → `true`
- `jsonb_path_match(jsonb, jsonpath [, jsonb [, boolean]]) → boolean`: JSONPath 조건식의 단일 불리언 결과를 반환합니다.
  - 예시: `jsonb_path_match('{"a": 2}', '$.a > 1')` → `true`
- `jsonb_path_query(jsonb, jsonpath [, jsonb [, boolean]]) → setof jsonb`: JSONPath가 찾은 모든 항목을 행으로 반환합니다.
  - 예시: `SELECT jsonb_path_query('{"a": [1, 2, 3]}', '$.a[*] ? (@ > 1)')` → `2`, `3`
- `jsonb_path_query_array(jsonb, jsonpath [, jsonb [, boolean]]) → jsonb`: 찾은 모든 항목을 하나의 배열로 반환합니다.
  - 예시: `jsonb_path_query_array('{"a": [1, 2, 3]}', '$.a[*] ? (@ > 1)')` → `[2, 3]`
- `jsonb_path_query_first(jsonb, jsonpath [, jsonb [, boolean]]) → jsonb`: 찾은 첫 항목만 반환합니다.
  - 예시: `jsonb_path_query_first('{"a": [1, 2, 3]}', '$.a[*] ? (@ > 1)')` → `2`

#### 출력과 집계

- `jsonb_pretty(jsonb) → text`: JSONB 값을 들여쓰기한 문자열로 반환합니다.
  - 예시: `jsonb_pretty('{"a": [1, 2]}'::jsonb)` → 줄바꿈과 들여쓰기가 적용된 text
- `jsonb_agg(anyelement) → jsonb`: 입력 행을 JSONB 배열 하나로 집계합니다.
  - 예시: `SELECT jsonb_agg(v) FROM (VALUES (1), (2)) AS t(v)` → `[1, 2]`
- `jsonb_object_agg(key, value) → jsonb`: 입력 행의 키와 값을 JSONB 객체 하나로 집계합니다.
  - 예시: `SELECT jsonb_object_agg(k, v) FROM (VALUES ('a', 1), ('b', 2)) AS t(k, v)` → `{"a": 1, "b": 2}`

`jsonb_path_*` 함수에는 시간대가 필요한 날짜·시간 비교를 위한 `_tz` 변형도 있습니다. 이 함수들은 현재 세션의 `TimeZone` 설정에 의존해 `STABLE`로 분류되므로 인덱스 표현식에는 사용할 수 없습니다. 집계 함수에도 `NULL`을 건너뛰는 `strict`, 중복 키를 거부하는 `unique` 변형이 있지만 여기서는 기본 함수만 다룹니다.

</details>

## 정리

JSONB에 저장할 범위는 데이터 구조뿐 아니라 조회와 갱신 방식으로 판단해야 합니다. 사용자 설정처럼 선택적인 속성은 JSONB에 두고, 제약·조인에 반복해서 쓰거나 독립적으로 자주 갱신하는 값은 일반 컬럼이나 별도 테이블로 분리하는 편이 낫습니다.

- **검색 조건:** 포함·존재 검색은 GIN, 특정 값의 동등·범위 검색과 정렬은 B-tree 표현식 인덱스를 검토합니다. 실제 쿼리의 표현식과 연산자가 인덱스 정의에 맞아야 합니다.
- **인덱스 비용:** 실행 시간과 함께 인덱스 크기, 쓰기 처리량, 갱신 지연을 비교합니다. 상품 예제와 문서 구조나 데이터 분포가 다르다면 해당 데이터로 다시 측정해야 합니다.
- **타입과 DB 선택:** 원문 보존이 필요하면 `json`, 검색과 인덱싱이 필요하면 `jsonb`를 검토합니다. MySQL JSON도 바이너리 형식을 사용하지만 인덱스를 구성하는 방식은 다릅니다.

## 출처

- [PostgreSQL 18 - JSON Types](https://www.postgresql.org/docs/18/datatype-json.html)
- [PostgreSQL 18 - JSON Functions and Operators](https://www.postgresql.org/docs/18/functions-json.html)
- [PostgreSQL 18 - GIN Indexes](https://www.postgresql.org/docs/18/gin.html)
- [MySQL 8.4 - The JSON Data Type](https://dev.mysql.com/doc/refman/8.4/en/json.html)
- [MySQL 8.4 - CREATE INDEX Statement](https://dev.mysql.com/doc/refman/8.4/en/create-index.html)
