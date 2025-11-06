---
title: Oracle 19C docker build & install
description: oracle 공식 이미지 생성
author: ydj515
date: 2025-10-22 11:33:00 +0800
categories: [database, oracle, docker]
tags: [database, oracle, docker]
pin: true
math: true
mermaid: true
image:
  path: /assets/img/oracle/logo.png
  lqip: data:image/webp;base64,UklGRpoAAABXRUJQVlA4WAoAAAAQAAAADwAABwAAQUxQSDIAAAARL0AmbZurmr57yyIiqE8oiG0bejIYEQTgqiDA9vqnsUSI6H+oAERp2HZ65qP/VIAWAFZQOCBCAAAA8AEAnQEqEAAIAAVAfCWkAALp8sF8rgRgAP7o9FDvMCkMde9PK7euH5M1m6VWoDXf2FkP3BqV0ZYbO6NA/VFIAAAA
  alt: oracle
---

## 왜 Oracle 19c 이미지를 직접 빌드해야 할까?

Oracle은 공식 [docker-images 레포지토리](https://github.com/oracle/docker-images)를 통해 Dockerfile과 샘플 스크립트를 제공합니다. 하지만 Oracle Database 설치 매체(ZIP 파일)는 직접 로그인해 내려받아야 합니다.

따라서 Docker Hub에서 Oracle 19c 정식 이미지를 찾을 수 없고, 직접 설치 파일을 다운로드한 뒤 제공된 Dockerfile로 이미지를 빌드해야 합니다.

## 준비물

- Ubuntu 24.04 LTS (또는 호환되는 리눅스 환경)
- `git`과 `docker`/`docker compose` 명령이 설치된 상태
- [Oracle Database 19c (19.3) for Linux x86-64](https://www.oracle.com/kr/database/technologies/oracle19c-linux-downloads.html) 설치 파일: `LINUX.X64_193000_db_home.zip`
  - Oracle 계정으로 로그인 후 다운로드하며, 라이선스 약관에 동의해야 합니다.

## 작업 디렉터리 구성

1. Oracle 관련 파일을 보관할 디렉터리를 만듭니다.
   ```bash
   mkdir oracle19c
   ```
2. Oracle에서 제공하는 docker-images 레포지토리를 내려받습니다.
   ```bash
   git clone https://github.com/oracle/docker-images.git
   ```
3. 다운로드한 설치 ZIP 파일을 동일한 디렉터리에 옮긴다. 준비가 끝났을 때 디렉터리 구조는 다음과 같이 구성되면됩니다.
   ```bash
   ls -al
   drwxrwxr-x  4 user group        4096 Nov  5 20:26 ./
   drwxrwxr-x  4 user group        4096 Nov  5 20:12 ../
   -rw-r--r--  1 user group 3059705302 Nov  5 19:30 LINUX.X64_193000_db_home.zip
   drwxrwxr-x 35 user group        4096 Nov  5 19:24 docker-images/
   ```

## Oracle Database 19c 이미지 빌드

1. 설치 ZIP 파일을 Dockerfile이 있는 경로로 복사합니다.
   ```bash
   cp LINUX.X64_193000_db_home.zip ./docker-images/OracleDatabase/SingleInstance/dockerfiles/19.3.0/
   ```
2. 빌드 스크립트를 실행해 이미지를 생성합니다.
   ```bash
   cd ./docker-images/OracleDatabase/SingleInstance/dockerfiles/19.3.0/
   ./buildContainerImage.sh -e -v 19.3.0
   ```
3. 빌드가 끝나면 이미지를 확인합니다.
   ```bash
   docker images | grep oracle/database
   # oracle/database               19.3.0-ee   545c561123f0   About an hour ago   6.54GB
   ```
4. 데이터 파일을 보관할 디렉터리를 만들고 권한을 수정합니다.
   ```bash
   mkdir ./oradata
   sudo chown -R 54321:54321 ./oradata
   sudo chmod -R 775 ./oradata
   ```

  > Oracle 컨테이너는 기본적으로 UID/GID `54321`을 사용하므로 권한 설정이 필요해서 권한을 수정합니다.
  {: .prompt-info }

## Docker Compose로 컨테이너 실행

1. `docker-compose.yml` 파일을 아래 내용으로 생성한다.
   ```yaml
    services:
      oracle19c:  # 서비스 이름
        image: oracle/database:19.3.0-ee  # 사용할 Docker 이미지 이름
        container_name: oracle19c  # 컨테이너 이름을 명시적으로 지정 (기본 랜덤 이름 대신)

        ports:
          - "1521:1521"  # 호스트:컨테이너 포트 매핑 - Oracle 기본 리스너 포트
          - "5500:5500"  # Oracle Enterprise Manager Express 웹 UI 포트

        environment:  # 컨테이너 내부에서 사용할 환경 변수들
          ORACLE_SID: ORCLCDB  # Oracle System Identifier (CDB 이름)
          ORACLE_PDB: ORCLPDB1  # 생성할 Pluggable Database 이름
          ORACLE_PWD: Oracle123  # SYS, SYSTEM 계정의 비밀번호
          ORACLE_CHARACTERSET: AL32UTF8  # DB 문자셋 (다국어 지원용 표준 UTF-8)

        volumes:
          - ./oradata:/opt/oracle/oradata  # 호스트 디렉토리와 컨테이너 내부 데이터 디렉토리 마운트
            # 호스트의 ./oradata 폴더에 Oracle 데이터파일, redo log 등이 저장됨
            # 컨테이너 재시작 시에도 데이터 보존 가능 (데이터 영속성 보장)

        restart: unless-stopped  # 컨테이너 재시작 정책. 사용자가 명시적으로 정지하지 않는 한 항상 재시작
   ```

2. 컨테이너를 백그라운드로 실행합니다.
   ```bash
   docker compose up -d
   ```
3. 실행 상태와 초기 로그를 확인합니다.
   ```bash
   docker ps
   docker logs -f oracle19c
   ```

## Oracle 접속 확인

1. 컨테이너 쉘에 접속합니다.
   ```bash
   docker exec -it oracle19c bash
   ```

2. `sqlplus`로 데이터베이스 접속을 확인합니다.
   ```bash
   sqlplus sys/Oracle123@//localhost:1521/ORCLPDB1 as sysdba
   ```

## 신규 사용자 생성

`sqlplus`에서 아래 명령을 실행해 테스트용 사용자를 만듭니다. 위의 `Oracle 접속 확인` 단계로 접속하여 아래 명령어를 실행합니다.

```sql
CREATE USER myuser IDENTIFIED BY "mypassword" DEFAULT TABLESPACE users TEMPORARY TABLESPACE temp QUOTA UNLIMITED ON users;

GRANT CREATE SESSION TO myuser;
GRANT CREATE TABLE, CREATE VIEW, CREATE SEQUENCE, CREATE TRIGGER TO myuser;
GRANT CONNECT, RESOURCE TO myuser;
```

각 명령어에 대한 내용은 다음과 같습니다.

### 사용자 생성

```sql
CREATE USER myuser IDENTIFIED BY "mypassword" DEFAULT TABLESPACE users TEMPORARY TABLESPACE temp QUOTA UNLIMITED ON users;
```

- 의미: myuser라는 이름으로 사용자 생성
- 기본 테이블스페이스: users (데이터 저장 공간)
- 임시 테이블스페이스: temp (정렬/임시 작업용)
- 할당량 제한 없음: users 테이블스페이스에 대해 QUOTA UNLIMITED는 사용자가 무제한으로 객체를 만들 수 있다는 의미입니다.

> 이 명령은 DBA 권한이 필요합니다.
{:.prompt-danger }

### 접근 권한 부여

```sql
GRANT CREATE SESSION TO myuser;
```

- 권한: DB 접속 권한을 의미합니다.
- 역할: 로그인 가능 여부 (세션 생성)

> 최소 권한. 이게 없으면 로그인 자체가 안됩니다.
{: .prompt-danger }

### 상세 권한 부여

```sql
GRANT CREATE TABLE, CREATE VIEW, CREATE SEQUENCE, CREATE TRIGGER TO myuser;
```

- CREATE TABLE: 테이블 생성 가능
- CREATE VIEW: 뷰 생성 가능
- CREATE SEQUENCE: 시퀀스 생성 가능
- CREATE TRIGGER: 트리거 생성 가능

> 개발에 필수적인 객체를 생성할 수 있게 해줍니다. 삭제(DROP) 권한은 포함되지 않지만, 본인이 만든 객체는 삭제 가능합니다.
{:.prompt-danger }

### 롤 부여

```sql
GRANT CONNECT, RESOURCE TO myuser;
```

- CONNECT: 예전부터 존재하는 기본 롤로, 사실상 CREATE SESSION과 유사합니다 (현대에는 중복됨)
- RESOURCE: Oracle에서 제공하는 롤(Role)로, 다음 권한을 포함합니다:
- CREATE CLUSTER, CREATE INDEXTYPE, CREATE OPERATOR, CREATE PROCEDURE, CREATE SEQUENCE, CREATE TABLE, CREATE TRIGGER, CREATE TYPE

> RESOURCE 롤은 개발자에게 유용하지만, UNLIMITED TABLESPACE 권한을 암묵적으로 부여하지는 않습니다 (예전에는 포함되었음).
{:.prompt-danger}

### 요약

위에서 부여한 권한을 요약해보자면 다음과 같습니다.

| 작업                                    | 가능 여부                       |
| --------------------------------------- | ------------------------------- |
| 로그인                                  | O (`CREATE SESSION`, `CONNECT`) |
| 테이블/뷰/시퀀스/트리거 생성            | O                               |
| 트랜잭션 수행 (INSERT/UPDATE/DELETE 등) | O                               |
| PL/SQL 객체 (프로시저 등) 생성          | O (`RESOURCE` 포함 시)          |
| 다른 유저의 테이블 접근                 | X (별도 `GRANT SELECT ON` 필요) |
| DBA 수준 권한 (사용자 생성, DB 관리 등) | X                               |

> 즉, 대부분의 개발 작업은 가능하지만, DB 전체를 관리하는 역할은 할 수 없습니다.
{:.prompt-info}


## 외부 툴 접속 확인

> DataGrip 등 외부 툴에서 접속할 때는 SID가 아니라 Service Name(`ORCLPDB1`)으로 연결해야 합니다.

- 호스트 IP: `x.x.x.x`
- 포트: `1521`
- 드라이버: `thin`
- Service Name: `ORCLPDB1`
- 인증: `user & password`
- 사용자: `myuser`
- 비밀번호: `mypassword`
