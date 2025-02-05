---
title: kotlin sequence
description: kotlin sequence
author: ydj515
date: 2025-02-05 11:33:00 +0800
categories: [kotlin, sequence, syntax]
tags: [kotlin, sequence, syntax, collection]
pin: true
math: true
mermaid: true
image:
  path: /assets/img/kotlin/logo.png
  lqip: data:image/webp;base64,UklGRpoAAABXRUJQVlA4WAoAAAAQAAAADwAABwAAQUxQSDIAAAARL0AmbZurmr57yyIiqE8oiG0bejIYEQTgqiDA9vqnsUSI6H+oAERp2HZ65qP/VIAWAFZQOCBCAAAA8AEAnQEqEAAIAAVAfCWkAALp8sF8rgRgAP7o9FDvMCkMde9PK7euH5M1m6VWoDXf2FkP3BqV0ZYbO6NA/VFIAAAA
  alt: kotlin
---

## sequence
Sequence는 지연 연산(`lazy evaluation`)을 지원하는 컬렉션으로, 요소를 하나씩 계산하면서 처리합니다.

일반적인 List, Set 등은 즉시 연산(eager evaluation) 방식으로 모든 연산이 즉시 수행됩니다.

즉, sequence는 아래의 상황일 때 사용하면 좋습니다.

- 대량의 데이터 처리 (Stream API처럼 동작)
- 중간 연산을 거친 후 최종 연산을 수행하는 경우
- 불필요한 연산을 줄이고 성능을 최적화하고 싶은 경우

### 기본 예제

#### 일반 list(collection)
- map -> filter 순서로 모든 요소를 즉시 연산 후 최종 결과를 반환
- 모든 데이터를 한꺼번에 처리하므로 메모리 사용량이 많아질 수 있음
- filter() 에서 모든 element 에 대해 동작이 수행되고 나서 map() 에서 filter() 의 결과로 리턴된 element 에 대해 수행된다.

```kotlin
val words = "The quick brown fox jumps over the lazy dog".split(" ")
val lengthsList = words.filter { println("filter: $it"); it.length > 3 }
    .map { println("length: ${it.length}"); it.length }
    .take(4)

println("Lengths of first 4 words longer than 3 chars:")
// filter: The
// filter: quick
// filter: brown
// filter: fox
// filter: jumps
// filter: over
// filter: the
// filter: lazy
// filter: dog
// length: 5
// length: 5
// length: 5
// length: 4
// length: 4
// Lengths of first 4 words longer than 3 chars:
// [5, 5, 5, 4]
```

![alt text](/assets/img/kotlin/sequence/iterator.png)

#### sequence
- 필요한 경우에만 연산이 수행되며, 모든 요소를 한 번에 변환하지 않음
- 필요한 경우에만 연산이 수행되므로 성능 최적화 가능
- element 하나씩 수행되며 각 element는 filter()를 수행하고 map()을 바로 수행하며 진행한다.

```kotlin
val words = "The quick brown fox jumps over the lazy dog".split(" ")
//convert the List to a Sequence
val wordsSequence = words.asSequence()

val lengthsSequence = wordsSequence.filter { println("filter: $it"); it.length > 3 }
    .map { println("length: ${it.length}"); it.length }
    .take(4)

println("Lengths of first 4 words longer than 3 chars")
// terminal operation: obtaining the result as a List
println(lengthsSequence.toList())
// Lengths of first 4 words longer than 3 chars
// filter: The
// filter: quick
// length: 5
// filter: brown
// length: 5
// filter: fox
// filter: jumps
// length: 5
// filter: over
// length: 4
// [5, 5, 5, 4]
```

![alt text](/assets/img/kotlin/sequence/sequence.png)


### 일반 collection과의 차이점

| 특징                | 일반 컬렉션 (List, Set)      | Sequence                          |
| ------------------- | ---------------------------- | --------------------------------- |
| 연산 방식           | 즉시 연산 (Eager Evaluation) | 지연 연산 (Lazy Evaluation)       |
| 사용 예             | 작은 데이터, 간단한 변환     | 대량 데이터, 성능 최적화 필요     |
| 메모리 사용량       | 전체 데이터 저장             | 필요한 요소만 처리                |
| 성능                | 모든 연산을 즉시 수행        | 필요할 때만 연산                  |
| 최종 연산 필요 여부 | 필요 없음                    | toList(), count() 등 호출 시 실행 |

### sequence 사용방법

```kotlin
// 1. sequenceOf()
val sequence = sequenceOf(1, 2, 3, 4, 5)

// 2. 기존 컬렉션을 Sequence로 변환
val list = listOf(1, 2, 3, 4, 5)
val sequence = list.asSequence()

// 3. generateSequence로 무한 시퀀스 생성
val infiniteSequence = generateSequence(1) { it + 1 }
println(infiniteSequence.take(5).toList()) // [1, 2, 3, 4, 5]
```

### 반드시 sequence가 좋은가?
Sequence는 모든 경우에 최선의 선택이 아니며, 특정한 상황에서만 성능을 최적화할 수 있습니다. 잘못 사용하면 오히려 성능이 더 나빠질 수도 있습니다.

코틀린에서 컬렉션의 함수는 인라인 함수입니다. 인라인 함수이기 때문에 호출했을 때 추가 객체나 클래스 생성은 없습니다.

> 인라인 함수를 사용하게 되면 코드는 객체를 항상 새로 만드는것이 아니라 해당 함수의 내용을 호출한 함수에 넣는 방식으로 컴파일 코드를 작성합니다.
{:.prompt-tip}


| 일반 컬렉션 (List, Set)                                         | Sequence                                              |
| --------------------------------------------------------------- | ----------------------------------------------------- |
| 컬렉션의 중간 결과 값을 저장하기 위한 임시 컬렉션을 만든다.     | 중간 임시 컬렉션을 만들지 않는다.                     |
| 람다가 인라이닝 된다. -> 호출 시 추가 객체나 클래스 생성은 없다 | 람다가 인라이닝 되지 않는다 -> 호출 시 별도 객체 생성 |

따라서 시퀀스를 사용하면 중간 임시 컬렉션은 만들지 않지만, 호출할 때마다 별도 객체를 생성한을 합니다.

시퀀스 연산에서는 람다가 인라이닝되지 않기 때문에 크기가 작은 컬렉션은 오히려 일반 컬렉션 연산이 더 성능이 나을 수도 있습니다.

시퀀스를 통해 성능을 향상시킬 수 있는 경우는 컬렉션 크기가 큰 경우에만 해당됩니다.


#### Sequence가 유리한 경우

- 데이터 크기가 크고 연산이 복잡할 때
- 중간 연산(map, filter 등)이 많고 최종 연산이 늦게 수행될 때
- 연산 중 일부만 필요할 때 (예: take(10))

```kotlin
val result = (1..1_000_000).asSequence()
    .map { it * 2 }
    .filter { it % 3 == 0 }
    .take(10)  // 필요한 데이터만 가져옴
    .toList()

println(result) // [6, 12, 18, 24, 30, 36, 42, 48, 54, 60]
```

#### Sequence가 오히려 불리한 경우

- 데이터 크기가 작을 때 -> 오히려 오버헤드 발생
- 한 번만 변환하고 바로 사용할 때 -> List가 더 효율적
- 최종 연산(toList(), count())이 많을 때 -> 매번 연산이 수행됨
- 랜덤 접근이 필요할 때 -> Sequence는 인덱스 기반 접근이 어려움

```kotlin
val list = listOf(1, 2, 3, 4, 5)
val sequence = list.asSequence()

val result1 = sequence.map { it * 2 }.toList() // 최종 연산 1
val result2 = sequence.filter { it > 5 }.toList() // 최종 연산 2

println(result1) // [2, 4, 6, 8, 10]
println(result2) // [6, 8, 10]
```



[출처]
- https://kotlinlang.org/docs/sequences.html
- https://kotlinlang.org/docs/inline-functions.html
- https://juhi.tistory.com/84
- Kotlin in action