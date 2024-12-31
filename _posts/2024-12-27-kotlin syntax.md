---
title: kotlin syntax
description: kotlin syntax
author: ydj515
date: 2024-12-27 11:33:00 +0800
categories: [kotlin, syntax]
tags: [kotlin, syntax]
pin: true
math: true
mermaid: true
image:
  path: /assets/img/kotlin/logo.png
  lqip: data:image/webp;base64,UklGRpoAAABXRUJQVlA4WAoAAAAQAAAADwAABwAAQUxQSDIAAAARL0AmbZurmr57yyIiqE8oiG0bejIYEQTgqiDA9vqnsUSI6H+oAERp2HZ65qP/VIAWAFZQOCBCAAAA8AEAnQEqEAAIAAVAfCWkAALp8sF8rgRgAP7o9FDvMCkMde9PK7euH5M1m6VWoDXf2FkP3BqV0ZYbO6NA/VFIAAAA
  alt: kotlin
---

## Basic syntax



## exception handling
### runCatching
`runCatching`은 Kotlin에서 제공하는 함수로, 함수 실행 중 발생할 수 있는 예외를 안전하게 처리하기 위한 간편한 방법입니다. 코드 블록을 실행하고 결과를 캡처하여 성공 또는 실패를 나타내는 `Result` 객체를 반환합니다.

함수형 스타일로 코드를 구성 가능하며 성공과 실패를 명확히 구분해 Result를 기반으로 작업 가능한 것이 특징입니다. onSuccess, onFailure, getOrElse 등의 함수를 연달아 쓸 수 있는 함수 체이닝이 가능하며 `try~catch`와 동일하게 동작합니다.

- 구현체
```kotlin
@InlineOnly
@SinceKotlin("1.3")
public inline fun <R> runCatching(block: () -> R): Result<R> {
    return try {
        Result.success(block())
    } catch (e: Throwable) {
        Result.failure(e)
    }
}
```

- 기본 사용법
```kotlin
val result = runCatching {
    "123".toInt()
}.onSuccess {
    println("변환 성공: $it")
}.onFailure {
    println("변환 실패: ${it.message}")
}

- try~catch 버전
위의 코드와 아래 코드의 내용 동일

```kotlin
try {
    val number = "123".toInt()
    println("변환 성공: $number")
} catch (e: NumberFormatException) {
    println("변환 실패: ${e.message}")
}
```

- try~catch 와 비교

1. try-catch에서는 예외를 명확히 구분하여 처리할 수 있지만, runCatching에서는 모든 예외를 동일하게 다룰 가능성이 높아 세부적인 예외 처리가 어렵습니다.
```kotlin
val result = runCatching {
    // 여러 가지 예외 발생 가능
}.onFailure {
    // 어떤 예외인지 구분하지 않음
    println("실패: ${it.message}")
}
```

2. runCatching은 예외를 숨기고 Result 객체로 반환하기 때문에, 디버깅 시 스택 트레이스를 명시적으로 출력하지 않으면 예외의 원인을 추적하기 어려울 수 있습니다.
```kotlin
val result = runCatching {
    throw IllegalArgumentException("Invalid argument")
}
println(result) // 실패 원인을 알기 어려움
```

[참고]

https://kotlinlang.org/docs/basic-syntax.html