---
title: SpringContext에서 관리되는 빈을 Enum 클래스에 주입할 수 있는가?
description: 개념적으로는 안되지만 우회는 할 수 있다.
author: ydj515
date: 2025-03-27 11:33:00 +0800
categories: [springboot, spring, java, enum]
tags: [java, kotlin, spring, springboot, java, troubleshooting]
pin: true
math: true
mermaid: true
image:
  path: /assets/img/spring/logo.png
  lqip: data:image/webp;base64,UklGRpoAAABXRUJQVlA4WAoAAAAQAAAADwAABwAAQUxQSDIAAAARL0AmbZurmr57yyIiqE8oiG0bejIYEQTgqiDA9vqnsUSI6H+oAERp2HZ65qP/VIAWAFZQOCBCAAAA8AEAnQEqEAAIAAVAfCWkAALp8sF8rgRgAP7o9FDvMCkMde9PK7euH5M1m6VWoDXf2FkP3BqV0ZYbO6NA/VFIAAAA
  alt: spring
---

## Spring 빈을 Enum에서 사용할 수 있을까?

가끔은 이렇게 엉뚱한 질문을 하면서 Spring을 학습하면 "빈(Bean)"에 대해 스스로 생각해볼 수 있습니다.

Spring 입장에서 Enum을 어떻게 보는지 생각해보면 좋을 것 같습니다.

결론부터 말하면 Spring에서 관리되는 **빈(Bean)** 을 **Enum** 클래스에 직접 주입할 수 없지만 **우회적인 방법**을 사용하면 가능합니다.

## 왜 직접 주입할 수 없는가?

> kotlin, springboot3.x기준으로 설명합니다.  
> java와 전체 sample은 [github-sample](https://github.com/ydj515/blog-example/tree/main/enum-bean-example)를 참조해주세요.

### 왜냐하면 Spring이 Enum을 빈으로 관리하지 않기 때문입니다.

Spring이 관리하는 빈은 일반적으로 **싱글턴(Singleton) 객체**이지만, **Enum 클래스 자체는 Spring이 관리하는 빈이 아니기 때문에** `@Component`, `@Service` 등의 애너테이션을 붙여도 빈으로 등록되지 않습니다.

PaymentType enum클래스를 작성하여 `@Component`를 붙이고 Spring을 실행해보았습니다.

```kotlin
@Component
enum class PaymentType {
    CREDIT_CARD,
    PAYPAL;
}
```

컴파일 에러는 발생하지 않으나 Springboot를 실행하면 다음과 같은 오류가 발생합니다.

```java

Parameter 0 of constructor in com.example.enumbeanexample.enums.PaymentType required a bean of type 'java.lang.String' that could not be found.


Action:

Consider defining a bean of type 'java.lang.String' in your configuration.


Process finished with exit code 1
```

위의 오류 메시지를 보면 PaymentType의 생성자가 String 타입의 빈을 필요로 하는데, Spring 컨텍스트에서 해당 타입의 빈을 찾지 못해서 발생한 것입니다.

당연하게도 아래와 같이 Spring bean **paymentService는 주입되지 않습니다.** 

```kotlin
@Component
enum class PaymentType {
    CREDIT_CARD,
    PAYPAL;

    @Autowired
    private lateinit var paymentService: PaymentService
}
```

> Enum의 생성자는 JVM 로드 시점에 실행되기 때문입니다. Enum의 생성자는 **JVM이 클래스 로드 시점에 한 번만 호출**되며, 이후 변경할 수 없습니다.
{:.prompt-danger}

```kotlin
enum class PaymentType(private val paymentService: PaymentService) {
    CREDIT_CARD(PaymentService()),
    PAYPAL(PaymentService());
}
```

위 코드처럼 enum **생성자에서 빈을 주입**하려 하면 **컴파일 오류**가 발생합니다.

그 이유는 Spring이 관리하는 빈이 주입되기 전, Enum의 인스턴스가 먼저 생성되기 때문입니다.

## Enum에서 빈을 꼭 사용하고싶다면?

그렇다면 enum에서 빈을 사용하고싶은데 방법이 없을까? 라고 한다면 **"방법이 있다"** 입니다.

### Spring 컨텍스트를 이용한 직접 주입
Enum에서 Spring 컨텍스트를 직접 조회하여 빈을 가져올 수 있습니다.

먼저 아래와 같이 SpringContext에서 bean을 꺼내오는 util class를 하나 작성합니다.

```kotlin
@Component
object SpringContextUtil : ApplicationContextAware {
    private lateinit var context: ApplicationContext

    override fun setApplicationContext(applicationContext: ApplicationContext) {
        context = applicationContext
    }

    fun <T> getBean(beanClass: Class<T>): T = context.getBean(beanClass)
}
```

그 다음 enum class에서 `SpringContextUtil.getBean()`를 사용하여 의존성 주입하게 코드를 수정합니다.

```kotlin
enum class PaymentType {
    CREDIT_CARD,
    PAYPAL;

    private val paymentService: PaymentService by lazy {
        SpringContextUtil.getBean(PaymentService::class.java)
    }

    fun processPayment(amount: Double) {
        paymentService.pay(this, amount)
    }
}
```

코드가 잘돌아가는지 테스트 코드를 작성하여 테스트를 진행합니다.

```kotlin
@SpringBootTest
class PaymentTypeTest {


    @Test
    fun `CREDIT_CARD 결제 시 PaymentService가 호출되는지 확인`() {
        PaymentType.CREDIT_CARD.processPayment(1.0)
    }

    @Test
    fun `PAYPAL 결제 시 PaymentService가 호출되는지 확인`() {
        PaymentType.PAYPAL.processPayment(20.0)
    }
}
```

로그를 확인해보면 정상동작함을 확인할 수 있습니다.

```kotlin
pay
pay
```

그러나, 이처럼 억지로 사용은 가능하나 이렇게 한다면, `PaymentType`은 **SpringContext에 강하게 의존하여 enum 자체의 테스트가 어렵습니다.**

### 별도 클래스를 만들고 빈에서 관리하는 방법

그냥 아예 Enum에서는 PaymentService를 사용하는 것이 아니라 PaymentProcessor라는 클래스에서 Enum을 사용하는 별도 클래스를 만들어 주입하면 됩니다.

```kotlin
@Component
class PaymentProcessor(private val paymentService: PaymentService) {
    fun executePayment(type: PaymentType, amount: Double) {
        paymentService.pay(type, amount)
    }
}
```

이렇게 한다면 Enum 자체에 빈을 주입하지 않고 사용가능하며, Enum class가 SpringContext에 의존하지 않아 테스트가 용이해집니다.

## 결론

당연하게도 SpringContext에서 관리되는 빈을 Enum에 직접 주입할 수 없습니다. 왜냐하면 Spring이 Enum을 관리하지 않기 때문에 빈 주입이 불가능하기 때문입니다.

하지만, Spring 컨텍스트에서 직접 빈을 조회하는 방식으로 우회가 가능합니다.

그러나 가급적 Enum을 빈에 직접 주입하려 하지 말고, Enum을 활용하는 별도 클래스를 만들어 사용하는 것이 바람직합니다.