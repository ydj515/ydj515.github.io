---
title: Spring Assert class의 supplier?
description: supplier를 쓰는 이유는 성능 최적화
author: ydj515
date: 2025-01-29 11:33:00 +0800
categories: [spring, assert]
tags: [spring, assert, supplier, framework, java, kotlin]
pin: true
math: true
mermaid: true
image:
  path: /assets/img/spring/logo.png
  lqip: data:image/webp;base64,UklGRpoAAABXRUJQVlA4WAoAAAAQAAAADwAABwAAQUxQSDIAAAARL0AmbZurmr57yyIiqE8oiG0bejIYEQTgqiDA9vqnsUSI6H+oAERp2HZ65qP/VIAWAFZQOCBCAAAA8AEAnQEqEAAIAAVAfCWkAALp8sF8rgRgAP7o9FDvMCkMde9PK7euH5M1m6VWoDXf2FkP3BqV0ZYbO6NA/VFIAAAA
  alt: Spring Assert class
---

## Assert class
Assert는 코드 실행 중 특정 조건을 보장하기 위해 사용되는 유틸리티 클래스입니다.
Spring에서는 `org.springframework.util.Assert` 클래스를 제공하며, 주로 메서드 인자의 유효성 검증을 위해 사용됩니다.

Assert는 크게 아래와 같은 이유로 사용됩니다.

- 잘못된 인자 전달을 방지하여 오류를 조기에 감지
- 명확한 의도 표현으로 코드 가독성 향상
- 불필요한 예외 처리를 줄여 코드 간결화

### 사용 예시
다음은 Assert를 사용하지 않은 코드입니다. 이렇게 직접 예외를 던지는 방식은 반복 코드가 많아지고, 가독성이 떨어질 수 있습니다.
```kotlin
fun createUser(name: String?, age: Int) {
    if (name == null || name.isBlank()) {
        throw IllegalArgumentException("이름은 필수 입력값입니다.")
    }
    if (age < 0) {
        throw IllegalArgumentException("나이는 0 이상이어야 합니다.")
    }
}
```

위의 코드를 아래와 같이 변경할 수 있습니다.

```kotlin
fun createUser(name: String?, age: Int) {
    Assert.hasText(name, "이름은 필수 입력값입니다.")
    Assert.isTrue(age >= 0, "나이는 0 이상이어야 합니다.")
}

fun main() {
    createUser("Alice", 25)  // 정상 동작
    createUser("", 30)       // 예외 발생: IllegalArgumentException
    createUser(null, 30)     // 예외 발생: IllegalArgumentException
}
```

### 주요 메소드
Spring의 Assert 클래스는 다양한 유효성 검증 메서드를 제공합니다.

| method                               | 설명                                          |
| ------------------------------------ | --------------------------------------------- |
| Assert.notNull(obj, message)         | 객체가 null이 아니어야 함                     |
| Assert.hasLength(str, message)       | 문자열이 null이 아니고 길이가 1 이상이어야 함 |
| Assert.hasText(str, message)         | 문자열이 null, 공백이 아니어야 함             |
| Assert.isTrue(condition, message)    | 조건이 true여야 함                            |
| Assert.isNull(obj, message)          | 객체가 null이어야 함                          |
| Assert.notEmpty(collection, message) | 컬렉션이 null이 아니고 비어있지 않아야 함     |
| Assert.state(condition, message)     | 특정 상태를 검증할 때 사용                    |

## Why supplier?
위에서 본 메소드들은 supplier를 인자로 받아 동작하는 것을 확인할 수 있습니다. 그렇다면 왜 supplier를 인자로 받을 수 있게 구현해놓았을지 설명합니다.

### supplier
우선 `supplier`가 무엇인지 알아야합니다.
`Supplier<String>`는 람다를 통해 메시지를 동적으로 생성할 수 있도록 지원하는 인터페이스입니다.
아래의 특징을 가지고 있습니다.

- () -> "예외 메시지" 형태로 전달
- 필요할 때만 실행 → 성능 최적화 효과

### assert에 적용된 supplier
assert 메소드들 중 `notNull`함수 예시입니다.

notNull 함수를 보면 `Supplier<String> messageSupplier`를 받는 것을 확인할 수 있습니다.

```java
public static void notNull(@Nullable Object object, String message) {
    if (object == null) {
        throw new IllegalArgumentException(message);
    }
}

public static void notNull(@Nullable Object object, Supplier<String> messageSupplier) {
    if (object == null) {
        throw new IllegalArgumentException(nullSafeGet(messageSupplier));
    }
}

@Nullable
private static String nullSafeGet(@Nullable Supplier<String> messageSupplier) {
    return (messageSupplier != null ? messageSupplier.get() : null);
}
```

### assert에 supplier를 적용한 이유
supplier로 구현해 놓은 이유는 성능 최적화입니다.
메시지 생성 비용이 높은 경우, 실제로 예외가 발생하지 않으면 메시지 생성을 피할 수 있기 때문입니다.

첫 번째 경우에는 항상 문자열 연결 연산이 수행되지만 두 번째 경우에는 name이 null일 때만 메시지 생성이 수행됩니다.
이는 불필요한 메시지 생성으로 인한 성능 저하를 방지하는 데 유용합니다.

- kotlin 예시
```kotlin
// non supplier
Assert.notNull(name, "not found " + id)
// use supplier
Assert.notNull(name) {
    "not found " + id
}
```

- java 예시
```java
// non supplier
Assert.notNull(name, "not found " + id);
// use supplier
Assert.notNull(name, () -> "not found " + id);
```

[출처]  
- https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/util/Assert.html