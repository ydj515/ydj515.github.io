---
title: JPA @Converter
description: Converter는 반드시 재정의가 필요해
author: ydj515
date: 2025-01-14 11:33:00 +0800
categories: [JPA, Converter]
tags: [JPA, converter, java, kotlin]
pin: true
math: true
mermaid: true
image:
  path: /assets/img/jpa/logo.png
  lqip: data:image/webp;base64,UklGRpoAAABXRUJQVlA4WAoAAAAQAAAADwAABwAAQUxQSDIAAAARL0AmbZurmr57yyIiqE8oiG0bejIYEQTgqiDA9vqnsUSI6H+oAERp2HZ65qP/VIAWAFZQOCBCAAAA8AEAnQEqEAAIAAVAfCWkAALp8sF8rgRgAP7o9FDvMCkMde9PK7euH5M1m6VWoDXf2FkP3BqV0ZYbO6NA/VFIAAAA
  alt: jpa @Converter
---

## @Converter란?

@Converter는 JPA가 엔티티 필드를 변환하여 데이터베이스에 저장하거나, 다시 엔티티 객체로 변환하는 역할을 합니다.
이를 통해 복잡한 객체를 쉽게 관리하고, 데이터베이스와의 매핑을 유연하게 설정할 수 있습니다.


## @Converter 사용 예제

`@Converter` 사용을 기본예제와 심화예제로 알아봅니다.

### 기본 예제 : Boolean <-> Y/N 변환

데이터베이스에는 `Y` 또는 `N`으로 저장하지만, 애플리케이션에서는 `Boolean` 타입을 사용하도록 변환할 수 있습니다.

예시로 `User` entity를 만들고 설명합니다. User의 `is_active`라는 컬럼은 db 상에서는 Y/N의 값을 가지고 있지만 entity에 매핑해서 사용할때는 boolean 값으로 매핑해서 사용하고싶다고 가정합니다.

```kotlin
@Entity
class User(
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    val id: Long? = null,

    @Convert(converter = BooleanToYNConverter::class)
    var isActive: Boolean
)
```

이렇게 user entity를 선언 후 db의 값과 Y,N을 매핑할 수 있는 converter를 선언합니다. 그리고 이 converter를 사용할 필드에 `@Convert(converter = BooleanToYNConverter::class)` 와 같이 명시합니다.

`BooleanToYNConverter`를 만들어줍니다.

```kotlin
@Converter(autoApply = false)
class BooleanToYNConverter : AttributeConverter<Boolean, String> {
    override fun convertToDatabaseColumn(attribute: Boolean?): String {
        return if (attribute == true) "Y" else "N"
    }

    override fun convertToEntityAttribute(dbData: String?): Boolean {
        return dbData == "Y"
    }
}
```

- `convertToDatabaseColumn`: true -> "Y", false -> "N"
- `convertToEntityAttribute`: "Y" -> true, "N" 또는 null -> false
- `autoApply = false`: 모든 Boolean 타입 필드에 자동 적용 falsse

###  복잡한 객체 변환 예제 : Money -> String
단순한 Boolean 변환뿐만 아니라, 복잡한 객체도 변환할 수 있습니다. Money 객체를 문자열로 변환하여 저장하는 경우를 살펴봅니다.

주문 entity에 가격을 Money라는 객체로 표현하였습니다. Money에는 돈의 수량과 통화가 있습니다.
```kotlin
@Entity
class Order(
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    val id: Long? = null,

    @Convert(converter = MoneyConverter::class)
    var price: Money
)

data class Money(
  val amount: BigDecimal,
  val currency: String
)
```

DB에는 `100.00:USD`의 표현식으로 저장하고 싶다면 아래와 같은 `MoneyConverter`를 사용할 수 있습니다. 

```kotlin

@Converter(autoApply = false)
class MoneyConverter : AttributeConverter<Money, String> {
    override fun convertToDatabaseColumn(attribute: Money?): String? {
        return attribute?.let { "${it.amount}:${it.currency}" }
    }

    override fun convertToEntityAttribute(dbData: String?): Money? {
        return dbData?.split(":")?.let { Money(BigDecimal(it[0]), it[1]) }
    }
}
```

- `convertToDatabaseColumn`: Money 객체를 "100.00:USD" 형식의 문자열로 변환
- `convertToEntityAttribute`: 문자열을 다시 Money 객체로 변환
- `autoApply = false`: 모든 Money 타입 필드에 자동 미적용


## 주의사항

### equals() 재정의 필요
JPA는 변경 감지(dirty checking)를 수행할 때 객체의 equals()를 이용하여 변경 여부를 판단합니다.
객체의 equals()가 올바르게 구현되지 않으면 변경을 감지하지 못하거나, 불필요한 UPDATE가 발생할 수 있습니다.
이때, 비교 방식은 메모리 주소(==) 또는 equals() 메서드를 사용합니다.

### 변경감지가 안되는 이유는 hibernate의 동작 때문
우선 equals()를 재정의 하기 전에 hibernate의 변경감지의 방식을 먼저 살펴봅니다.

hibernate는 변경감지를 아래와 같이 수행합니다.
- [참고 링크](https://stackoverflow.com/questions/5268466/how-does-hibernate-detect-dirty-state-of-an-entity-object/5268617#5268617)

```java
final Object currentValue = getCurrentValue( entity );
final Object snapshotValue = getSnapshotValue( entity );

// equals()를 사용하여 변경 여부 확인
final boolean dirty = !isEqual( snapshotValue, currentValue );

private boolean isEqual(Object snapshotValue, Object currentValue) {
    return Objects.equals(snapshotValue, currentValue);
}
```

Java의 equals는 ㅅ레퍼런스 비교를 하기 때문에 같은 값을 갖고 있더라도 신규 생성된 객체의 경우 기존 객체 비교시 false가 발생합니다. **즉, 객체의 equals()가 올바르게 구현되지 않으면 변경이 감지되지 않는다는 것을 의미합니다.**

>kotlin의 data class는 equals(), hashCode(), toString(), componentN(), copy()등을 제공해주나 여기서는 jpa entity로 사용하였기에 일반 class로 작성되어서 data class는 논외로 합니다.
{:.prompt-info}

#### 잘못된 예시 : equals() 미구현

`order.price = Money(BigDecimal(100), "USD")` 구문에서 값을 변경했지만, equals()가 없으면 변경 감지 안될 수 있습니다.

```kotlin
val order = orderRepository.findById(1L).get()
order.price = Money(BigDecimal(100), "USD") // 변경했지만, equals()가 없으면 변경 감지 안될 수 있음!
```




#### 올바른 예시 : equals() 구현

```kotlin
data class Money(val amount: BigDecimal, val currency: String) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is Money) return false
        return amount == other.amount && currency == other.currency
    }

    override fun hashCode(): Int {
        return amount.hashCode() * 31 + currency.hashCode()
    }
}
```

### autoApply = true 사용 시 영향 범위 확인
`autoApply = true`를 설정하면 모든 해당 타입의 필드에 자동 적용됩니다.  
**특정 필드에만 적용하려면 `autoApply = false`로 설정하고, 엔티티에서 명시적으로 @Convert 사용해야 합니다.**

```kotlin
@Converter(autoApply = false)
class MoneyConverter : AttributeConverter<Money, String> { ... }

...

@Convert(converter = MoneyConverter::class)
var price: Money
```

### @Embeddable vs @Converter
변환 대상 객체가 JPA에서 직접 지원할 수 있는 값 객체(Value Object) 인 경우, @Embeddable을 사용하는 것도 가능합니다.
따라서 `@Converter`와 `@Embeddable`의 차이점을 정리해봅니다.

|                | @Converter                          | @Embeddable                      |
| -------------- | ----------------------------------- | -------------------------------- |
| 변환 방식      | 필드를 DB에 저장 가능한 값으로 변환 | 테이블 내 컬럼으로 직접 매핑     |
| 필드 재사용    | 여러 엔티티에서 자유롭게 변환 가능  | 특정 엔티티에서만 사용 가능      |
| 쿼리 가능 여부 | 변환된 값 그대로 저장 (쿼리 어려움) | 개별 컬럼으로 저장되어 쿼리 가능 |

> 쿼리에서 직접 조건을 걸어야 한다면(값 비교가 필요하다면 ) @Embeddable, 변환이 필요하면 @Converter를 사용
{:.prompt-info}

[출처]  
- https://www.baeldung.com/jpa-attribute-converters
- https://stackoverflow.com/questions/5268466/how-does-hibernate-detect-dirty-state-of-an-entity-object/5268617#5268617
- https://docs.jboss.org/hibernate/orm/5.3/userguide/html_single/Hibernate_User_Guide.html#bytecode-enhancement-dirty-tracking
- org/hibernate/collection/spi/PersistentBag.class
