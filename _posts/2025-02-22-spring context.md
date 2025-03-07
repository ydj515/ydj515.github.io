---
title: Spring application context 순서
description: spring application context 로딩 순서
author: ydj515
date: 2025-02-22 11:33:00 +0800
categories: [spring, applicationcontext]
tags: [spring, springboot, applicationcontext, troubleshooting]
pin: true
math: true
mermaid: true
image:
  path: /assets/img/spring/logo.png
  lqip: data:image/webp;base64,UklGRpoAAABXRUJQVlA4WAoAAAAQAAAADwAABwAAQUxQSDIAAAARL0AmbZurmr57yyIiqE8oiG0bejIYEQTgqiDA9vqnsUSI6H+oAERp2HZ65qP/VIAWAFZQOCBCAAAA8AEAnQEqEAAIAAVAfCWkAALp8sF8rgRgAP7o9FDvMCkMde9PK7euH5M1m6VWoDXf2FkP3BqV0ZYbO6NA/VFIAAAA
  alt: spring
---

## Spring application context
Springboot를 사용하다보면 Spring context의 로딩 순서에 대해 그냥 넘어갈 때가 있다. 최근에 기본 Spring project를 진행하면서 로딩 순서또한 기억하고자 기록에 남깁니다.

## Spring 구동 순서
Spring의 구동 순서는 크게 부트스트랩 단계 -> 컨텍스트 초기화 -> 빈 생성 및 등록 -> 애플리케이션 실행 순서로 진행됩니다.

### Springboot기준으로 설명하자면
1.	JVM 실행 & Spring Boot 초기화
  - main() 메서드에서 SpringApplication.run() 호출
  - Spring Boot의 SpringApplication이 실행되며 초기 설정 수행
2.	ApplicationContext 생성
  - ApplicationContext가 생성됨
  - 일반적으로 AnnotationConfigApplicationContext(자바 기반 설정) 또는 GenericWebApplicationContext(웹 애플리케이션의 경우) 사용
3.	Environment 및 Property 설정
  - application.properties 또는 application.yml 등에서 환경 변수를 읽어 Environment에 로드
  - 커맨드라인 인자 및 OS 환경 변수도 반영됨
4.	BeanFactory 생성 및 설정
  - ApplicationContext 내부적으로 BeanFactory를 생성
  - @ComponentScan, @Bean, @Configuration 등의 설정을 기반으로 빈 정의 분석
5.	WebApplicationContext 초기화 (웹 애플리케이션일 경우)
  - Spring MVC를 사용하는 경우 WebApplicationContext가 생성됨
  - DispatcherServlet이 등록되고 서블릿 컨텍스트에 연결됨
6.	Bean 등록 및 의존성 주입
  - @Component, @Service, @Repository, @Controller 등의 빈을 스캔하여 BeanFactory에 등록
  - 빈 간의 의존성을 주입 (@Autowired, @Inject, @Resource)
7.	ApplicationRunner / CommandLineRunner 실행
  - ApplicationRunner, CommandLineRunner 인터페이스를 구현한 빈 실행 (만약 존재하면)
8.	Spring 애플리케이션 실행 준비 완료
  - 컨텍스트가 완전히 초기화되고, 서버가 기동됨
  - ServletContainer(Tomcat, Jetty 등)가 실행되어 요청을 처리할 준비 완료


## ApplicationContext와 WebApplicationContext 차이

Spring에서 ApplicationContext와 WebApplicationContext는 각각의 역할이 있습니다.

### ApplicationContext
- 기본적인 Spring 컨텍스트
- BeanFactory를 확장한 형태로, 애플리케이션의 전반적인 빈 관리
- CLI 애플리케이션, 백엔드 서버, API 서버 등에서 사용

- 주요 구현체
	1. AnnotationConfigApplicationContext
     - @Configuration 기반의 자바 설정을 사용하는 경우
	2. ClassPathXmlApplicationContext
    - XML 기반 설정을 사용하는 경우

### WebApplicationContext
- 웹 애플리케이션을 위한 ApplicationContext 확장 버전
- ApplicationContext를 기반으로 하면서, 웹 관련 빈 (Servlet, Filter 등) 추가 관리
- DispatcherServlet과 연계하여 HTTP 요청을 처리

- 주요 구현체
	1. GenericWebApplicationContext
     - 웹 애플리케이션에서 @Configuration 설정 사용
	2. XmlWebApplicationContext
     - XML 설정을 사용하는 경우

## Spring Boot에서의 컨텍스트 로딩 순서

Spring Boot의 웹 애플리케이션에서 컨텍스트 로딩 순서를 정리하면 다음과 같습니다.

1. SpringApplication.run() 호출
2. ApplicationContext 생성 및 초기화
3. WebApplicationContext 초기화 (ServletContext 등록)
4. Bean 등록 및 의존성 주입
5. DispatcherServlet 등록 및 실행
6. Spring MVC 및 서블릿 컨테이너(Tomcat 등) 실행

즉, 일반적인 ApplicationContext가 먼저 로딩된 후, WebApplicationContext가 설정되면서 DispatcherServlet이 동작하는 방식입니다.

## Spring에서 설정파일들로 다시 말하자면
Spring보다 Springboot의 장점은 초기 스프링이 기동되는 빈들의 순서가 꼬이지않게 설정을 알아서 잘해준다는 점입니다.
아래는 흔히 Spring만 사용한다면 자주 만지는 설정파일들 이므로 나중에 호되게 안당하려면 다시 되새김질 해도 좋습니다.

### web.xml (배포 서술자, Deployment Descriptor)
- 애플리케이션이 가장 먼저 실행될 때 로드됨
- 서블릿 컨테이너(Tomcat 등)가 시작될 때 실행됨
- DispatcherServlet 및 ContextLoaderListener를 설정
- root-context.xml과 servlet-context.xml의 로딩을 담당

- 역할: 전체 웹 애플리케이션의 기본적인 환경을 설정하고, ContextLoaderListener를 통해 Root ApplicationContext를 생성
- 주요 설정: DispatcherServlet, ContextLoaderListener 등록

```xml
<web-app>
    <!-- Root ApplicationContext 로드 -->
    <listener>
        <listener-class>org.springframework.web.context.ContextLoaderListener</listener-class>
    </listener>

    <!-- DispatcherServlet 등록 (Servlet ApplicationContext 생성) -->
    <servlet>
        <servlet-name>dispatcher</servlet-name>
        <servlet-class>org.springframework.web.servlet.DispatcherServlet</servlet-class>
        <load-on-startup>1</load-on-startup>
    </servlet>

    <servlet-mapping>
        <servlet-name>dispatcher</servlet-name>
        <url-pattern>/</url-pattern>
    </servlet-mapping>
</web-app>
```


### root-context.xml (Root ApplicationContext)
- web.xml의 ContextLoaderListener에 의해 로드됨
- 전역적으로 사용할 Bean을 설정 (예: 데이터베이스 연결, 서비스 계층 Bean)
- Spring MVC가 아닌, 애플리케이션 전반에서 공유되는 설정을 담당
- Controller에서 사용될 필요 없는 Service, Repository, DataSource, TransactionManager 등이 포함됨

- 역할: 전역 Bean 등록 (DB, 트랜잭션, 공통 설정 등)
- Servlet Context와 분리됨

```xml
<beans>
    <bean id="dataSource" class="org.apache.commons.dbcp.BasicDataSource">
        <property name="driverClassName" value="com.mysql.cj.jdbc.Driver"/>
        <property name="url" value="jdbc:mysql://localhost:3306/test"/>
        <property name="username" value="root"/>
        <property name="password" value="password"/>
    </bean>

    <bean id="transactionManager" class="org.springframework.orm.hibernate5.HibernateTransactionManager">
        <property name="sessionFactory" ref="sessionFactory"/>
    </bean>
</beans>
```

### servlet-context.xml (Servlet ApplicationContext)
- web.xml에서 등록된 DispatcherServlet이 로딩할 때 실행됨
- Spring MVC 관련 설정 담당
- Controller, View Resolver, Interceptor 등의 설정 포함
- @Controller, @RestController와 같은 Spring MVC의 컴포넌트 스캔
- root-context.xml과 다르게 DispatcherServlet 내부에서만 사용되는 Bean을 정의
- 일반적으로 View Resolver, HandlerMapping 등이 포함됨

- 역할: Controller와 View 관련 설정 담당
- Root ApplicationContext와는 별개로 DispatcherServlet 내에서만 사용됨

```xml
<beans>
    <!-- Component Scan 설정 -->
    <context:component-scan base-package="com.example.controller"/>

    <!-- View Resolver 설정 -->
    <bean class="org.springframework.web.servlet.view.InternalResourceViewResolver">
        <property name="prefix" value="/WEB-INF/views/"/>
        <property name="suffix" value=".jsp"/>
    </bean>
</beans>
```

### 로딩 순서
1.	web.xml
  - 서블릿 컨테이너 시작 시 실행됨
  - ContextLoaderListener가 실행되어 Root ApplicationContext(root-context.xml) 로딩
  - DispatcherServlet이 실행되어 Servlet ApplicationContext(servlet-context.xml) 로딩
2.	root-context.xml
  - web.xml의 ContextLoaderListener에 의해 로딩됨
  - 전역적으로 사용되는 Bean 등록 (DB, 서비스, 트랜잭션 등)
  - servlet-context.xml에서 공유 가능
3.	servlet-context.xml
  - DispatcherServlet이 실행될 때 로딩됨
  - Spring MVC 관련 설정을 담당 (Controller, View Resolver, Interceptor 등)
  - root-context.xml의 Bean을 참조 가능

> 전역적인 설정은 root-context.xml에 위치 (DB, 서비스, 공통 빈)  
> Spring MVC 관련 설정은 servlet-context.xml에 위치 (Controller, View 설정 등)  
> **모든 로딩의 시작은 web.xml**에서 이루어지며, 여기서 ContextLoaderListener와 DispatcherServlet이 각각 root-context.xml과 servlet-context.xml을 로딩  
> servlet-context.xml은 root-context.xml을 참조할 수 있지만, 그 반대는 불가능  
{:.prompt-tip}



## 결론
- ApplicationContext는 Spring의 기본적인 컨텍스트로 빈을 관리
- WebApplicationContext는 ApplicationContext를 확장하여 웹 관련 빈과 DispatcherServlet을 관리
- Spring Boot에서는 SpringApplication.run()을 통해 컨텍스트를 로딩하고 이후 WebApplicationContext가 추가됨
- 컨텍스트가 초기화되면서 빈이 생성 및 등록되고, 의존성 주입이 이루어진 후, 서블릿 컨테이너가 기동됨
