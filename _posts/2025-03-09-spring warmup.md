---
title: spring 배포 후 발생하는 latency원인과 jvm warmup(feat. 부하테스트)
description: spring warmup을 하지않으면 부하테스트가 제대로 안될 수 있다.
author: ydj515
date: 2025-03-09 11:33:00 +0800
categories: [springboot, spring, load_test, jvm, warmup]
tags: [k6, java, kotlin, spring, springboot, warmpup, jvm, load_test, troubleshooting]
pin: true
math: true
mermaid: true
image:
  path: /assets/img/spring/logo.png
  lqip: data:image/webp;base64,UklGRpoAAABXRUJQVlA4WAoAAAAQAAAADwAABwAAQUxQSDIAAAARL0AmbZurmr57yyIiqE8oiG0bejIYEQTgqiDA9vqnsUSI6H+oAERp2HZ65qP/VIAWAFZQOCBCAAAA8AEAnQEqEAAIAAVAfCWkAALp8sF8rgRgAP7o9FDvMCkMde9PK7euH5M1m6VWoDXf2FkP3BqV0ZYbO6NA/VFIAAAA
  alt: spring
---

## spring warmup

Spring Boot 애플리케이션을 운영하다 보면, 기동 후 초기 API 응답 시간이 느린 경우를 경험할 수 있습니다.

처음에는 DispatcherServlet이나 Spring 내부 동작이 원인이라고 생각할 수 있지만, 좀 더 깊게 들어가 보면 JVM Warmup(웜업)과 JIT Compiler(Just-In-Time 컴파일러) 가 중요한 역할을 한다는 것을 알 수 있습니다.

저는 이 현상을 REST API 부하 테스트를 진행하기 전 스모크 테스트(Smoke Test) 과정에서 발생하였고, JVM Warmup이 무엇인지, JIT Compiler의 동작 방식과 내부 원리를 설명하고, 실제로 이를 확인하는 방법과 효과적인 Warmup 전략을 다룹니다.


## 현상
Spring Boot 애플리케이션 기동 후 최초 호출 시 응답 속도가 현저히 느린 현상을 확인하였습니다. 이후 호출부터는 정상적인 속도로 응답했습니다.

아래에서 자세히 살펴보겠습니다.

## 원인 분석 

> kotlin, springboot3.x기준으로 설명합니다.  
> java17과 전체 sample은 [github-sample](https://github.com/ydj515/blog-example/tree/main/warmup-example)를 참조해주세요.

아래와 같이 상품 리스트를 조회하는 간단한 API가 있다고 가정해봅니다.

```kotlin
@RestController
@RequestMapping("/products")
class ProductController(
    private val productFacade: ProductFacade
) {
    @GetMapping("")
    fun getProducts(): ResponseEntity<List<ProductResponse>> {
        val startTime = System.nanoTime()
        val result = productFacade.getProducts()
        val response = result.map { it.toResponse() }

        val endTime = System.nanoTime()
        val elapsedTime = (endTime - startTime) / 1_000_000.0

        println("실행시간: %.3f ms".format(elapsedTime))

        return ResponseEntity(response, HttpStatus.OK)
    }
}
```

이 API를 테스트 하기 위해서 springboot를 구동하고 실행시간을 측정하기 위해 출력문을 추가하였습니다. 그리고 REST API 호출을 연달아 두번 진행해보고 실행시간을 확인해보았습니다.

- 첫번째 REST API 호출
  ![image.png](/assets/img/warmup/before-warmup1.png)

- 두번째 REST API 호출
  ![image.png](/assets/img/warmup/before-warmup2.png)

호출한 결과를 보면 그냥 단순히 두번 연달아 호출하였을 뿐인데 처음 요청과 응답 시간차이가 꽤나 많이 나는 것을 확인 할 수 있습니다.

- 최초 호출: 51.397 ms
- 이후 호출:  4.184 ms

이상하리만큼 첫번째 요청은 응답이 매우 느린 것을 확인할 수 있었습니다. 이유를 파악하기 위해 로그를 확인해보았습니다.

```java
2025-02-26T01:47:17.509+09:00  INFO 11288 --- [warmup-example] [           main] o.s.b.w.embedded.tomcat.TomcatWebServer  : Tomcat started on port 8080 (http) with context path '/'
2025-02-26T01:47:17.513+09:00  INFO 11288 --- [warmup-example] [           main] c.e.w.WarmupExampleApplicationKt         : Started WarmupExampleApplicationKt in 1.172 seconds (process running for 1.357)
CommandLineRunner!
ApplicationRunner!
ApplicationReadyEvent!
2025-02-26T01:47:28.036+09:00  INFO 11288 --- [warmup-example] [nio-8080-exec-1] o.a.c.c.C.[Tomcat].[localhost].[/]       : Initializing Spring DispatcherServlet 'dispatcherServlet'
2025-02-26T01:47:28.036+09:00  INFO 11288 --- [warmup-example] [nio-8080-exec-1] o.s.web.servlet.DispatcherServlet        : Initializing Servlet 'dispatcherServlet'
2025-02-26T01:47:28.037+09:00  INFO 11288 --- [warmup-example] [nio-8080-exec-1] o.s.web.servlet.DispatcherServlet        : Completed initialization in 0 ms
2025-02-26T01:47:28.099+09:00 DEBUG 11288 --- [warmup-example] [nio-8080-exec-1] org.hibernate.SQL                        : 
    select
        p1_0.id,
        p1_0.name,
        p1_0.price 
    from
        products p1_0
Hibernate: 
    select
        p1_0.id,
        p1_0.name,
        p1_0.price 
    from
        products p1_0
```

위 로그를 보면 조금 **어?** 하는 부분이 있었는데 그 부분은 초기 스프링이 `ApplicationReadyEvent` 로그가 찍히고 나서 첫번째 API 요청이 처음 들어왔을때 dispatcherServlet이 초기화 되는 로그를 확인할 수 있었습니다.

아래에 dispatcherServlet관련 로그만 발췌했습니다.

```java
2025-02-26T01:47:28.036+09:00  INFO 11288 --- [warmup-example] [nio-8080-exec-1] o.a.c.c.C.[Tomcat].[localhost].[/]       : Initializing Spring DispatcherServlet 'dispatcherServlet'
2025-02-26T01:47:28.036+09:00  INFO 11288 --- [warmup-example] [nio-8080-exec-1] o.s.web.servlet.DispatcherServlet        : Initializing Servlet 'dispatcherServlet'
2025-02-26T01:47:28.037+09:00  INFO 11288 --- [warmup-example] [nio-8080-exec-1] o.s.web.servlet.DispatcherServlet        : Completed initialization in 0 ms
```

- [nio-8080-exec-1] -> HTTP 요청을 처리하는 **쓰레드 풀(Tomcat)**에서 실행되고 있음
- Initializing Spring DispatcherServlet 'dispatcherServlet' -> 요청이 들어온 후 DispatcherServlet이 처음으로 초기화됨

위 로그에서 알 수 있듯이, **DispatcherServlet은 서버 기동 시점이 아닌 spring으로 최초 REST 요청이 들어온 시점에 초기화됩니다.**

그리고 두번째 REST 요청부터는 당연하게도 dispatcherServlet이 init되었기 때문에 이과정이 필요 없어서 빠르게 동작한 것으로 예상할 수 있습니다.

## 첫번째 REST 요청에 대한 늦은 응답의 원인

spring이 기동되고 첫 REST 요청이 느린 것은 `DispatcherServlet의 기본 초기화 방식이 Lazy Initialization`이라고 생각했습니다.

서버가 시작될 때 바로 DispatcherServlet을 초기화하지 않고, 최초 REST 요청이 들어왔을 때만 초기화하도록 동작하는 것을 로그로 확인하였기 때문입니다.

> DispatcherServlet의 역할  
> - Spring MVC에서 모든 HTTP 요청을 처리하는 핵심 Servlet  
> - URL 매핑을 확인하고 적절한 Controller로 요청을 전달  
> - 응답을 생성하고 클라이언트에게 반환
{:.prompt-info}


## 첫번째 REST 요청에 대한 늦은 응답을 해결하는 방법

단순히 DispatcherServlet을 서버 시작 시점에 미리 초기화해본다면 충분히 시간을 줄일 수 있다는 판단하에 DispatcherServlet을 즉시 초기화하는 방법을 찾아보았습니다.

서버가 뜨는 순간 DispatcherServlet을 미리 초기화하려면 Spring Boot 설정을 변경해야합니다.

### 1. spring.mvc.servlet.load-on-startup=1 설정 추가

Spring Boot 설정 파일에 아래 옵션을 추가하면 서버가 시작될 때 `application.yml`을 아래로 수정하면 DispatcherServlet이 즉시 초기화됩니다.

- application.yml

```yml
spring:
  mvc:
    servlet:
      load-on-startup: 1
```

### 2. @Bean을 이용해 수동으로 등록

아래처럼 DispatcherServlet을 Bean으로 명시적으로 등록하면, Spring Boot 실행 시점에 강제로 초기화할 수 있습니다.

```kotlin
import org.springframework.boot.web.servlet.ServletRegistrationBean
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.web.servlet.DispatcherServlet

@Configuration
class ServletConfig {

    @Bean
    fun dispatcherServletRegistration(dispatcherServlet: DispatcherServlet): ServletRegistrationBean<DispatcherServlet> {
        val registration = ServletRegistrationBean(dispatcherServlet, "/")
        registration.setLoadOnStartup(1) // 서버 시작 시 초기화
        return registration
    }
}
```

### DispatcherServlet Eager Initialization 후 테스트

위에서 언급한 설정값으로 DispatcherServlet을 Lazy Initialization하게 설정한 후 메소드 실행 속도를 비교해보았습니다.

동일하게 REST 요청을 두번 연달아 진행해보았습니다.

- 첫번째 REST API 호출
  ![image.png](/assets/img/warmup/before-warmup1afterload.png)

- 두번째 REST API 호출
  ![image.png](/assets/img/warmup/before-warmup2afterload.png)

- 최초 호출: 50.080 ms
- 이후 호출:  5.600 ms

여러번 테스트 해본 결과 처음의 실험과 크게 다르지 않았고, 메소드 수행 속도 또한 오차범위 내에 있다고 판단이 들었습니다.

이렇게 dispatcherservlet의 eager initialization을 하더라도 첫번재 REST API response latency가 개선되지않았기에 DispatcherServlet의 lazy Initialization는 크게 의미가 있지 않다는 것을 알게되었습니다.

그래서 단순히 dispatcherservlet의 lazy initialization의 문제만이 아니라고 판단하고 스터디를 진행하던중 `Jvm warm up`이라는 키워드가 눈에 띄었습니다.

## JVM Warmup

우선 JVM Warmup에 대해 설명하겠습니다. JVM Warmup이란 애플리케이션이 실행된 직후 초기 성능이 낮다가, 점진적으로 최적화되면서 성능이 향상되는 과정을 의미합니다. 주된 이유는 JIT Compiler가 실행 중인 코드를 분석하고 최적화하는 데 시간이 걸리기 때문입니다.

### JVM Warmup 과정과 최적화

바이트코드 인터프리팅: JVM은 처음에는 바이트코드를 인터프리터 방식으로 실행하여 속도가 느립니다.

JIT 컴파일러의 개입: 실행 빈도가 높은 메서드는 **JIT 컴파일러**에 의해 기계어 코드로 변환되어 속도가 증가합니다.

JVM 내부 최적화: 인라이닝, 루프 최적화 등의 기법이 적용되면서 실행 속도가 점점 향상됩니다.

> JIT Compiler란?  
> 실행 중인 바이트코드를 네이티브 코드로 변환하여 성능을 최적화하는 컴파일러입니다. 자세한건 아래에서 다루겠습니다.
{:.prompt-info}

## JIT Compiler

위에서 짧게 말했듯이 JIT(Just-In-Time) Compiler는 실행 중인 바이트코드를 네이티브 코드로 변환하여 성능을 최적화하는 컴파일러입니다.

### JIT 컴파일러의 주요 동작 방식

JIT 컴파일러는 동작방식은 아래와 같습니다.

[사진]

1. 초기 실행 (Interpreted Mode): 바이트코드를 인터프리터 방식으로 실행합니다.

2. 핫스팟 감지 (Profiling): 자주 실행되는 메서드를 감지합니다.

3. 컴파일 및 최적화: Hot Method(자주 호출되는 메서드)를 네이티브 코드로 변환하고 인라이닝 등의 최적화를 수행합니다.

4. 런타임 최적화: 실행 환경을 분석하며 지속적으로 성능을 개선합니다.

- 주요 최적화 기법
	- 메서드 인라이닝: 자주 호출되는 메서드를 호출 없이 직접 삽입하여 호출 비용을 줄임
	- 루프 최적화: 불필요한 반복을 제거하고 루프 언롤링 적용
	- GC 최적화: 객체 할당을 최적화하여 GC 부담 감소

## JVM Warmup 정리

위에서 설명한 대로 JVM Warmup을 정리하자면 **"JVM은 자주 실행 되는 코드를 컴파일하고 캐시하며 클래스는 필요할 때 Lazy Loading 으로 메모리에 적재된다"** 이것이 JVM Warm-up의 핵심입니다.

그렇다면 spring의 첫 REST 요청의 response latency가 늦어지는 원인을 아래와 같이 정의할 수 있습니다.

1. dispatcher servlet의 init -> (확인 결과 미미함.)
2. 클래스가 메모리에 적재되지 않음
3. 코드가 최적화된 기계어로 컴파일되지 않았기 때문.

그러면 위의 2, 3을 검증하기 위해서는 JIT Compiler가 컴파일된 메소드들을 확인해볼 필요가 있습니다.

## Jit Compiler Warmpup 과정 확인

JVM이 특정 메서드를 JIT 컴파일했는지 확인하려면 JVM 옵션을 설정해서 확인할 수 있습니다.

### JIT 컴파일된 코드 확인

JVM 실행 옵션에 `-XX:+PrintCompilation`을 추가하면 JIT 컴파일된 메서드 리스트를 볼 수 있습니다.

```sh
java -XX:+PrintCompilation -jar myapp.jar
```

추가적으로  JVM이 어떤 메서드를 인라이닝(Inline Optimization)했는지 확인하고 싶다면 아래의 옵션을 사용하면 됩니다.

```sh 
java -XX:+UnlockDiagnosticVMOptions -XX:+PrintInlining -jar myapp.jar
```
intellij 에서는 아래에 부분에 추가해주면 됩니다.

[사진]

### 테스트
아래의 test용 controller에서 테스트를 진행해보겠습니다. 로그가 너무 많아서

`val result = productFacade.getProducts()` 의 실행 로그만 발췌하였습니다.

```kotlin
@RestController
@RequestMapping("/products")
class ProductController(
    private val productFacade: ProductFacade
) {
    @GetMapping("")
    fun getProducts(): ResponseEntity<List<ProductResponse>> {
        val result = productFacade.getProducts()
        val response = result.map { it.toResponse() }
        return ResponseEntity(response, HttpStatus.OK)
    }
}
```

자세하게 로그를 살펴보자면

- 첫번재 REST 요청 (처음 productFacade.getProducts() 실행)

```java
    24971 5085       1       java.util.EventObject::<init> (24 bytes)
                              @ 1   java.lang.Object::<init> (1 bytes)   inline
                              @ 14   java.lang.IllegalArgumentException::<init> (6 bytes)   don't inline Throwable constructors
  24975 5086       1       java.lang.ThreadLocal::setInitialValue (50 bytes)
                              @ 1   java.lang.ThreadLocal::initialValue (2 bytes)   no static binding
                              @ 5   java.lang.Thread::currentThread (0 bytes)   intrinsic
                              @ 11   java.lang.ThreadLocal::getMap (5 bytes)   no static binding
                              @ 22   java.lang.ThreadLocal$ThreadLocalMap::set (133 bytes)   callee is too large
                              @ 31   java.lang.ThreadLocal::createMap (14 bytes)   no static binding
                              @ 45   jdk.internal.misc.TerminatingThreadLocal::register (17 bytes)   inline
                                @ 3   java.lang.ThreadLocal::get (38 bytes)   callee is too large
                                @ 10   java.util.Collection::add (0 bytes)   no static binding
  24977 5087       1       java.io.ObjectStreamClass::forClass (52 bytes)
                              @ 10   java.io.ObjectStreamClass::requireInitialized (19 bytes)   inline
                                @ 14   java.lang.InternalError::<init> (6 bytes)   don't inline Throwable constructors
                              @ 13   java.lang.System::getSecurityManager (12 bytes)   inline
                                @ 0   java.lang.System::allowSecurityManager (13 bytes)   inline
                              @ 19   jdk.internal.reflect.Reflection::getCallerClass (0 bytes)   native method
                              @ 24   java.lang.Class::getClassLoader (28 bytes)   force inline by annotation
                                @ 1   java.lang.Class::getClassLoader0 (5 bytes)   inline
                                @ 11   java.lang.System::getSecurityManager (12 bytes)   inline
                                  @ 0   java.lang.System::allowSecurityManager (13 bytes)   inline
                                @ 20   jdk.internal.reflect.Reflection::getCallerClass (0 bytes)   native method
                                @ 23   java.lang.ClassLoader::checkClassLoaderPermission (29 bytes)   inline
                                  @ 0   java.lang.System::getSecurityManager (12 bytes)   inline
                                    @ 0   java.lang.System::allowSecurityManager (13 bytes)   inline
                                  @ 9   java.lang.ClassLoader::getClassLoader (11 bytes)   inline
                                    @ 7   java.lang.Class::getClassLoader0 (5 bytes)   inline
                                  @ 15   java.lang.ClassLoader::needsClassLoaderPermissionCheck (27 bytes)   inline
                                    @ 15   java.lang.ClassLoader::isAncestor (20 bytes)   inline
                                  @ 25   java.lang.SecurityManager::checkPermission (5 bytes)   no static binding
                              @ 31   java.lang.Class::getClassLoader (28 bytes)   force inline by annotation
                                @ 1   java.lang.Class::getClassLoader0 (5 bytes)   inline
                                @ 11   java.lang.System::getSecurityManager (12 bytes)   inline
                                  @ 0   java.lang.System::allowSecurityManager (13 bytes)   inline
                                @ 20   jdk.internal.reflect.Reflection::getCallerClass (0 bytes)   native method
                                @ 23   java.lang.ClassLoader::checkClassLoaderPermission (29 bytes)   inline
                                  @ 0   java.lang.System::getSecurityManager (12 bytes)   inline
                                    @ 0   java.lang.System::allowSecurityManager (13 bytes)   inline
                                  @ 9   java.lang.ClassLoader::getClassLoader (11 bytes)   inline
                                    @ 7   java.lang.Class::getClassLoader0 (5 bytes)   inline
                                  @ 15   java.lang.ClassLoader::needsClassLoaderPermissionCheck (27 bytes)   inline
                                    @ 15   java.lang.ClassLoader::isAncestor (20 bytes)   inline
                                  @ 25   java.lang.SecurityManager::checkPermission (5 bytes)   no static binding
                              @ 34   sun.reflect.misc.ReflectUtil::needsPackageAccessCheck (31 bytes)   inline
                                @ 19   sun.reflect.misc.ReflectUtil::isAncestor (20 bytes)   inline
                                  @ 3   java.lang.ClassLoader::getParent (32 bytes)   callee is too large
                              @ 44   sun.reflect.misc.ReflectUtil::checkPackageAccess (14 bytes)   inline
                                @ 0   java.lang.System::getSecurityManager (12 bytes)   inline
                                  @ 0   java.lang.System::allowSecurityManager (13 bytes)   inline
                                @ 10   sun.reflect.misc.ReflectUtil::privateCheckPackageAccess (30 bytes)   inline
                                  @ 1   java.lang.Class::getPackageName (81 bytes)   callee is too large
                                  @ 6   java.lang.String::isEmpty (14 bytes)   inline
               !m                 @ 14   java.lang.SecurityManager::checkPackageAccess (230 bytes)   no static binding
                                  @ 18   sun.reflect.misc.ReflectUtil::isNonPublicProxyClass (25 bytes)   inline
                                    @ 1   java.lang.reflect.Proxy::isProxyClass (22 bytes)   inline
                                      @ 3   java.lang.Class::isAssignableFrom (0 bytes)   native method
                                      @ 10   java.lang.reflect.Proxy$ProxyBuilder::isProxyClass (21 bytes)   inline
                                        @ 4   jdk.internal.loader.AbstractClassLoaderValue::sub (10 bytes)   inline
                                          @ 6   jdk.internal.loader.AbstractClassLoaderValue$Sub::<init> (15 bytes)   inline
                                            @ 6   jdk.internal.loader.AbstractClassLoaderValue::<init> (5 bytes)   inline
                                              @ 1   java.lang.Object::<init> (1 bytes)   inline
                                        @ 8   java.lang.Class::getClassLoader (28 bytes)   force inline by annotation
                                          @ 1   java.lang.Class::getClassLoader0 (5 bytes)   inline
                                          @ 11   java.lang.System::getSecurityManager (12 bytes)   inline
                                            @ 0   java.lang.System::allowSecurityManager (13 bytes)   inline
                                          @ 20   jdk.internal.reflect.Reflection::getCallerClass (0 bytes)   native method
                                          @ 23   java.lang.ClassLoader::checkClassLoaderPermission (29 bytes)   callee is too large
               !                        @ 11   jdk.internal.loader.AbstractClassLoaderValue::get (21 bytes)   callee is too large
                                        @ 17   java.util.Objects::equals (23 bytes)   callee is too large
                                    @ 10   java.lang.Class::getModifiers (0 bytes)   intrinsic
                                    @ 13   java.lang.reflect.Modifier::isPublic (12 bytes)   inline
                                  @ 26   sun.reflect.misc.ReflectUtil::privateCheckProxyPackageAccess (43 bytes)   callee is too large
  24980 5088       1       java.lang.AbstractStringBuilder::append (33 bytes)
                              @ 10   java.lang.AbstractStringBuilder::checkRange (63 bytes)   callee is too large
                              @ 20   java.lang.AbstractStringBuilder::ensureCapacityInternal (39 bytes)   callee is too large
                              @ 28   java.lang.AbstractStringBuilder::appendChars (130 bytes)   callee is too large
  24980 5089       1       java.nio.DirectByteBuffer::base (2 bytes)
2025-03-07T15:33:56.477+09:00 DEBUG 28279 --- [warmup-example] [nio-8080-exec-2] o.s.orm.jpa.JpaTransactionManager        : Found thread-bound EntityManager [SessionImpl(699375659<open>)] for JPA transaction
2025-03-07T15:33:56.479+09:00 DEBUG 28279 --- [warmup-example] [nio-8080-exec-2] o.s.orm.jpa.JpaTransactionManager        : Creating new transaction with name [org.springframework.data.jpa.repository.support.SimpleJpaRepository.findAll]: PROPAGATION_REQUIRED,ISOLATION_DEFAULT,readOnly
2025-03-07T15:33:56.509+09:00 DEBUG 28279 --- [warmup-example] [nio-8080-exec-2] o.s.jdbc.datasource.DataSourceUtils      : Setting JDBC Connection [HikariProxyConnection@1045768667 wrapping conn0: url=jdbc:h2:mem:test user=SA] read-only
2025-03-07T15:33:56.519+09:00 DEBUG 28279 --- [warmup-example] [nio-8080-exec-2] o.s.orm.jpa.JpaTransactionManager        : Exposing JPA transaction as JDBC [org.springframework.orm.jpa.vendor.HibernateJpaDialect$HibernateConnectionHandle@4b47baa0]
  25218 5090     n 0       java.lang.invoke.MethodHandle::linkToInterface(LLLL)L (native)   (static)
2025-03-07T15:33:56.800+09:00 DEBUG 28279 --- [warmup-example] [nio-8080-exec-2] org.hibernate.SQL                        : 
    select
        p1_0.id,
        p1_0.name,
        p1_0.price 
    from
        products p1_0
Hibernate: 
    select
        p1_0.id,
        p1_0.name,
        p1_0.price 
    from
        products p1_0
2025-03-07T15:33:56.934+09:00 DEBUG 28279 --- [warmup-example] [nio-8080-exec-2] o.s.orm.jpa.JpaTransactionManager        : Initiating transaction commit
2025-03-07T15:33:56.936+09:00 DEBUG 28279 --- [warmup-example] [nio-8080-exec-2] o.s.orm.jpa.JpaTransactionManager        : Committing JPA transaction on EntityManager [SessionImpl(699375659<open>)]
2025-03-07T15:33:56.941+09:00 DEBUG 28279 --- [warmup-example] [nio-8080-exec-2] o.s.jdbc.datasource.DataSourceUtils      : Resetting read-only flag of JDBC Connection [HikariProxyConnection@1045768667 wrapping conn0: url=jdbc:h2:mem:test user=SA]
2025-03-07T15:33:56.941+09:00 DEBUG 28279 --- [warmup-example] [nio-8080-exec-2] o.s.orm.jpa.JpaTransactionManager        : Not closing pre-bound JPA EntityManager after transaction
```

- 두번째 REST 요청 (두번째 productFacade.getProducts() 실행)

```java
    72963 5145       1       java.util.concurrent.locks.AbstractQueuedSynchronizer::acquire (20 bytes)
                              @ 2   java.util.concurrent.locks.AbstractQueuedSynchronizer::tryAcquire (8 bytes)   no static binding
               !              @ 15   java.util.concurrent.locks.AbstractQueuedSynchronizer::acquire (407 bytes)   callee is too large
2025-03-07T15:34:44.412+09:00 DEBUG 28279 --- [warmup-example] [nio-8080-exec-3] o.s.orm.jpa.JpaTransactionManager        : Found thread-bound EntityManager [SessionImpl(1642178553<open>)] for JPA transaction
2025-03-07T15:34:44.413+09:00 DEBUG 28279 --- [warmup-example] [nio-8080-exec-3] o.s.orm.jpa.JpaTransactionManager        : Creating new transaction with name [org.springframework.data.jpa.repository.support.SimpleJpaRepository.findAll]: PROPAGATION_REQUIRED,ISOLATION_DEFAULT,readOnly
2025-03-07T15:34:44.414+09:00 DEBUG 28279 --- [warmup-example] [nio-8080-exec-3] o.s.jdbc.datasource.DataSourceUtils      : Setting JDBC Connection [HikariProxyConnection@1311810940 wrapping conn0: url=jdbc:h2:mem:test user=SA] read-only
2025-03-07T15:34:44.416+09:00 DEBUG 28279 --- [warmup-example] [nio-8080-exec-3] o.s.orm.jpa.JpaTransactionManager        : Exposing JPA transaction as JDBC [org.springframework.orm.jpa.vendor.HibernateJpaDialect$HibernateConnectionHandle@51eb5823]
2025-03-07T15:34:44.422+09:00 DEBUG 28279 --- [warmup-example] [nio-8080-exec-3] org.hibernate.SQL                        : 
    select
        p1_0.id,
        p1_0.name,
        p1_0.price 
    from
        products p1_0
Hibernate: 
    select
        p1_0.id,
        p1_0.name,
        p1_0.price 
    from
        products p1_0
2025-03-07T15:34:44.428+09:00 DEBUG 28279 --- [warmup-example] [nio-8080-exec-3] o.s.orm.jpa.JpaTransactionManager        : Initiating transaction commit
2025-03-07T15:34:44.429+09:00 DEBUG 28279 --- [warmup-example] [nio-8080-exec-3] o.s.orm.jpa.JpaTransactionManager        : Committing JPA transaction on EntityManager [SessionImpl(1642178553<open>)]
2025-03-07T15:34:44.430+09:00 DEBUG 28279 --- [warmup-example] [nio-8080-exec-3] o.s.jdbc.datasource.DataSourceUtils      : Resetting read-only flag of JDBC Connection [HikariProxyConnection@1311810940 wrapping conn0: url=jdbc:h2:mem:test user=SA]
2025-03-07T15:34:44.432+09:00 DEBUG 28279 --- [warmup-example] [nio-8080-exec-3] o.s.orm.jpa.JpaTransactionManager        : Not closing pre-bound JPA EntityManager after transaction
```

위의 로그를 보면 첫번째 요청 시점이 들어온 시점에서 Lazy Loading 으로 메모리에 적재된다는 것을 확인할 수 있습니다.

또한 두번째 요청이 오는 시점에는 이미 메모리에 적재되었기에 컴파일 관련 로그가 없다는 것을 확인 할 수 있습니다.

그러나, 로그로만으로 실행된 모든 코드를 확인하기 어렵기 때문에 프로파일러 도구를 사용하는 것도 좋아보입니다.

### JFR(Java Flight Recorder)

**JFR(Java Flight Recorder)**은 JVM 내부 상태를 기록하는 도구로, JIT 최적화된 코드와 실행된 메서드들을 확인할 수 있습니다.

- JFR 실행 방법 (JVM 옵션 추가)

```sh
// duration=60s -> 60초 동안 실행된 코드들을 기록
// filename=warmup.jfr -> 결과를 warmup.jfr 파일에 저장
java -XX:StartFlightRecording=filename=warmup.jfr,duration=60s -jar myapp.jar
```

또한 **Java Mission Control (JMC) 툴**을 사용하여 .jfr 파일을 열면 어떤 메서드가 많이 실행되었고, JIT 최적화가 어떻게 되었는지 **시각적**으로 확인 가능합니다.


### 테스트 결과 정리

위의 테스트 진행과정에서 로그로 어플리케이션이 기동되는 시점에서 최적화가 진행이 안되어있기에 첫번재 REST요청에 대해서 latency가 발생한 다는 것을 알 수 있었습니다.

그렇다면 해결방법은 어플리케이션이 기동된 후 최적화를 시킨 후 REST 요청을 받게한다면 latency 성능 향상을 기대할 수 있을 것입니다.

그렇다면 이런 성능 최적화는 간단하게 해결 가능합니다. 

> **"미리 한번씩 코드를 최적화하여 컴파일 하면됩니다."**

이 과정을 `JVM Warmup`이라고 칭하는 것입니다.

### JVM Warmup 하는 방법

방법은 여러가지가 있겠지만, 스프링 애플리케이션에서는 `ApplicationRunner` 를 이용해 스프링 애플리케이션이 기동될 때 특정 코드를 실행할 수 있도록 할 수 있습니다.

특히 자주 사용할 것같은 메소드를 미리 호출하므로 써 warmup을 진행한다면 보다 효과적일 것입니다.

아래에서는 `ApplicationReadyEvent`를 활용하여 warmup을 진행해보겠습니다.

```kotlin
@Component
class SpringEventHandler(
    private val productController: ProductController,
    private val userController: UserController,
) {
    @EventListener(ApplicationReadyEvent::class)
    fun onApplicationReadyEvent(event: ApplicationReadyEvent?) {
        println("ApplicationReadyEvent!")
        println("warm up")
        userController.getUsers()
        productController.getProducts()
    }
}
```

### JVM Warmup 전과 후 테스트

JVM Warmup 전과 후에 spring 기동후 한번의 REST 요청을 보내어 시간을 측정해보았습니다.

- warmup 전 수행 시간(최초호출 : 51.397 ms)
  ![image.png](/assets/img/warmup/before-warmup1.png)

- warmup 후 수행시간(최초호출 : 1.358 ms)
  ![image.png](/assets/img/warmup/after-warmup.png)

**warmup을 진행한 후에 메소드 수행 속도가 현저하게 빨라진 것을 확인할 수 있었습니다.**

위의 테스트 결과로 **"JVM warmup을 하고 안하고는 REST 요청의 성능에 영향을 줄 수 있다."**를 알 수 있었습니다.

여기서 저는 추가로 아래의 의문점이 들었습니다.

> 그렇다면 controller의 하나의 API(메소드)만 수행해놓아도 충분히 warmup이 될까?
{:.prompt-tip}

"controller의 하나의 API(메소드)만 수행해놓아도 충분히 warmup이 될까?"라는 질문에 대한 답은 **"그렇지 않을 수도 있다"** 입니다.

위에서 언급했듯이 JVM Warmup을 효과적으로 진행하려면 모든 **"주요"** 엔드포인트에 최소한 한 번씩 요청을 보내는 것이 가장 좋습니다.

왜냐하면 **"JVM은 자주 실행 되는 코드를 컴파일하고 캐시하며 클래스는 필요할 때 Lazy Loading 으로 메모리에 적재하며, JIT(Just-In-Time) 컴파일의 최적화 대상이 되는 코드는 실제로 실행된 코드만 포함되기 때문"** 입니다.

그러나 너무 API가 많거나, 커버되는 영역이 큰 API, 자주 사용되는, 중요한 API에 대해서만 warmup을 진행해도 크게 성능개선을 이룰 수 있습니다.

- **JVM 웜업의 핵심 포인트**
	1. JIT(Just-In-Time) 컴파일의 최적화 대상이 되는 코드는 실제로 실행된 코드만 포함됨.
		- 즉, 특정 API 하나만 호출하면 그 API에서 실행된 코드만 JIT 컴파일되고, 다른 API는 그대로 느릴 수 있음.
	2. Spring의 빈 초기화는 일부 API만 호출해도 대부분 완료되지만, API별 로직은 다를 수 있다.
		- 예를 들어, @Service, @Repository 등이 사용되는 클래스는 일부 API에서만 호출될 수 있으므로, 다른 API는 여전히 느릴 가능성이 있음.
	3. Hibernate 및 DB 관련 최적화는 엔드포인트별로 다를 수 있음
		- 첫 번째 쿼리 실행 시 Hibernate가 Lazy Loading을 적용하면, 특정 엔드포인트에서는 DB 조회가 처음 실행될 때 지연이 발생할 수 있음.


## 결론

Spring 애플리케이션을 기동할 때, 첫 번째 API 호출 후에 Dispatcher Servlet이 초기화되며, 이로 인해 초기 호출 시 API 응답이 느려질 수 있습니다.

성능 최적화를 위해서는 모든 API를 한 번씩 호출하여 JIT 컴파일과 Hibernate 초기화를 하여 warmup하는 것이 가장 좋습니다.

그러나 모든 API를 호출하는 것은 warmup 과정이 오래걸릴 수 있기에 자주 사용하는 API만을 warmup하여 진행해도 좋은 방법입니다.

이 과정을 자동화하려면, `@PostConstruct`나 `ApplicationRunner`, `ApplicationReadyEvent`를 사용하여 애플리케이션이 시작된 후 내부적으로 API를 호출하여 warmup을 진행할 수 있습니다.

또한, 배포 후에는 curl이나 k6와 같은 도구를 사용해 warmup 테스트를 진행하는 방법도 있습니다.

특히 실제 환경에서는 curl이나 k6를 활용해 주요 API를 미리 호출함으로써 JIT 컴파일과 함께, 실제 트래픽을 처리하기 전에 필요한 모든 초기화 작업을 수행하면 성능향상을 기대할 수 있습니다.

## 번외

curl로 호출을 해보면 다음과 같은 결과를 볼 수 있습니다.

```sh
curl -o /dev/null -s -w "Time Total: %{time_total}s\n" http://localhost:8080/products
```
![image.png](/assets/img/warmup/curl.png)

사용한 curl 옵션에 대한 설명은 다음과 같습니다.


| 옵션          | 설명                                     |
| ------------- | ---------------------------------------- |
| -o /dev/null  | 응답 본문 출력 제거                      |
| -s            | 진행 상태 출력 숨김                      |
| -w            | 원하는 응답 메트릭 출력                  |
| %{time_total} | 요청~응답 완료까지 걸린 총 시간(초 단위) |


[출처]
- https://www.youtube.com/watch?v=CQi3SS2YspY
- https://engineering.linecorp.com/ko/blog/apply-warm-up-in-spring-boot-and-kubernetes
- https://www.baeldung.com/java-jvm-warmup
