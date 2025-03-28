---
title: 초기데이터 구축문제 해결법(feat. faker)
description: 진짜 데이터와 유사한 생성
author: ydj515
date: 2025-03-11 11:33:00 +0800
categories: [dummy data, python, faker]
tags: [python, dummy data, faker, troubleshooting]
pin: true
math: true
mermaid: true
image:
  path: /assets/img/faker/logo.png
  lqip: data:image/webp;base64,UklGRpoAAABXRUJQVlA4WAoAAAAQAAAADwAABwAAQUxQSDIAAAARL0AmbZurmr57yyIiqE8oiG0bejIYEQTgqiDA9vqnsUSI6H+oAERp2HZ65qP/VIAWAFZQOCBCAAAA8AEAnQEqEAAIAAVAfCWkAALp8sF8rgRgAP7o9FDvMCkMde9PK7euH5M1m6VWoDXf2FkP3BqV0ZYbO6NA/VFIAAAA
  alt: python
---

## Python Faker

개발 및 테스트 환경에서 초기 데이터를 구축하는 작업은 종종 시간이 많이 소모되며, 특히 실제 데이터와 유사한 데이터를 구축하는 데에는 더 많은 어려움이 따릅니다. 반복되는 데이터는 비교적 쉽게 처리할 수 있지만, 이름, 주소, 전화번호, 이메일 등 다양한 유형의 데이터를 실제와 유사하게 생성하려면 상당한 시간이 소요됩니다.

이러한 수동 생성 작업은 매우 비효율적이고 시간이 많이 걸리므로, 자동화된 방식으로 다양한 유형의 테스트 데이터를 빠르게 생성할 수 있는 도구의 필요성이 커졌습니다.

이와 같은 배경에서, Python Faker 라이브러리를 사용하여 자동화된 더미 데이터 생성을 시도하게 되었습니다. 이를 통해 초기 데이터를 신속하게 구축하고, 개발 및 테스트를 보다 효율적으로 진행할 수 있었습니다.

Faker는 테스트 데이터를 손쉽게 생성할 수 있도록 돕는 Python 라이브러리로, 이름, 주소, 전화번호, 이메일, 신용카드 번호 등 다양한 유형의 데이터를 무작위로 생성할 수 있습니다. 이 라이브러리는 데이터베이스 더미 데이터 생성, 테스트 자동화, 데이터 마스킹 등에 유용하게 활용될 수 있습니다.

### 주요 기능
- 다양한 데이터 유형 지원 (이름, 주소, 이메일, 전화번호, 날짜, 텍스트 등)
- 로컬라이제이션 지원 (다양한 국가별 데이터 생성 가능)
- 동일한 시드(seed) 설정을 통한 재현 가능성 제공

### Faker install

Faker는 `pip`을 통해 간단하게 설치할 수 있습니다.

```sh
pip install faker
```

## 사용법

Faker를 사용하려면 먼저 `Faker` 객체를 생성한 후 필요한 데이터를 호출하면 됩니다.


### 데이터 생성
```python
from faker import Faker

fake = Faker()

print(fake.name())        # 랜덤한 이름 생성 : Cathy Ryan
print(fake.address())     # 랜덤한 주소 생성 : 9635 Samantha Neck
print(fake.email())       # 랜덤한 이메일 생성 : gomezjuan@example.org
print(fake.phone_number()) # 랜덤한 전화번호 생성 : 707-508-4521
print(fake.text())        # 랜덤한 텍스트 생성 : Professor true today director federal reality onto. Doctor right where likely once degree very boy. Act fall campaign third film audience itself. Would concern health friend listen arm.
```

### 특정 국가 데이터 생성 (로컬라이제이션)
Faker는 여러 국가의 데이터를 생성할 수 있습니다. 한국 데이터를 생성하려면 `ko_KR`을 설정하면 됩니다.

```python
fake_kr = Faker('ko_KR')

print(fake_kr.name())    # 한글 이름 생성 : 장진호
print(fake_kr.address()) # 한국 주소 생성 : 세종특별자치시 강남구 테헤란로 846-33 (광수한면)
```

### 시드(seed) 설정 (동일한 데이터 생성)
동일한 시드 값을 설정하면 매 실행마다 동일한 데이터를 생성할 수 있습니다.

```python
fake = Faker()
fake.seed_instance(42)

print(fake.name())  # 동일한 이름 생성
print(fake.email()) # 동일한 이메일 생성
```

### JSON 형식의 데이터 생성
Faker는 JSON 데이터도 쉽게 생성할 수 있습니다.

```python
import json

fake_data = {
    "name": fake.name(),
    "email": fake.email(),
    "address": fake.address()
}

print(json.dumps(fake_data, indent=4, ensure_ascii=False))
```

### 커스텀 데이터 생성
Faker를 활용하여 특정 형식의 데이터를 커스텀할 수도 있습니다.

```python
class CustomProvider:
    def job_title(self):
        return "Senior Software Engineer"

fake = Faker()
fake.add_provider(CustomProvider)

print(fake.job_title())  # "Senior Software Engineer" 출력
```

### default provider

다양한 provider를 제공합니다. ([링크](https://faker.readthedocs.io/en/master/providers.html))

![alt text](/assets/img/faker/provider.png)


### 주요 메소드


| 항목                                                       | 설명                                                          |
| ---------------------------------------------------------- | ------------------------------------------------------------- |
| `fake.name()`                                              | 이름                                                          |
| `fake.address()`                                           | 주소                                                          |
| `fake.postcode()`                                          | 우편 번호                                                     |
| `fake.country()`                                           | 국가명                                                        |
| `fake.company()`                                           | 회사명                                                        |
| `fake.job()`                                               | 직업명                                                        |
| `fake.phone_number()`                                      | 휴대 전화 번호                                                |
| `fake.email()`                                             | 이메일 주소                                                   |
| `fake.user_name()`                                         | 사용자명                                                      |
| `fake.pyint(min_value=0, max_value=100)`                   | 0부터 100 사이의 임의의 숫자                                  |
| `fake.ipv4_private()`                                      | IP 주소                                                       |
| `fake.text()`                                              | 임의의 문장 (※ 한글 임의의 문장은 `fake.catch_phrase()` 사용) |
| `fake.color_name()`                                        | 색상명                                                        |
| `fake.date_of_birth(minimum_age=18, maximum_age=90)`       | 생년월일 생성                                                 |
| `fake.currency_name()`                                     | 통화명                                                        |
| `fake.company_email()`                                     | 회사 이메일                                                   |
| `fake.ssn()`                                               | 주민등록번호(유사)                                            |
| `fake.credit_card_number()`                                | 신용카드 번호                                                 |
| `fake.license_plate()`                                     | 차량 번호판                                                   |
| `fake.date_time_between(start_date="-5y", end_date="now")` | 날짜                                                          |
| `fake.uuid4()`                                             | UUID v4                                                       |


## mysql insert 예시

아래는 mysql에 데이터를 넣는 python script입니다.

user, product, reservation, log 테이블에 데이터를 넣는 예시입니다.

먼저 아래와 같이 테이블을 생성합니다.

```sql
create table if not exists test_db.users
(
    id         bigint auto_increment
        primary key,
    name       varchar(255)                        not null,
    email      varchar(255)                        not null,
    phone      varchar(255)                        not null,
    address    varchar(255)                        null,
    birthdate  datetime(6)                         null,
    created_at timestamp default CURRENT_TIMESTAMP null
);

create table if not exists test_db.products
(
    id          bigint auto_increment
        primary key,
    name        varchar(100)                                                       not null,
    category    enum ('ELECTRONICS', 'FASHION', 'FOOD', 'BOOKS', 'HOME', 'SPORTS') not null,
    description varchar(500)                                                       not null,
    price       decimal(38, 2)                                                     not null,
    stock       int       default 0                                                null,
    created_at  timestamp default CURRENT_TIMESTAMP                                null
);

create table if not exists test_db.reservations
(
    id               bigint auto_increment
        primary key,
    user_id          bigint                                                                                       not null,
    product_id       bigint                                                                                       not null,
    quantity         bigint                                                                                       null,
    total_price      bigint                                                                                       null,
    status           enum ('PENDING', 'CONFIRMED', 'CANCELLED', 'SHIPPED', 'DELIVERED') default 'PENDING'         null,
    payment_method   enum ('CREDIT_CARD', 'PAYPAL', 'BANK_TRANSFER', 'CASH')                                      not null,
    shipping_address varchar(255)                                                                                 null,
    created_at       timestamp                                                          default CURRENT_TIMESTAMP null,
    updated_at       timestamp                                                          default CURRENT_TIMESTAMP null on update CURRENT_TIMESTAMP,
    constraint reservations_ibfk_1
        foreign key (user_id) references test_db.users (id)
            on delete cascade,
    constraint reservations_ibfk_2
        foreign key (product_id) references test_db.products (id)
            on delete cascade
);

create index product_id
    on test_db.reservations (product_id);

create index user_id
    on test_db.reservations (user_id);

create table if not exists test_db.logs
(
    id             bigint auto_increment
        primary key,
    action         varchar(255)                   null,
    created_at     datetime(6)                    not null,
    log_type       enum ('ERROR', 'INFO', 'WARN') null,
    message        varchar(255)                   null,
    reservation_id bigint                         null
);
```

그 다음 아래의 명령어를 실행하여 필요 library를 설치합니다.

```sh
pip install mysql-connector-python faker tqdm
```

마지막으로 python script를 실행합니다.
```python
import mysql.connector
from faker import Faker
import random
from tqdm import tqdm

# MySQL 연결 설정
conn = mysql.connector.connect(
    host="localhost",
    user="test",
    password="test",
    database="test_db"
)
cursor = conn.cursor()

fake = Faker()
BATCH_SIZE = 10_000

# 카테고리 및 결제 수단 정의
PRODUCT_CATEGORIES = ['ELECTRONICS', 'FASHION', 'FOOD', 'BOOKS', 'HOME', 'SPORTS']
PAYMENT_METHODS = ['CREDIT_CARD', 'PAYPAL', 'BANK_TRANSFER', 'CASH']

print("Inserting users...")
users = [
    (fake.name(),
    fake.email(),
    fake.phone_number(),
    fake.address(),
    fake.date_of_birth(minimum_age=18, maximum_age=80)) # 18살 이상 80세 이하
    for _ in range(10)
]
for i in tqdm(range(0, len(users), BATCH_SIZE)):
    cursor.executemany("INSERT INTO users (name, email, phone, address, birthdate) VALUES (%s, %s, %s, %s, %s)", users[i:i+BATCH_SIZE])
    conn.commit()

print("Inserting products...")
products = [
    (fake.word(),
    random.choice(PRODUCT_CATEGORIES),
    fake.sentence(),
    round(random.uniform(10, 500), 2),
    random.randint(1, 100))
    for _ in range(10)
]
for i in tqdm(range(0, len(products), BATCH_SIZE)):
    cursor.executemany("INSERT INTO products (name, category, description, price, stock) VALUES (%s, %s, %s, %s, %s)", products[i:i+BATCH_SIZE])
    conn.commit()

# users, products ID 가져오기
cursor.execute("SELECT id FROM users")
user_ids = [row[0] for row in cursor.fetchall()]
cursor.execute("SELECT id FROM products")
product_ids = [row[0] for row in cursor.fetchall()]

print("Inserting reservations...")
reservations = [
    (random.choice(user_ids),
    random.choice(product_ids),
    random.randint(1, 5),
    round(random.uniform(20, 2500), 2),
    random.choice(['PENDING', 'CONFIRMED', 'CANCELLED', 'SHIPPED', 'DELIVERED']),
    random.choice(PAYMENT_METHODS), fake.address())
    for _ in range(10)
]
for i in tqdm(range(0, len(reservations), BATCH_SIZE)):
    cursor.executemany("INSERT INTO reservations (user_id, product_id, quantity, total_price, status, payment_method, shipping_address) VALUES (%s, %s, %s, %s, %s, %s, %s)", reservations[i:i+BATCH_SIZE])
    conn.commit()

# reservations ID 가져오기
cursor.execute("SELECT id FROM reservations")
reservation_ids = [row[0] for row in cursor.fetchall()]

print("Inserting logs...")
logs = [
    (random.choice(reservation_ids),
    random.choice(['INFO', 'WARN', 'ERROR']),
    fake.sentence(),
    '{"source": "system", "debug_id": "' + fake.uuid4() + '"}',
    fake.date_time_between(start_date="-5y", end_date="now"))
    for _ in range(10)
]
for i in tqdm(range(0, len(logs), BATCH_SIZE)):
    cursor.executemany("INSERT INTO logs (reservation_id, log_type, message, action, created_at) VALUES (%s, %s, %s, %s, %s)", logs[i:i+BATCH_SIZE])
    conn.commit()

print("Data Insertion Complete!")
cursor.close()
conn.close()

```

아래와 같이 손쉽게 데이터가 들어가는 것을 볼 수 있습니다.

![alt text](/assets/img/faker/data.png)

## 결론

`faker`는 다양한 유형의 가짜 데이터를 생성하는 강력한 라이브러리입니다.

로컬라이제이션을 활용하여 다양한 국가의 데이터를 생성할 수 있으며 시드 설정을 통해 재현 가능성을 보장할 수 있습니다.

이러한 특성으로 데이터베이스, JSON, Django 모델 등 다양한 환경에서 활용할 수 있습니다.

[출처]
- https://pypi.org/project/Faker/
- https://github.com/joke2k/faker
- https://faker.readthedocs.io/en/master/index.html