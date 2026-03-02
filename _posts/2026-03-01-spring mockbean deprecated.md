---
title: Spring Boot 3.4에서 @MockBean은 왜 deprecated 되었을까
description: "@MockBean, @MockBeans의 deprecation 이유와 @MockitoBean으로의 전환, 그리고 Spring 테스트가 나아가는 방향"
author: ydj515
date: 2026-03-01 23:00:00 +0900
categories: [spring, test]
tags: [spring, springboot, springframework, mockbean, mockitobean, test, mockito]
pin: true
math: true
mermaid: true
image:
  path: /assets/img/spring/logo.png
  lqip: data:image/webp;base64,UklGRpoAAABXRUJQVlA4WAoAAAAQAAAADwAABwAAQUxQSDIAAAARL0AmbZurmr57yyIiqE8oiG0bejIYEQTgqiDA9vqnsUSI6H+oAERp2HZ65qP/VIAWAFZQOCBCAAAA8AEAnQEqEAAIAAVAfCWkAALp8sF8rgRgAP7o9FDvMCkMde9PK7euH5M1m6VWoDXf2FkP3BqV0ZYbO6NA/VFIAAAA
  alt: spring
---

## Spring Boot 3.4부터 왜 갑자기 `@MockBean` 이 deprecated일까

Spring Boot 3.4를 사용하던 프로젝트에서 테스트 코드 중 `@MockBean`, `@MockBeans`, `@SpyBean` 에 deprecation 경고가 떴습니다. 오랫동안 Spring Boot 테스트의 표준처럼 쓰이던 API였기 때문에 왜 갑자기 deprecated가 되었는지 궁금해졌습니다.

확인해보니 이번 변경은 단순한 애노테이션 이름 변경이 아닙니다.

Spring 팀이 **테스트에서의 bean override 기능을 Spring Boot 전용 편의 기능으로 두지 않고, Spring Framework 차원의 공식 기능으로 올렸다**는 의미가 있습니다.

이 글에서는 아래를 정리합니다.

- 왜 `@MockBean` 이 deprecated 되었는가
- `@MockitoBean` 은 무엇이 다른가
- `@MockBeans` 는 무엇으로 바꾸면 되는가
- 이 변화가 보여주는 **Spring이 나아가는 방향성**은 무엇인가

> 이 글의 "현재 기준"은 2026-03-02 시점에 확인한 `Spring Boot 3.4.x` 공식 문서와 `Spring Framework 6.2.x` 공식 문서 기준입니다.
{: .prompt-info }

## 먼저 결론부터

`@MockBean` 이 deprecated 된 핵심 이유는 **Spring Boot가 제공하던 Mockito 기반 bean override 기능이 Spring Framework 6.2의 공식 테스트 인프라로 흡수되었기 때문**입니다.

즉 변화의 방향은 아래처럼 요약할 수 있습니다.

- 예전: Spring Boot가 자체적으로 `@MockBean`, `@SpyBean` 을 제공
- 지금: Spring Framework가 `@MockitoBean`, `@MockitoSpyBean`, `@TestBean` 과 `@BeanOverride` 인프라를 공식 제공
- 결과: Spring Boot는 자체 구현을 줄이고, Framework 표준 기능을 따르도록 정리

이것은 단순한 네이밍 변경이 아니라, **테스트 bean override를 Framework 레벨의 정식 기능으로 승격한 변화**입니다.

## 실제로 무엇이 deprecated 되었나

Spring Boot 3.4의 `@MockBean` Javadoc에는 아래와 같이 명시되어 있습니다.

- `since 3.4.0`
- `forRemoval=true`
- `4.0.0` 에서 제거 예정
- 대체: `MockitoBean`

즉 `@MockBean`, `@MockBeans`, `@SpyBean`, `@SpyBeans` 는 단순히 "언젠가 바뀔 수도 있음" 정도가 아니라, **제거 예정 API**로 보는 것이 맞습니다.

> Spring Boot 3.4 Release Notes 에도 `@MockBean` 과 `@SpyBean` 이 Spring Framework의 `@MockitoBean`, `@MockitoSpyBean` 으로 대체되었다고 명시되어 있습니다.
{: .prompt-info }

## 왜 deprecated 되었을까

이유는 크게 3가지로 보는 것이 가장 자연스럽습니다.

### 1. Spring Boot 전용 기능이 아니라, Framework 공통 기능으로 올라갔다

기존 `@MockBean` 은 Spring Boot가 제공하던 기능이었습니다.  
하지만 Spring Framework 6.2는 테스트에서 bean override를 위한 공식 인프라를 새로 추가했습니다.

핵심은 다음과 같습니다.

- `@TestBean`
- `@MockitoBean`
- `@MockitoSpyBean`
- `@BeanOverride`

Spring Framework 문서는 이 기능을 테스트에서 bean을 바꾸는 공식 메커니즘으로 설명합니다.  
즉 이제는 "Boot가 편의 기능으로 Mockito mock을 꽂아주는 방식"이 아니라, **Framework가 bean override 자체를 공식 모델로 제공하는 구조**가 된 것입니다.

### 2. 테스트 bean override 체계를 더 명확하게 정리했다

Spring Framework 6.2는 bean override를 단순 Mockito 편의 기능이 아니라, 더 일반적인 테스트 인프라로 재구성했습니다.

Framework 문서 기준으로 보면:

- `@TestBean` 은 순수 Spring 방식의 bean override
- `@MockitoBean`, `@MockitoSpyBean` 은 Mockito 기반 override
- 이 둘은 모두 `@BeanOverride` 인프라 위에서 동작

즉 Spring 팀은 "테스트에서 bean을 바꾼다"는 문제를 좀 더 근본적으로 정리했습니다.

예전 구조:

- Boot 전용 `@MockBean`
- Boot 전용 `@SpyBean`
- Boot 내부 리스너/포스트프로세서에 의존

새 구조:

- Framework 공통 bean override 인프라
- Mockito 기반과 비-Mockito 기반을 함께 제공
- Boot는 자체 구현보다 Framework 표준을 따름

이 변화는 테스트 기능을 더 **선언적이고 일관된 모델**로 가져가려는 방향으로 읽을 수 있습니다.

### 3. Spring Boot의 역할을 줄이고, Spring Framework의 역할을 넓혔다

이 부분은 공식 문서를 바탕으로 한 해석입니다.

Spring Boot는 시간이 갈수록 "모든 기능을 직접 제공하는 계층"이라기보다, **Framework 위에서 개발 경험을 좋게 만드는 조립 계층**으로 더 정리되고 있습니다.

이번 변화도 그 흐름과 잘 맞습니다.

- 일반화 가능한 테스트 기능은 Framework로 이동
- Boot는 자체 중복 구현을 줄임
- 사용자는 Framework 표준 API를 직접 사용

즉 `@MockBean` 의 deprecation은 단일 API 폐기라기보다, **Spring Boot가 Framework 위로 일부 기능을 다시 내려놓는 정리 작업**으로 보는 편이 맞습니다.

## `@MockitoBean` 은 무엇이 다른가

`@MockitoBean` 은 Spring Framework 6.2에서 추가된 공식 테스트 애노테이션입니다.

기본 개념은 `@MockBean` 과 비슷합니다.

- 테스트용 `ApplicationContext` 의 bean을 Mockito mock으로 대체
- 타입 또는 이름 기반으로 bean 선택
- 필요하면 mock bean을 새로 생성

하지만 차이도 있습니다.

### 1. Spring Framework 소속이다

패키지부터 다릅니다.

기존:

```java
org.springframework.boot.test.mock.mockito.MockBean
```

새 방식:

```java
org.springframework.test.context.bean.override.mockito.MockitoBean
```

즉 이제는 Boot 기능이 아니라 **Framework 기능**입니다.

### 2. 더 넓은 bean override 체계 안에 들어간다

`@MockitoBean` 은 혼자 존재하는 애노테이션이 아니라, `@BeanOverride` 기반 테스트 인프라의 일부입니다.

이 점이 중요합니다.

왜냐하면 Spring 팀이 앞으로 테스트에서 bean override를 다룰 때, `@MockBean` 식의 Boot 전용 API보다 **Framework의 공통 모델** 위에서 기능을 확장할 가능성이 높기 때문입니다.

### 3. 기능이 완전히 1:1 동일하지는 않다

Spring Boot 3.4 Release Notes 는 `@MockitoBean` 의 동작이 기존 `@MockBean` 과 **완전히 같지 않다**고 명시합니다.

대표적인 차이는 다음과 같습니다.

- `@MockitoBean` 은 `@Configuration` 클래스에서 `@MockBean` 처럼 쓰는 방식이 그대로 지원되지 않음
- 기존 `@MockBean` 코드는 테스트 클래스의 field 기반으로 옮겨야 할 수 있음

즉 단순 치환만으로 끝나지 않는 테스트도 있을 수 있습니다.

## `@MockBean` 대신 `@InjectMocks`을 쓰면 되는것 아닌가?

`@MockBean` 이 deprecated 되었다는 이야기를 들으면, 종종 "`그럼 이제 `@InjectMocks` 쓰면 되는 것 아닌가?`"라고할 수 있지만, 전혀아닙니다.

두 방식은 대체 관계라기보다 **테스트 레벨 자체가 다릅니다.**

| 항목 | `@MockitoBean` (`@MockBean`의 대체) | `@InjectMocks` |
|------|-------------------------------------|----------------|
| 동작 레벨 | Spring TestContext | Mockito |
| Bean 교체 | O | X |
| Spring 필요 | O | X |
| 속도 | 상대적으로 느림 | 상대적으로 빠름 |
| 테스트 종류 | 통합 테스트, 슬라이스 테스트 | 단위 테스트 |
| 실제 DI 사용 | Spring DI | Mockito DI |

핵심은 단순합니다.

- `@MockitoBean` 은 **Spring 컨텍스트 안의 bean을 바꾸는 도구**
- `@InjectMocks` 는 **Mockito가 테스트 대상 객체를 조립하는 도구**

즉 `@MockBean` 이 deprecated 되었다고 해서 `@InjectMocks` 가 직접 대체제가 되는 것은 아닙니다.

## 언제 무엇을 쓰는가

실무에서는 보통 아래처럼 구분하면 거의 맞습니다.

### 1. 순수 비즈니스 로직 테스트

서비스 클래스 하나의 로직을 빠르게 검증하고 싶다면, 보통은 Spring 컨텍스트를 띄울 필요가 없습니다.

```java
@Mock
private PaymentGatewayClient paymentGatewayClient;

@InjectMocks
private PaymentService paymentService;
```

이런 경우는 `@Mock + @InjectMocks` 조합이 더 자연스럽습니다.

### 2. Controller 테스트 (`@WebMvcTest` 등)

MVC 슬라이스 테스트처럼 Spring 컨텍스트는 필요하지만, 일부 의존 bean은 mock으로 바꿔야 하는 경우가 있습니다.

이때는 `@MockitoBean` 을 쓰는 편이 맞습니다.  
기존 코드베이스에서는 아직 `@MockBean` 이 남아 있을 수 있지만, 새 코드는 `@MockitoBean` 기준으로 가는 편이 좋습니다.

### 3. 실제 Bean wiring 검증

Spring이 실제로 bean을 어떻게 주입하고 조립하는지, 컨텍스트 안에서 wiring이 어떻게 되는지까지 함께 검증하려면 Mockito 단위 테스트만으로는 부족합니다.

이 경우에도 Spring 컨텍스트 기반의 bean 교체가 필요하므로, 현재 기준으로는 `@MockitoBean` 이 더 적절합니다.  
기존 레거시 테스트에서는 `@MockBean` 으로 작성된 경우가 많지만, 방향성은 `@MockitoBean` 쪽입니다.

정리하면:

- 순수 단위 테스트: `@Mock + @InjectMocks`
- Spring 슬라이스/통합 테스트에서 bean 대체: `@MockitoBean`
- 레거시 Boot 테스트 코드: `@MockBean` 이 남아 있을 수 있으나 점진적으로 전환

## `@MockBeans` 는 무엇으로 바꾸면 될까

많이 헷갈리는 부분이 이것입니다.

과거에는 이런 코드가 흔했습니다.

```java
@MockBeans({
    @MockBean(OrderService.class),
    @MockBean(UserService.class)
})
class MyTest {
}
```

이제는 `@MockBeans` 대신 아래 방식으로 가는 것이 자연스럽습니다.

### 1. 타입 레벨에서 `@MockitoBean` 반복 사용

Spring Framework 문서에 따르면 `@MockitoBean` 은 타입 레벨에서 반복 선언이 가능합니다.

```java
@MockitoBean(types = OrderService.class)
@MockitoBean(types = UserService.class)
class MyTest {
}
```

### 2. `types` 속성으로 여러 타입을 한 번에 선언

```java
@MockitoBean(types = {OrderService.class, UserService.class})
class MyTest {
}
```

### 3. 공통 조합이면 메타 애노테이션으로 묶기

공식 문서도 `@MockitoBean` 을 메타 애노테이션으로 재사용할 수 있다고 설명합니다.

```java
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@MockitoBean(types = {OrderService.class, UserService.class})
public @interface SharedMocks {
}
```

이 방식은 여러 테스트 클래스에서 같은 mock 조합을 재사용할 때 특히 좋습니다.

## 마이그레이션은 어떻게 하면 될까

가장 흔한 패턴만 보면 아래처럼 정리할 수 있습니다.

### 1. 단일 field mock

기존:

```java
@SpringBootTest
class PaymentServiceTest {

    @MockBean
    PaymentGatewayClient paymentGatewayClient;
}
```

변경:

```java
@SpringBootTest
class PaymentServiceTest {

    @MockitoBean
    PaymentGatewayClient paymentGatewayClient;
}
```

### 2. 여러 mock 선언

기존:

```java
@MockBeans({
    @MockBean(OrderService.class),
    @MockBean(UserService.class)
})
class MyTest {
}
```

변경:

```java
@MockitoBean(types = {OrderService.class, UserService.class})
class MyTest {
}
```

또는

```java
@MockitoBean(types = OrderService.class)
@MockitoBean(types = UserService.class)
class MyTest {
}
```

### 3. `@Configuration` 클래스에 붙여 쓰던 코드

이 케이스는 주의가 필요합니다.

기존 `@MockBean` 은 `@Configuration` 클래스에서도 사용 가능했지만, Spring Boot 3.4 Release Notes 는 `@MockitoBean` 이 그 방식과 **완전히 동일하지 않다**고 분명히 말합니다.

즉 이런 코드는:

```java
@Configuration
class TestConfig {

    @MockBean
    ExternalClient externalClient;
}
```

대개 이런 형태로 옮기는 편이 안전합니다.

```java
@SpringBootTest
class MyTest {

    @MockitoBean
    ExternalClient externalClient;
}
```

즉 `mock 정의 위치`를 `@Configuration` 클래스에서 **테스트 클래스 field** 로 옮기는 방향을 먼저 검토하는 것이 좋습니다.

## Spring이 나아가는 방향은 무엇일까

이 글에서 가장 중요한 부분은 사실 여기입니다.

이번 변화는 단지 `@MockBean -> @MockitoBean` 변경이 아니라, Spring 테스트가 아래 방향으로 가고 있다는 신호에 가깝습니다.

### 1. Boot 전용 편의 기능보다 Framework 표준 기능을 강화한다

이제는 `mock bean override` 같은 기능도 Boot의 부가 기능이 아니라, Framework 자체 기능으로 제공됩니다.

이 말은 곧:

- 더 일반적인 기능은 Framework로 이동
- Boot는 중복 구현을 줄임
- 사용자는 더 낮은 레벨의 공식 표준 API를 사용

이라는 뜻입니다.

### 2. 테스트 인프라를 더 명시적이고 구조적으로 만든다

예전의 `@MockBean` 은 편리했지만, 어느 정도는 "Boot가 내부에서 알아서 해주는 마법"에 가까운 면이 있었습니다.

반면 지금은:

- `@BeanOverride` 라는 공식 개념이 생겼고
- `@TestBean`
- `@MockitoBean`
- `@MockitoSpyBean`

처럼 역할이 더 분명해졌습니다.

즉 Spring 팀은 테스트 대체/override 메커니즘을 **더 노출되고, 더 구조화된 API** 로 바꾸고 있습니다.

### 3. Mockito에 종속된 문제와 Spring 자체 문제를 분리한다

이전에는 "테스트 bean override" 와 "Mockito 기반 mock/spy" 가 사실상 Boot 레벨에서 묶여 있었습니다.

지금은 다릅니다.

- Spring 자체 bean override: `@TestBean`
- Mockito 기반 override: `@MockitoBean`, `@MockitoSpyBean`

이 분리는 꽤 의미가 큽니다.  
Spring 팀이 장기적으로는 "테스트에서 bean을 어떻게 바꾸는가"라는 추상화와, "무슨 mocking 라이브러리를 쓰는가"를 좀 더 분리하려는 흐름으로 읽을 수 있기 때문입니다.

### 4. 덜 위험한 테스트 override 방식으로 유도한다

Spring Framework 문서는 bean overriding in tests를, `setAllowBeanDefinitionOverriding(true)` 식의 방식보다 **덜 위험한 대안**이라고 설명합니다.

이건 방향성을 잘 보여줍니다.

- 컨테이너 전체를 느슨하게 override 가능하게 열어두는 대신
- 테스트에서 필요한 bean만
- 명시적인 애노테이션으로
- 의도적으로 바꾸는 구조

즉 테스트에서의 override를 더 안전하고 예측 가능하게 만들고자 하는 방향입니다.

## 이 변화에서 주의할 점

좋은 변화이긴 하지만, 마이그레이션 시 주의할 부분도 있습니다.

### 1. 단순 치환으로 끝나지 않을 수 있다

특히 `@Configuration` 클래스에서 쓰던 `@MockBean` 은 테스트 클래스 field 기반으로 옮겨야 할 수 있습니다.

### 2. context 캐시에도 영향이 있을 수 있다

Spring Framework 문서는 field 이름이나 qualifier가 `ApplicationContext` 생성 판단에 영향을 줄 수 있다고 설명합니다.

즉 테스트마다 같은 mock을 쓰더라도:

- field 이름이 다르거나
- qualifier 사용 방식이 달라지면

불필요하게 context가 더 많이 만들어질 수 있습니다.

### 3. bean override는 어디까지나 singleton 중심이다

공식 문서 기준으로 `@MockitoBean`, `@MockitoSpyBean` 은 singleton bean에 대한 override를 전제로 합니다.  
prototype이나 특수 scoped bean을 mock/spy 하려는 경우에는 동작을 다시 확인해야 합니다.

## 그래서 실무에서는 어떻게 대응하면 좋을까

가장 실용적인 대응은 아래 순서입니다.

1. 새 테스트는 `@MockBean` 대신 `@MockitoBean` 으로 작성
2. `@MockBeans` 는 타입 레벨 `@MockitoBean` 반복 선언 또는 `types` 속성으로 전환
3. `@Configuration` 에 붙은 `@MockBean` 은 테스트 클래스 field 기반으로 이동 검토
4. 공통 mock 조합은 메타 애노테이션으로 정리
5. Boot 4.0 이전에 경고를 모두 제거

즉 지금은 "나중에 한 번 바꾸자"가 아니라, **테스트 작성 방식 자체를 Framework 표준으로 옮겨가는 시기**로 보는 편이 맞습니다.

## 정리

Spring Boot 3.4에서 `@MockBean` 이 deprecated 된 이유는 단순히 더 예쁜 이름의 애노테이션이 생겼기 때문이 아닙니다.

- Mockito 기반 test bean override가 Spring Framework 6.2의 공식 기능으로 올라갔고
- Spring Boot는 그 표준을 따르도록 정리되었으며
- 테스트 override 메커니즘은 `@BeanOverride` 기반의 더 구조적인 모델로 재편되었습니다.

즉 이번 변화는 **Spring Boot의 API 정리**이면서 동시에, **Spring 테스트 인프라의 중심이 Boot에서 Framework로 이동한 사건**에 가깝습니다.

대부분의 팀에게 필요한 실무적 결론은 명확합니다.

- 새 코드는 `@MockitoBean`, `@MockitoSpyBean` 기준으로 작성하고
- 기존 `@MockBean`, `@MockBeans` 는 Boot 4.0 전에 정리하고
- 이 기회에 테스트 bean override를 더 명시적인 구조로 바꾸는 것이 좋습니다.

Spring이 나아가는 방향도 분명합니다.  
**테스트 편의 기능을 Boot의 개별 마법으로 두기보다, Framework 차원의 공통 모델로 끌어올리고 있다**는 점입니다.

## 참고 자료

- Spring Boot 3.4 Release Notes
  - <https://github.com/spring-projects/spring-boot/wiki/Spring-Boot-3.4-Release-Notes>
- Spring Boot 3.4 `@MockBean` Javadoc
  - <https://docs.spring.io/spring-boot/3.4/api/java/org/springframework/boot/test/mock/mockito/MockBean.html>
- Spring Framework Reference: Bean Overriding in Tests
  - <https://docs.spring.io/spring-framework/reference/testing/testcontext-framework/bean-overriding.html>
- Spring Framework Reference: `@MockitoBean` and `@MockitoSpyBean`
  - <https://docs.spring.io/spring-framework/reference/testing/annotations/integration-spring/annotation-mockitobean.html>
- Spring Framework Javadoc: `@MockitoBean`
  - <https://docs.spring.io/spring-framework/docs/6.2.x/javadoc-api/org/springframework/test/context/bean/override/mockito/MockitoBean.html>
