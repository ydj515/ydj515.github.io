---
title: Optionnal.orElseThrow 안의 Throw?
description: orElseThrow 안의 Throw?
author: ydj515
date: 2025-02-01 11:33:00 +0800
categories: [exception, optional]
tags: [throw, exception, optional, java]
pin: true
math: true
mermaid: true
image:
  path: /assets/img/throwException/logo.png
  lqip: data:image/webp;base64,UklGRpoAAABXRUJQVlA4WAoAAAAQAAAADwAABwAAQUxQSDIAAAARL0AmbZurmr57yyIiqE8oiG0bejIYEQTgqiDA9vqnsUSI6H+oAERp2HZ65qP/VIAWAFZQOCBCAAAA8AEAnQEqEAAIAAVAfCWkAALp8sF8rgRgAP7o9FDvMCkMde9PK7euH5M1m6VWoDXf2FkP3BqV0ZYbO6NA/VFIAAAA
  alt: Optionnal.orElseThrow
---

## Optionnal.orElseThrow
우리는 java에서 optional 의 예외 처리를 진행할때 아래와 같이 `orElseThrow()`를 많이 사용한다. 그러나 자칫 잘못하면 잘못 사용할 수가 있습니다.

### 잘못된 예
```java
Optional<String> optional = Optional.empty();

String result = optional.orElseThrow(() -> {
    throw new IllegalStateException("Value not found");
});
```

### 올바른 예
```java
Optional<String> optional = Optional.empty();

String result = optional.orElseThrow(() -> 
    new IllegalStateException("Value not found")
);
```

### 뭐가 다른데?
잘못된 예를 보면 orElseThrow()안에서 exception을 다시 throw를 하고 있습니다.

이는 불필요한 코드이며, `Optional.orElseThrow`를 잘못 사용하고 있는 예시입니다.

Java SE 8 Optional API를 살펴보면 아래와 같습니다.

![alt text](/assets/img/throwException/orElseThrow.png)

> *Return the contained value, if present, otherwise throw an exception to be created by the provided supplier.*

번역하자면, *포함된 값이 있으면 반환하고, 그렇지 않으면 제공된 supplier가 생성할 예외를 발생시킵니다.* 라는 뜻입니다.

그리고 **else 구문에 이미 throw가 있기 때문에 optional.orElseThrow 안의 supplier에는 Throw 구문이 필요 없는 것입니다.**

**그러나 컴파일 오류는 발생하지 않기에, 자칫 잘못하면 사용을 제대로 하지 않은 코드를 만들 수 있습니다.**

### 왜 컴파일 오류가 발생하지 않을까?
람다 표현식은 자동으로 반환 타입을 유추합니다. 즉, `Supplier<T>` 인터페이스를 구현하는 `orElseThrow()`의 람다는 `T get()`을 반환해야 합니다.

그러나 throw는 값을 반환하지 않는 특수한 연산이므로, T 타입을 강제로 맞출 필요가 없습니다.

```java
public <X extends Throwable> T orElseThrow(Supplier<? extends X> exceptionSupplier) throws X
```

- `Supplier<T>`는 반환 타입이 T인 함수형 인터페이스
- 하지만 throw 자체가 값을 반환하지 않기 때문에, 반환 타입이 중요하지 않음

즉, `orElseThrow(() -> { throw new Exception(); })`에서

1. `{ throw new Exception(); }`는 값을 반환하는 것이 아니라, 즉시 예외를 던짐
2. `orElseThrow()`는 값을 기대하지만, 실행 자체가 예외로 끝나므로 문제 없음
3. 따라서 컴파일러는 이 구문을 허용하고, 오류를 발생시키지 않음

### 컴파일 오류가 발생하는 경우는?
당연하게도 람다 내부에서 `throw` 이외의 반환값을 기대하는 경우, 컴파일 오류가 발생할 수 있습니다.

```java
Optional<String> optional = Optional.empty();

String result = optional.orElseThrow(() -> {
    throw new IllegalStateException("Value not found");
    return "fallback"; // 컴파일 오류 (Unreachable statement)
});
```

## 결론
-` orElseThrow(() -> { throw new Exception(); })`는 컴파일러가 허용하는 정상적인 코드
- 하지만 `orElseThrow(() -> new Exception())`가 더 깔끔하고 가독성이 좋음
- `throw` 이후 실행될 코드가 있으면 컴파일 오류가 발생
- `throw`는 특별한 연산이기 때문에 람다의 반환 타입을 신경 쓰지 않아도 됨

[출처]  
- https://docs.oracle.com/javase/8/docs/api/java/util/Optional.html#orElseThrow-java.util.function.Supplier-