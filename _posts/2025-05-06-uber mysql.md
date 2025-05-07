---
title: Why Uber Moved from Postgres to MySQL
description: Why Uber Moved from Postgres to MySQL
author: ydj515
date: 2025-05-06 11:33:00 +0800
categories: [uber, mysql, postgresql]
tags: [uber, mysql, postgresql]
pin: true
math: true
mermaid: true
image:
  path: /assets/img/mysql/logo.png
  lqip: data:image/webp;base64,UklGRpoAAABXRUJQVlA4WAoAAAAQAAAADwAABwAAQUxQSDIAAAARL0AmbZurmr57yyIiqE8oiG0bejIYEQTgqiDA9vqnsUSI6H+oAERp2HZ65qP/VIAWAFZQOCBCAAAA8AEAnQEqEAAIAAVAfCWkAALp8sF8rgRgAP7o9FDvMCkMde9PK7euH5M1m6VWoDXf2FkP3BqV0ZYbO6NA/VFIAAAA
  alt: mysql
---

## Uber가 Postgres 에서 MySQL로 전환한 이유

> [링크](https://medium.com/databases-in-simple-words/why-uber-moved-from-postgres-to-mysql-b6ecfa9ff0d9) 의 글을 읽고 번역 및 요약하였습니다. 

Uber는 초기에는 Python으로 작성된 모놀리식 백엔드 애플리케이션에서 PostgreSQL을 사용하여 데이터 영속성을 관리했습니다. 그러나 시간이 지나면서 Uber의 아키텍처는 마이크로서비스와 새로운 데이터 플랫폼 모델로 크게 변화하였고, 이에 따라 데이터베이스 요구사항도 달라졌습니다. 이러한 변화에 대응하기 위해 Uber는 PostgreSQL에서 MySQL로의 전환을 결정하였습니다.

## PostgreSQL에서의 주요 한계 및 문제점

Uber는 PostgreSQL 사용 중 다음과 같은 핵심적인 문제를 경험했습니다:

### 1. 쓰기 작업의 비효율성

PostgreSQL은 모든 인덱스를 동기적으로 업데이트해야 하는 구조로 인해, 대규모 쓰기 작업에서 성능 병목이 발생했습니다. 특히 Uber와 같이 고빈도 트랜잭션이 발생하는 환경에서는 큰 제약으로 작용했습니다.

### 2. 복제 메커니즘의 한계
PostgreSQL의 WAL(Write-Ahead Logging) 기반 복제는 대역폭 소모가 크고, 네트워크 지연이 큰 환경(예: 다중 데이터 센터 간)에서는 데이터 복제 지연과 안정성 문제가 발생했습니다.

### 3. 테이블 손상 문제
PostgreSQL 9.2 환경에서 마스터 승격(failover) 시 심각한 테이블 손상 사례가 발생하며 신뢰성에 타격을 입었습니다. 이는 Uber에게 대규모 서비스 환경에서 치명적인 이슈였습니다.

### 4. 복제본에서의 일관성 부족
PostgreSQL의 복제본은 MVCC(Multi-Version Concurrency Control)를 완전하게 지원하지 않아, 읽기 전용 복제본에서 일관성 있는 데이터를 조회하는 데 어려움이 있었습니다.

### 5. 서비스 중단을 요구하는 업그레이드
PostgreSQL은 메이저 업그레이드 시 롤링 업그레이드가 지원되지 않아 필연적으로 서비스 중단이 발생했습니다. 이는 Uber와 같은 24/7 서비스에는 큰 부담이었습니다.

## MySQL로의 전환 및 그 이유

이러한 문제를 해결하기 위해 Uber는 자체 데이터 샤딩 레이어인 Schemaless를 구축하고, 그 기반 데이터베이스로 MySQL(InnoDB 스토리지 엔진)을 선택했습니다. 주요 이유는 다음과 같습니다:

### 1. 효율적인 쓰기 처리
  MySQL은 인덱스 업데이트 방식이 PostgreSQL보다 단순하고 효율적입니다. 필요한 인덱스만 선택적으로 업데이트하여 대규모 쓰기 처리에 유리했습니다.
### 2. 복제의 유연성 및 안정성
  MySQL은 다양한 복제 모드(비동기/반동기/동기)를 제공하며, 복제 로그(binlog)가 WAL에 비해 단순하고 효율적이었습니다. 또한 Uber는 MySQL의 GTID(Global Transaction ID) 기반 복제를 통해 더 나은 장애 복구 및 failover 환경을 구현할 수 있었습니다.
  
### 3. 버퍼 풀 최적화
  InnoDB는 버퍼 풀을 통해 디스크 I/O를 최소화하고 캐시 효율성을 극대화하여 고부하 상황에서도 안정적인 성능을 보장했습니다.

### 4. 동시 연결 처리 능력
  MySQL은 스레드 기반 아키텍처로, 수많은 동시 연결 요청을 상대적으로 가볍게 처리할 수 있었습니다.

### 5. 보다 유연한 운영 환경
  MySQL은 오랜 기간 대규모 서비스에서 운영되어 온 만큼 툴링과 커뮤니티 지원이 풍부하며, Uber가 자체적인 데이터 인프라를 구축하고 최적화하는 데 유리한 환경을 제공했습니다.

## 정리

Uber의 사례는 단순히 PostgreSQL과 MySQL의 기능 비교를 넘어, 비즈니스 요구사항, 장애 경험, 확장성, 운영 효율성 등 복합적인 요소를 고려한 인프라 전략의 중요성을 보여줍니다. Uber는 단일 데이터베이스의 성능 한계에 대응하기 위해 Schemaless라는 샤딩 솔루션을 도입하고, MySQL의 특성을 극대화하여 글로벌 서비스 환경에 적합한 아키텍처로 전환했습니다.