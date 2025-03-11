---
title: Spring Boot 초기 데이터 설정 방법(runner, event)
description: runner, spring event를 활용하는 방법
author: ydj515
date: 2025-03-11 11:33:00 +0800
categories: [spring, applicationcontext]
tags: [spring, springboot, applicationcontext, spring event, runner, java, kotlin]
pin: true
math: true
mermaid: true
image:
  path: /assets/img/spring/logo.png
  lqip: data:image/webp;base64,UklGRpoAAABXRUJQVlA4WAoAAAAQAAAADwAABwAAQUxQSDIAAAARL0AmbZurmr57yyIiqE8oiG0bejIYEQTgqiDA9vqnsUSI6H+oAERp2HZ65qP/VIAWAFZQOCBCAAAA8AEAnQEqEAAIAAVAfCWkAALp8sF8rgRgAP7o9FDvMCkMde9PK7euH5M1m6VWoDXf2FkP3BqV0ZYbO6NA/VFIAAAA
  alt: spring
---

## Spring Boot 초기 데이터 설정 방법

Spring Boot에서는 애플리케이션 초기 데이터 설정이 필요한 경우가 종종 있습니다. 예를 들어, 기본 사용자 계정이나 설정값을 데이터베이스에 저장하거나 캐시에 초기값을 넣는 경우입니다.

이를 위해 Spring에서는 여러 가지 방법을 제공합니다. `init.sql`을 작성하여 넣을 순 있지만 JPA를 사용한다면 sql을 사용하지 않고도 초기 데이터를 구축을 할 수 있습니다.

spring 혹은 java를 활용하여 초기 데이터를 설정하는 방법에 대해 소개합니다.

> java17, springboot3.x기준으로 설명합니다.  
> kotlin과 전체 sample은 [github-sample](https://github.com/ydj515/blog-example/tree/main/runner-example)를 참조해주세요.

## @PostConstruct
`@PostConstruct`는 Bean이 초기화될 때 자동으로 실행되는 메서드에 사용할 수 있는 어노테이션입니다.

Spring 컨텍스트가 로드된 후, `@SpringBootApplication` 빈 **의존성 주입이 완료된 직후**에 실행됩니다.

```java
@SpringBootApplication
public class RunnerExampleApplicationJava {

    public static void main(String[] args) {
        SpringApplication.run(RunnerExampleApplicationJava.class, args);
    }

    @PostConstruct
    public void postConstruct() {
        // TODO entity insert
    }
}
```

## CommandLineRunner
`CommandLineRunner`는 애플리케이션이 시작된 후 커맨드라인 인수를 인자로 받아 실행되는 인터페이스입니다.

### 사용 예시
```java
@Component
@RequiredArgsConstructor
public class MyCommandLineRunnerJava implements CommandLineRunner {

    private final UserJpaRepository userRepository;

    @Override
    public void run(String... args) throws Exception {
        User user = new User();
        userRepository.save(user);
    }
}
```

## ApplicationRunner
`ApplicationRunner`는 `CommandLineRunner`와 유사하지만, `ApplicationArguments` 객체를 통해 더 구조화된 방식으로 인수를 받을 수 있습니다.

### 사용 예시
```java
@Component
@RequiredArgsConstructor
public class MyApplicationRunnerJava implements ApplicationRunner {

    private final UserJpaRepository userRepository;

    @Override
    public void run(ApplicationArguments args) throws Exception {
        User user = new User();
        userRepository.save(user);
    }
}
```

## ApplicationReadyEvent
`ApplicationReadyEvent`는 **모든 Bean 초기화가 완료되고 애플리케이션이 완전히 준비된 이후**에 발생하는 이벤트입니다.

애플리케이션이 완전히 실행된 후에만 동작합니다. 애플리케이션이 완전히 실행된 후에 event를 받아 진행되기에 비동기 작업이나 외부 서비스 호출 같은 작업에 적합합니다.

### 사용 예시
```java
@Component
@RequiredArgsConstructor
public class SpringEventHandlerJava {

    private final UserJpaRepository userRepository;

    @EventListener(ApplicationReadyEvent.class)
    public void onApplicationReadyEvent(ApplicationReadyEvent event) {
        User user = new User();
        userRepository.save(user);
    }
}
```

## 실행 순서 비교

| 방식                  | 실행 시점                 | 특징                               |
| --------------------- | ------------------------- | ---------------------------------- |
| @PostConstruct        | Bean 초기화 직후          | 가장 빠름, 간단한 작업에 적합      |
| CommandLineRunner     | 애플리케이션 시작 직후    | 커맨드라인 인자 접근 가능          |
| ApplicationRunner     | 애플리케이션 시작 직후    | 커맨드라인 인자 구조화             |
| ApplicationReadyEvent | 애플리케이션 시작 완료 후 | 가장 늦게 실행됨, 비동기 작업 적합 |

## 실행 로그

아래의 실행로그를 보면 위에서 설명한 `postConstruct`, `CommandLineRunner`, `ApplicationRunner`, `ApplicationReadyEvent` 의 순서를 확인할 수 있다.

```java
  .   ____          _            __ _ _
 /\\ / ___'_ __ _ _(_)_ __  __ _ \ \ \ \
( ( )\___ | '_ | '_| | '_ \/ _` | \ \ \ \
 \\/  ___)| |_)| | | | | || (_| |  ) ) ) )
  '  |____| .__|_| |_|_| |_\__, | / / / /
 =========|_|==============|___/=/_/_/_/

 :: Spring Boot ::                (v3.4.2)

2025-03-04T03:41:31.811+09:00  INFO 14774 --- [runner-example] [           main] c.e.r.RunnerExampleApplicationKt         : Starting RunnerExampleApplicationKt using Java 17.0.13 with PID 14774 (/Users/dongjin/dev/project/blog-example/runner-example/build/classes/kotlin/main started by dongjin in /Users/dongjin/dev/project/blog-example/runner-example)
2025-03-04T03:41:31.812+09:00  INFO 14774 --- [runner-example] [           main] c.e.r.RunnerExampleApplicationKt         : No active profile set, falling back to 1 default profile: "default"
2025-03-04T03:41:32.113+09:00  INFO 14774 --- [runner-example] [           main] o.s.b.w.embedded.tomcat.TomcatWebServer  : Tomcat initialized with port 8080 (http)
2025-03-04T03:41:32.119+09:00  INFO 14774 --- [runner-example] [           main] o.apache.catalina.core.StandardService   : Starting service [Tomcat]
2025-03-04T03:41:32.119+09:00  INFO 14774 --- [runner-example] [           main] o.apache.catalina.core.StandardEngine    : Starting Servlet engine: [Apache Tomcat/10.1.34]
2025-03-04T03:41:32.143+09:00  INFO 14774 --- [runner-example] [           main] o.a.c.c.C.[Tomcat].[localhost].[/]       : Initializing Spring embedded WebApplicationContext
2025-03-04T03:41:32.143+09:00  INFO 14774 --- [runner-example] [           main] w.s.c.ServletWebServerApplicationContext : Root WebApplicationContext: initialization completed in 309 ms
postConstruct!
2025-03-04T03:41:32.254+09:00  INFO 14774 --- [runner-example] [           main] o.s.b.w.embedded.tomcat.TomcatWebServer  : Tomcat started on port 8080 (http) with context path '/'
2025-03-04T03:41:32.257+09:00  INFO 14774 --- [runner-example] [           main] c.e.r.RunnerExampleApplicationKt         : Started RunnerExampleApplicationKt in 0.556 seconds (process running for 0.706)
CommandLineRunner!
ApplicationRunner!
ApplicationReadyEvent!
```

## 결론
무엇을 사용하던 크게 상관은 없지만, application이 정상적으로 구동된 이후 데이터를 넣을 수 있는 `ApplicationReadyEvent`를 사용하를 권장합니다.