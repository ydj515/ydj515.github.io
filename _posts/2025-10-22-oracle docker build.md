---
title: Oracle 19C docker build and install
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
GRANT SELECT_CATALOG_ROLE TO myuser;
```

- CREATE TABLE: 테이블 생성 가능
- CREATE VIEW: 뷰 생성 가능
- CREATE SEQUENCE: 시퀀스 생성 가능
- CREATE TRIGGER: 트리거 생성 가능
 - SELECT_CATALOG_ROLE: 데이터 딕셔너리/카탈로그 및 일부 V$ 동적 성능 뷰를 읽기 전용으로 조회 가능
   - 스키마/오브젝트 메타데이터(DBA_/ALL_/USER_*), 세그먼트/세션/락 등 메타데이터 확인에 필요
   - 사용자 테이블 데이터에 대한 SELECT 권한은 포함하지 않음 (해당 스키마 객체에 대한 별도 권한 필요)
   - 개발·모니터링 도구(EXPLAIN/플랜 확인, 성능 진단 등) 사용 시 유용
   - 보안 측면에서 “필요 시에만 최소 권한으로” 부여 권장. 더 강한 대안인 SELECT ANY DICTIONARY는 범위가 넓어 주의 필요
   
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

## 재기동 이슈 관련

### 상황: oracle 재기동 후 외부에서 DB접속 불가

`docker compose restart oracle19c` DB를 재기동 후에 기존에 사용하던 application에서 접근을 못하는 이슈가 발생했습니다.

실제로 docker process는 실행되어있었으나 접근이 안된 이슈와 해결과정을 적어놨습니다.

### 원인

> oracle process가 떠있지만 oracle db가 아직 "다" 올라온 상태는 아니였습니다.

- 리스너는 떠 있지만(The listener supports no services) DB가 서비스를 등록하지 못한 상태였습니다.
- 인스턴스는 MOUNT까지만 올라왔습니다.
  - (Connected to an idle instance -> ORACLE instance started. -> Database mounted.)

> 정상이라면 Database opened.라는 로그가 올라와야합니다.
{:.prompt-info}

![alt text](/assets/img/oracle/troubleshooting/step0-log.png)

**검색을 해보니 "PDB(ORCLPDB1)는 MOUNTED -> READ WRITE로 별도 열어야한다."였습니다.**

실제로 도너 컨테이너에 진입후 PDB가 오픈된 상태인지 확인해보았습니다.

아래의 명령어로 PDB는 OPEN가 아니라 MOUNTED 상태였습니다.
```sh
# 1) 컨테이너 셸 진입
docker compose exec <서비스이름> bash   # 예: oracle19c

# 2) SYSDBA 로그인
sqlplus / as sysdba

-- 상태 확인
SELECT INSTANCE_NAME, STATUS FROM v$instance;   -- OPEN이면 정상
SELECT NAME, OPEN_MODE FROM v$database;
```

![alt text](/assets/img/oracle/troubleshooting/step1.png)

### 해결방법

아래 순서로 CDB/PDB를 OPEN하고, 리스너에 서비스 등록하였습니다.


```sh
-- 3) CDB 열기 (MOUNTED인 경우)
ALTER DATABASE OPEN;

-- 4) PDB 확인 및 오픈
SHOW PDBS;
ALTER PLUGGABLE DATABASE ORCLPDB1 OPEN;  -- 여러 개면 ALL OPEN

-- 5) 재기동 시 자동 OPEN 유지(1회만)
ALTER PLUGGABLE DATABASE ORCLPDB1 SAVE STATE;

-- 6) 리스너에 서비스 즉시 등록
ALTER SYSTEM REGISTER;
```

![alt text](/assets/img/oracle/troubleshooting/step2.png)


그 다음 컨테이너 셀에서 명령어로 리스너의 상태를 확인합니다.

```sh
-- 7) 외부에서 확인
# 컨테이너 셸
lsnrctl status
```

![alt text](/assets/img/oracle/troubleshooting/step3.png)

### 예방법

Docker Compose healthcheck로 의존 서비스가 “완전히 OPEN”된 후 올라오게 설정하여 자동으로 OPEN되게 할 수 있게 조치하였습니다.

```yml
healthcheck:
  test: ["CMD-SHELL", "echo \"select open_mode from v\\$pdbs where name='ORCLPDB1';\" | sqlplus -s / as sysdba | grep 'READ WRITE'"]
  interval: 30s
  timeout: 5s
  retries: 20
```

### 왜 default는 자동 OPEN이 아닐까?

그러면 왜 default 동작은 자동 OPEN이 아닐까에 대해 찾아보았습니다.

> 오라클 멀티테넌트( CDB/PDB ) 설계에서 PDB는 독립 DB로 취급됩니다. 재기동 시 자동으로 전부 OPEN하면 안전하지 않은 경우가 많기 때문에 기본은 수동 OPEN입니다.

1.	운영 통제(명시적 opt-in) : 어떤 PDB를 서비스로 올릴지 관리자가 결정해야 합니다. 재부팅만으로 모든 업무 DB가 외부에 노출되면 위험합니다.
2.	자원·기동 시간 : PDB가 OPEN되면 SGA/PGA 사용이 증가하고 스케줄러 잡, 통계/백그라운드 작업이 돌기 시작합니다. PDB가 많을수록 기동 시간이 길어지고 메모리 소모가 큽니다.
3.	유지보수/복구 시나리오 : 패치, 클론, 백업/복구, Data Guard 스탠바이 전환 등 많은 작업이 PDB를 MOUNT 상태로 요구합니다. 기본 자동 OPEN이면 이런 작업이 방해됩니다.
4.	RAC/서비스 정책 : 여러 인스턴스(RAC)에서 어느 인스턴스에 어떤 PDB를 열지는 서비스 정책의 영역입니다. 기본 수동이 정책 충돌을 방지합니다.
5.	역사적/호환성 배경 : 12.1에는 상태 영구화가 없어 자동 오픈을 원하면 DB 트리거가 필요했습니다. 12.2+에 ALTER PLUGGABLE DATABASE … SAVE STATE가 도입되어도 **기본값은 여전히 수동(Open 아님)**으로 유지되어, 관리자가 의도적으로 자동 오픈을 설정하게끔 했습니다.

그래서 기본동작은 "모든 PDB를 자동으로 켜지 않는다".이고, 필요하면 한 번만 OPEN 후 SAVE STATE로 명시적으로 자동 오픈을 켭니다.

### 멀티테넌트(Multitenant)란?
위에서 언급한 멀티테넌트란 한 개의 물리적 DB 인스턴스 안에 **여러 개의 "논리 DB"**를 담아 운영하는 오라클 12c+ 아키텍처입니다.

- 구성 요소:
  - CDB(Container Database): 껍데기/공용 컨테이너. `CDB$ROOT, 템플릿인 PDB$SEED` 포함.
  - PDB(Pluggable Database): 실제 업무가 올라가는 개별 DB(스키마/사용자/데이터 분리). 필요하면 여러 개.
- 이점:
  - DB 통합(컨솔리데이션), 빠른 클론/리프레시, PDB 단위 시작/정지, 리소스/보안 분리 등.
- 특징:
  - 인스턴스가 올라가도 PDB는 기본값이 자동 OPEN 아님 -> MOUNTED로만 떠 있음 -> 필요하면 `ALTER PLUGGABLE DATABASE <PDB> OPEN; + SAVE STATE`

### 그러면 서비스에 등록하는건 누가할까?

그러면 오라클에서 자동 OPEN이 안되는 이유는 찾았고, OPEN이 되면 PMON이 서비스를 등록합니다.

> PMON이란?  
> PMON(Process Monitor) 은 백그라운드로 리스너에 서비스를 동적 등록하는오라클 백그라운드 프로세스입니다. 따라서 PDB가 아직 OPEN 전이면 등록할 서비스가 없으니 lsnrctl status에 안 보이는 게 정상입니다.  
> OPEN 후 즉시 반영하고 싶으면 `ALTER SYSTEM REGISTER;`를 통해 리스너에 즉시 재등록하면됩니다.
{:.prompt-info}

그래서 OPEN후 `ALTER SYSTEM REGISTER;`으로 리스너에 재등록하면 외부에서 접근이 되는 것입니다.

요약하자면

> - CDB = 빌딩, PDB = 각 세대(아파트), Listener = 경비/리셉션, PMON = 관리실 직원("지금 열려있는 세대 목록"을 리셉션에 알려줌)  
> - 빌딩이 켜져도(인스턴스 시작) 세대 문(PDB)은 기본적으로 닫혀있습니다(MOUNTED). 문을 열어야(OPEN) 리셉션 목록(리스너 서비스)에 올라와서 접속 가능한 것입니다.