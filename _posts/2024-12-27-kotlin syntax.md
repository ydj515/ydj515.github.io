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


## function
### Extension Function(확장함수)

기존 클래스나 인터페이스를 수정하지 않고 추가적인 함수를 정의할 수 있는 기능입니다. 클래스 내부에 정의되지 않고 외부에서 선언되지만, 마치 클래스의 멤버 메서드인 것처럼 호출할 수 있습니다.

- 기본 사용법

```kotlin
fun ClassName.functionName(args): ReturnType {
    // 함수 본문
}
```

- 예시
```kotlin
// String 확장 함수
fun String.isPalindrome(): Boolean {
    return this == this.reversed()
}

val word = "madam"
println(word.isPalindrome()) // 출력: true

// List 확장 함수
fun <T> List<T>.secondOrNull(): T? {
    return if (this.size > 1) this[1] else null
}

val list = listOf(1, 2, 3)
println(list.secondOrNull()) // 출력: 2
```

- entity to dto 변환 예제

확장 함수는 Entity 객체를 DTO로 변환하는 데 유용합니다. 이를 통해 변환 로직을 한곳에 캡슐화하고, 코드 중복을 줄일 수 있습니다.

```kotlin
// entity
data class UserEntity(
    val id: Long,
    val name: String,
    val email: String
)

// dto
data class UserDTO(
    val id: Long,
    val name: String
)

// 확장함수 정의
fun UserEntity.toDTO(): UserDTO {
    return UserDTO(
        id = this.id,
        name = this.name
    )
}

// 사용 예시
val userEntity = UserEntity(1L, "홍길동", "test@example.com")
val userDTO = userEntity.toDTO()
```

- java mapstruct와 비교

java에서 dto 변환에 사용하는 libraray인 `mapstruct`와 달리 언어차원에서 지원하기에 훨씬 사용하기 수월하다.

```java
@Mapper
public interface UserMapper {
    UserMapper INSTANCE = Mappers.getMapper(UserMapper.class);

    UserDTO toDTO(UserEntity entity);
}

// 사용 예시
UserDTO userDTO = UserMapper.INSTANCE.toDTO(userEntity);
```


| **특징**                  | **Kotlin 확장 함수**                                                | **MapStruct**                                                      |
| ------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------ |
| **학습 곡선**             | 쉬움. Kotlin 문법에 익숙하면 바로 사용 가능                         | 가파름. 애노테이션 기반으로 학습이 필요                            |
| **설정 필요성**           | 없음. 확장 함수만 작성하면 됨                                       | Maven/Gradle 설정 필요                                             |
| **자동화 수준**           | 수동. 변환 로직을 직접 작성해야 함                                  | 자동. 애노테이션 기반으로 변환 로직을 생성                         |
| **유지보수**              | 변환 로직이 변경되면 여러 곳에서 수동으로 수정해야 할 가능성이 있음 | 중앙 관리. 매핑 규칙 변경 시 관련된 모든 매핑에 적용됨             |
| **런타임 vs 컴파일 타임** | 런타임에 동작. 오류는 실행 중에 발견 가능                           | 컴파일 타임에 매핑 검증. 오류를 조기에 발견 가능                   |
| **성능**                  | 간단한 변환 작업에서는 우수                                         | 복잡한 변환 작업에서는 더 나은 성능 제공 (컴파일된 매핑 로직 활용) |


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
```

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

1. runCatching은 예외를 숨기고 Result 객체로 반환하기 때문에, 디버깅 시 스택 트레이스를 명시적으로 출력하지 않으면 예외의 원인을 추적하기 어려울 수 있습니다.

```kotlin
val result = runCatching {
    throw IllegalArgumentException("Invalid argument")
}
println(result) // 실패 원인을 알기 어려움
```

[참고]

https://kotlinlang.org/docs/basic-syntax.html