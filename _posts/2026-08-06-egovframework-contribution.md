---
title: "전자정부프레임워크 오픈소스 기여기: 심플 백엔드 템플릿 버그 수정 및 코드 개선하기"
description: "egovframe-template-simple-backend 프로젝트에서 문제를 발견하고  PR을 올려보자"
author: ydj515
date: 2026-08-06 00:00:00 +0900
categories: [java, spring, egovframework]
tags: [java, spring, egovframework]
mermaid: true
image:
  path: /assets/img/egovframework/logo.png
  lqip: data:image/webp;base64,UklGRpoAAABXRUJQVlA4WAoAAAAQAAAADwAABwAAQUxQSDIAAAARL0AmbZurmr57yyIiqE8oiG0bejIYEQTgqiDA9vqnsUSI6H+oAERp2HZ65qP/VIAWAFZQOCBCAAAA8AEAnQEqEAAIAAVAfCWkAALp8sF8rgRgAP7o9FDvMCkMde9PK7euH5M1m6VWoDXf2FkP3BqV0ZYbO6NA/VFIAAAA
  alt: spring
---

# 쳐다만 보던 전자정부 프레임워크

전자정부 프레임워크인 [eGovFramework](https://github.com/eGovFramework)를 늘 쳐다만보다가, 최근에는 조금 더 깊이 있게 살펴보고 있습니다.

예전에는 주로 필요한 기능이나 구현 방식을 찾아보는 정도였다면, 이번에는 실제 코드를 받아서 프로젝트가 어떤 구조로 되어 있고 각 기능이 어떤 흐름으로 동작하는지 하나씩 따라가 보고 있습니다.

그러던 중 [egovframe-template-simple-backend](https://github.com/eGovFramework/egovframe-template-simple-backend)라는 백엔드 샘플 프로젝트가 있는 것을 발견했고, 프로젝트를 클론한 뒤 실행해보고 코드를 따라가던 과정에서 몇 가지 아쉬운 부분이 눈에 들어왔습니다.

하나씩 확인하다 보니 몇가지 문제점을 발견하여 수정였으며 총 4개의 PR를 올렸고, 모두 merge되었습니다.

![image.png](/assets/img/egovframework/pr.png)

## 1. 이미지 미리보기 MIME 타입 및 스트리밍 처리 개선

- [#178 PR](https://github.com/eGovFramework/egovframe-template-simple-backend/pull/178)

이미지 미리보기 코드를 살펴보다 JPG의 MIME 타입을 `image/jpeg`로 설정한 뒤 다시 `image/jpg`로 덮어쓰는 버그를 발견했습니다.

수정하는 김에 파일 전체를 `ByteArrayOutputStream`에 적재한 뒤 응답하던 방식도 함께 개선했습니다. 파일 크기만큼 불필요하게 Heap을 사용하는 구조였기 때문에 `InputStream.transferTo()`를 이용해 HTTP Response로 바로 스트리밍하도록 변경했습니다.

또한 확장자별 MIME 타입을 명시적으로 처리하고, JPG 응답의 Content-Type과 원본 바이트를 검증하는 테스트를 추가하며 마무리했습니다.

---

## 2. 요청마다 조회하던 설정을 생성자 주입으로 변경

- [#181 PR](https://github.com/eGovFramework/egovframe-template-simple-backend/pull/181)

Multipart 파일 업로드에서는 허용 확장자 설정인 `Globals.fileUpload.Extensions`를 요청이 들어올 때마다 조회하고 있었습니다.

해당 값은 애플리케이션 실행 중 자주 변경되는 설정이 아니기 때문에, 시작 시 한 번 읽어 `EgovMultipartResolver`에 생성자로 주입하도록 변경했습니다.

```java
private final String whiteListFileUploadExtensions;

public EgovMultipartResolver(String whiteListFileUploadExtensions) {
    this.whiteListFileUploadExtensions = whiteListFileUploadExtensions;
}
```

단순히 프로퍼티 조회를 줄이는 것보다, 컴포넌트 내부에 숨어 있던 전역 설정 의존성을 명시적인 생성자 의존성으로 바꿨다는 점이 더 의미 있다고 생각했습니다.

---

## 3. Maven 중복 의존성 제거

- [#185 PR](https://github.com/eGovFramework/egovframe-template-simple-backend/pull/185)

`pom.xml`을 살펴보다 다음 dependency가 중복 선언되어 있는 것을 발견했습니다.

```text
tomcat-embed-jasper
commons-lang3
tomcat-annotations-api
```

기능적인 버그는 아니었지만, Maven 빌드 시 warning이 발생하고 있었고, 불필요한 선언은 빌드 설정을 복잡하게 만들 수 있기 때문에 수정했습니다.

---

## 4. `SELECT MAX(id) + 1` 동시성 문제 해결

- [#186 PR](https://github.com/eGovFramework/egovframe-template-simple-backend/pull/186)

기존에는 다음과 같은 방식으로 ID를 채번하고 있었습니다. 공공 프로젝트에서도 종종 볼 수 있는 방식입니다.

```sql
SELECT MAX(NTT_ID) + 1
FROM LETTNBBS
```

단일 요청에서는 문제가 없지만 여러 요청이 동시에 실행되면 두 트랜잭션이 동일한 `MAX(NTT_ID)`를 읽고 같은 ID를 발급할 수 있습니다.

```text
Transaction A        Transaction B
MAX = 100            MAX = 100
ID = 101             ID = 101
```

ID 채번을 기존 전자정부 프레임워크에서 어떻게 하고 있나 살펴보니 이미 ID 채번을 위한 `EgovIdGnrService`가 존재했습니다.

따라서 별도의 채번 로직을 만드는 대신 기존 프레임워크의 ID Generator를 사용하도록 변경하고, DB별로 존재하던 `MAX(NTT_ID) + 1` 쿼리를 제거했습니다.

마지막으로 동시성 테스트 코드를 추가하며 마무리했습니다.

이번 수정 과정에서 프로젝트가 이미 제공하는 기능을 이해하고 활용하는 것의 중요성을 다시 느꼈습니다.

## 정리

4개의 PR 모두 작은 변경이었지만, 직접 코드를 읽고 문제를 찾고 수정해보면서 eGovFramework와 조금 더 친숙해지는 계기가 된 것 같습니다. 앞으로도 사용하면서 눈에 띄는 부분이 있다면 하나씩 들여다보려고 합니다.
