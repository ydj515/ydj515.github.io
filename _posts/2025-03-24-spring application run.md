---
title: SpringApplication.run
description: spring application run 하면 어떤 일을 하는지
author: ydj515
date: 2025-03-24 11:33:00 +0800
categories: [spring, applicationcontext]
tags: [spring, springboot, applicationcontext]
pin: true
math: true
mermaid: true
image:
  path: /assets/img/spring/logo.png
  lqip: data:image/webp;base64,UklGRpoAAABXRUJQVlA4WAoAAAAQAAAADwAABwAAQUxQSDIAAAARL0AmbZurmr57yyIiqE8oiG0bejIYEQTgqiDA9vqnsUSI6H+oAERp2HZ65qP/VIAWAFZQOCBCAAAA8AEAnQEqEAAIAAVAfCWkAALp8sF8rgRgAP7o9FDvMCkMde9PK7euH5M1m6VWoDXf2FkP3BqV0ZYbO6NA/VFIAAAA
  alt: spring
---

## springboot 실행 순서

### 1. main 호출
springboot의 main 함수를 호출하며 따라가보면 `SpringApplication.runApplication`를 호출합니다.

```kotlin
@SpringBootApplication
class WarmupExampleApplication

fun main(args: Array<String>) {
	runApplication<WarmupExampleApplication>(*args)
    // runApplication를 눌르면 아래와 같은 함수가 나옵니다.
    // public inline fun <reified T : kotlin.Any> runApplication(vararg args: kotlin.String): org.springframework.context.ConfigurableApplicationContext { /* compiled code */ }
}

```


> kotlin springboot는 한번 래핑한 함수가 있는데요?  
> Java에서는 MyApplication.class를 직접 넘길 수 있지만, Kotlin에서는 T::class.java를 사용해야 하는 불편함이 있습니다. 
> 이를 더 간결하게 하기 위해 Kotlin의 reified 키워드를 사용한 runApplication<T>() 함수가 추가된 것입니다.
> ```kotlin
> // 모두 동일
> runApplication<WarmupExampleApplication>(*args) // 1
> SpringApplication.run(WarmupExampleApplication::class.java, *args) // 2
> ```
> 추가적으로 runApplication<T>() 함수의 핵심은 **reified** 키워드입니다.    
> 보통 제네릭 타입은 런타임에 타입 정보를 알 수 없지만, reified를 사용하면 제네릭 타입을 런타임에도 유지할 수 있습니다.  
> 위에서 T::class.java를 사용할 수 있는 건 reified 덕분입니다. 일반적인 제네릭 함수에서는 T::class를 사용할 수 없지만, reified가 있으면 가능합니다.
{:.prompt-info}

java에서는 아래와 같은 형태입니다.

```java
@SpringBootApplication
public class MyApplication {
    public static void main(String[] args) {
        SpringApplication.run(MyApplication.class, args);
    }
}
```

### 2. run() 분석

`SpringApplication.run(MyApplication.class, args);`을 호출하게 되면 아래의 메소드가 호출되고,

```java
public static ConfigurableApplicationContext run(Class<?> primarySource, String... args) {
    return run(new Class[]{primarySource}, args);
}
```

다시 `run(new Class[]{primarySource}, args);`는 아래를 호출하고,

```java
public static ConfigurableApplicationContext run(Class<?>[] primarySources, String[] args) {
    return (new SpringApplication(primarySources)).run(args);
}
```

결과적으로 아래의 `ConfigurableApplicationContext run(String... args)`를 호출합니다.


`run()` 메소드가 어떻게 동작하는지 주석으로 설명을 적어놓았습니다.

```java
public ConfigurableApplicationContext run(String... args) {
    // 애플리케이션 실행 시간 측정을 위한 Startup 객체 생성
    Startup startup = SpringApplication.Startup.create();

    // 애플리케이션 종료 시 shutdown hook 등록 여부 확인 및 설정
    if (this.properties.isRegisterShutdownHook()) {
        shutdownHook.enableShutdownHookAddition();
    }

    // 부트스트랩 컨텍스트 생성 (애플리케이션 실행 전에 필요한 객체들을 미리 준비)
    DefaultBootstrapContext bootstrapContext = this.createBootstrapContext();
    ConfigurableApplicationContext context = null;

    // AWT 환경에서 headless 모드 설정 (UI 없는 서버 환경 지원)
    this.configureHeadlessProperty();

    // 애플리케이션 실행 리스너(SpringApplicationRunListeners) 생성 및 실행 시작 알림
    SpringApplicationRunListeners listeners = this.getRunListeners(args);
    listeners.starting(bootstrapContext, this.mainApplicationClass);

    try {
        // 애플리케이션 인자를 객체(ApplicationArguments)로 변환
        ApplicationArguments applicationArguments = new DefaultApplicationArguments(args);

        // 환경 정보(ConfigurableEnvironment) 설정 및 리스너 호출
        ConfigurableEnvironment environment = this.prepareEnvironment(listeners, bootstrapContext, applicationArguments);

        // 배너 출력 (Spring Boot 로고 등)
        Banner printedBanner = this.printBanner(environment);

        // 애플리케이션 컨텍스트 생성 (Spring ApplicationContext 초기화)
        context = this.createApplicationContext();
        context.setApplicationStartup(this.applicationStartup);

        // 컨텍스트 준비 단계 (빈 등록, 환경 설정, 리스너 실행)
        this.prepareContext(bootstrapContext, context, environment, listeners, applicationArguments, printedBanner);

        // 애플리케이션 컨텍스트 초기화 및 빈 로드
        this.refreshContext(context);

        // 컨텍스트 초기화 후 추가적인 작업 수행 (커스텀 로직 등)
        this.afterRefresh(context, applicationArguments);

        // 애플리케이션 실행 완료 시간 기록
        startup.started();

        // 애플리케이션 실행 정보 로깅
        if (this.properties.isLogStartupInfo()) {
            (new StartupInfoLogger(this.mainApplicationClass, environment)).logStarted(this.getApplicationLog(), startup);
        }

        // 애플리케이션이 완전히 시작됨을 리스너에 알림
        listeners.started(context, startup.timeTakenToStarted());

        // ApplicationRunner 및 CommandLineRunner 실행 (애플리케이션 실행 후 추가 로직 수행)
        this.callRunners(context, applicationArguments);
    } catch (Throwable ex) {
        // 실행 중 예외 발생 시 예외 처리 및 애플리케이션 종료 처리
        throw this.handleRunFailure(context, ex, listeners);
    }

    try {
        // 애플리케이션이 정상 실행 상태인지 확인 후, 실행 완료 상태를 리스너에 알림
        if (context.isRunning()) {
            listeners.ready(context, startup.ready());
        }

        return context;
    } catch (Throwable ex) {
        // 실행 완료 후 예외 발생 시 다시 한 번 예외 처리
        throw this.handleRunFailure(context, ex, (SpringApplicationRunListeners)null);
    }
}
```

### 상세 분석

위에서 본 `ConfigurableApplicationContext run(String... args)`을 하나하나 뜯어보면서 상세히 어떤 동작을 하는지 설명을 적어놓았습니다.

1. 애플리케이션 실행 시간 측정을 위한 Startup 객체 생성

    ```java
    Startup startup = SpringApplication.Startup.create();
    ```

    아래의 static method를 호출합니다.

    ```java
    abstract static class Startup {
        // ...

        static Startup create() {
            ClassLoader classLoader = Startup.class.getClassLoader();
            return (Startup)(ClassUtils.isPresent("jdk.crac.management.CRaCMXBean", classLoader) && ClassUtils.isPresent("org.crac.management.CRaCMXBean", classLoader) ? new CoordinatedRestoreAtCheckpointStartup() : new StandardStartup());
        }
    }
    ```

    자세히 보자면 `jdk.crac.management.CRaCMXBean` 의 유무에 따라서 `CoordinatedRestoreAtCheckpointStartup` 혹은 `StandardStartup`을 생성합니다.

    `jdk.crac.management.CRaCMXBean`란 JDK 21부터 도입된 Coordinated Restore at Checkpoint (CRaC) 기능과 관련된 MXBean(Management Extension Bean)입니다.

    JMX(Java Management Extensions) 인터페이스를 통해 CRaC 상태를 모니터링하고 제어하는 데 사용됩니다. 일반적으로 다음과 같은 기능을 제공합니다.

    - **체크포인트 요청 감지**
    - 애플리케이션이 체크포인트를 만들 준비가 되었는지 확인할 수 있음.

    - **복원 후 처리 로직 관리**
    - 복원 후 수행할 초기화 작업을 정의하는 데 활용될 수 있음.

    - **CRaC 관련 상태 정보 제공**
    - 현재 애플리케이션이 체크포인트를 지원하는지 확인 가능.
    - 마지막 체크포인트 생성 시각 등의 정보를 조회 가능.


    > CRaC는 애플리케이션의 실행 상태(Snapshot)를 저장한 뒤, 이를 빠르게 복구하여 Cold Start 문제를 해결하는 데 초점을 둡니다. 이를 통해 Java 애플리케이션의 기동 속도를 크게 향상시킬 수 있습니다.
    {:.prompt-info}

    그렇다면 우리는 CRaC와 CRaCMXBean를 다음의 경우에서 사용 가능할 것입니다.

    1. 서버 애플리케이션의 빠른 재시작이 필요한 경우
    - Java 애플리케이션의 Cold Start 시간을 줄이기 위해 사용.
    - 서버가 다운된 후에도 빠르게 이전 상태로 복구 가능.

    1. 컨테이너 환경에서 애플리케이션 기동 속도를 개선하고 싶을 때
    - Kubernetes, Docker 등에서 Java 애플리케이션을 빠르게 재기동할 때 유용.

    1. JVM의 체크포인트/복원 상태를 모니터링하고 관리하고 싶을 때
    - CRaCMXBean을 이용하면 CRaC 기능이 정상적으로 동작하는지 체크할 수 있음.

    다시 돌아가서 말하자면, JDK21이하를 사용한다면 `StandardStartup`이 생성됩니다.

    `StandardStartup`을 들여다보면 애플리케이션 실행 시간 측정을 위한 `startTime`을 관리하는 것을 확인할 수 있습니다.

    ```java
    private static final class StandardStartup extends Startup {
        private final Long startTime = System.currentTimeMillis();

        private StandardStartup() {
        }

        protected long startTime() {
            return this.startTime;
        }

        protected Long processUptime() {
            try {
                return ManagementFactory.getRuntimeMXBean().getUptime();
            } catch (Throwable var2) {
                return null;
            }
        }

        protected String action() {
            return "Started";
        }
    }
    ```

    즉, `SpringApplication.Startup.create()`는 애플리케이션의 실행 시간을 측정하기 위한 `Startup` 객체를 생성하는 것을 확인할 수 있습니다.

2. 애플리케이션 종료 시 shutdown hook 등록 여부 확인 및 설정

    ```java
    if (this.properties.isRegisterShutdownHook()) {
        shutdownHook.enableShutdownHookAddition();
    }
    ```

    Spring Boot 애플리케이션이 종료될 때 실행할 `shutdown hook`을 등록할지 확인합니다. `shutdown hook`은 애플리케이션이 정상 종료될 때 실행할 정리(cleanup) 작업을 정의합니다.

    이미 `SpringApplication.run(ReservationServiceApplication.class, args);` 이구문에서 `SpringApplication` 에서 static final 필드로 생성하고 있기에 강제로 막지않는한 true입니다.

3. 부트스트랩 컨텍스트 생성

    ```java
    DefaultBootstrapContext bootstrapContext = this.createBootstrapContext();
    ```

    부트스트랩 컨텍스트는 애플리케이션이 실행되기 전에 필요한 객체들을 준비하는 역할을 합니다.

    초기 설정 및 외부 시스템과의 연결을 수행할 수 있습니다.

    코드로 보자면 아래와 같이 for loop를 돌면서 initialize를 합니다.

    ```java
    private DefaultBootstrapContext createBootstrapContext() {
        DefaultBootstrapContext bootstrapContext = new DefaultBootstrapContext();
        this.bootstrapRegistryInitializers.forEach((initializer) -> {
            initializer.initialize(bootstrapContext);
        });
        return bootstrapContext;
    }
    ```

4. AWT 환경에서 headless 모드 설정
    ```java
    this.configureHeadlessProperty();
    ```
    서버 환경에서 GUI가 필요 없는 경우 `headless` 모드를 활성화합니다. AWT 관련 설정이 필요 없는 서버 환경에서는 UI 리소스를 사용하지 않도록 설정합니다.

    ```java
    private void configureHeadlessProperty() {
        System.setProperty("java.awt.headless", System.getProperty("java.awt.headless", Boolean.toString(this.headless)));
    }
    ```

    `java.awt.headless`값이 없으면 true로 설정됩니다.

5. 애플리케이션 실행 리스너(SpringApplicationRunListeners) 생성 및 실행 시작 알림

    ```java
    SpringApplicationRunListeners listeners = this.getRunListeners(args);
    listeners.starting(bootstrapContext, this.mainApplicationClass);
    ```

    Spring Boot 실행 중 특정 이벤트를 처리할 수 있도록 `SpringApplicationRunListeners`를 생성합니다.

    ```java
    private SpringApplicationRunListeners getRunListeners(String[] args) {
        SpringFactoriesLoader.ArgumentResolver argumentResolver = ArgumentResolver.of(SpringApplication.class, this);
        argumentResolver = argumentResolver.and(String[].class, args);
        List<SpringApplicationRunListener> listeners = this.getSpringFactoriesInstances(SpringApplicationRunListener.class, argumentResolver);
        SpringApplicationHook hook = (SpringApplicationHook)applicationHook.get();
        SpringApplicationRunListener hookListener = hook != null ? hook.getRunListener(this) : null;
        if (hookListener != null) {
            listeners = new ArrayList((Collection)listeners);
            ((List)listeners).add(hookListener);
        }

        return new SpringApplicationRunListeners(logger, (List)listeners, this.applicationStartup);
    }
    ```

    `starting` 이벤트를 트리거하여 실행이 시작되었음을 알립니다.

    ```java
    void starting(ConfigurableBootstrapContext bootstrapContext, Class<?> mainApplicationClass) {
        this.doWithListeners("spring.boot.application.starting", (listener) -> {
            listener.starting(bootstrapContext);
        }, (step) -> {
            if (mainApplicationClass != null) {
                step.tag("mainApplicationClass", mainApplicationClass.getName());
            }

        });
    }
    ```

6. 애플리케이션 인자를 객체(ApplicationArguments)로 변환

    ```java
    ApplicationArguments applicationArguments = new DefaultApplicationArguments(args);
    ```

    명령줄 인자(`args`)를 `ApplicationArguments` 객체로 변환하여 관리합니다. 이를 통해 애플리케이션이 실행될 때 전달된 파라미터를 편리하게 사용할 수 있습니다.

7. 환경 정보(ConfigurableEnvironment) 설정 및 리스너 호출

    ```java
    ConfigurableEnvironment environment = this.prepareEnvironment(listeners, bootstrapContext, applicationArguments);
    ```

    실행 환경(`Environment`)을 구성합니다. 설정 파일(application.properties, application.yml) 등을 로드합니다.

    ```java
    private ConfigurableEnvironment prepareEnvironment(SpringApplicationRunListeners listeners, DefaultBootstrapContext bootstrapContext, ApplicationArguments applicationArguments) {
        ConfigurableEnvironment environment = this.getOrCreateEnvironment();
        this.configureEnvironment(environment, applicationArguments.getSourceArgs());
        ConfigurationPropertySources.attach(environment);
        listeners.environmentPrepared(bootstrapContext, environment);
        ApplicationInfoPropertySource.moveToEnd(environment);
        DefaultPropertiesPropertySource.moveToEnd(environment);
        Assert.state(!environment.containsProperty("spring.main.environment-prefix"), "Environment prefix cannot be set via properties.");
        this.bindToSpringApplication(environment);
        if (!this.isCustomEnvironment) {
            EnvironmentConverter environmentConverter = new EnvironmentConverter(this.getClassLoader());
            environment = environmentConverter.convertEnvironmentIfNecessary(environment, this.deduceEnvironmentClass());
        }

        ConfigurationPropertySources.attach(environment);
        return environment;
    }
    ```

    그리고 여기서 보면 `listeners.environmentPrepared(bootstrapContext, environment);`를 호출하여 환경 설정 완료를 알립니다.

    ```java
    void environmentPrepared(ConfigurableBootstrapContext bootstrapContext, ConfigurableEnvironment environment) {
        this.doWithListeners("spring.boot.application.environment-prepared", (listener) -> {
            listener.environmentPrepared(bootstrapContext, environment);
        });
    }
    ```

8. 배너 출력 (Spring Boot 로고 등)

    ```java
    Banner printedBanner = this.printBanner(environment);
    ```

    Spring Boot 애플리케이션 실행 시 배너(Banner)를 출력합니다. 배너는 `banner.txt` 파일을 이용하여 커스텀할 수도 있습니다.

    ```java
    private Banner printBanner(ConfigurableEnvironment environment) {
        if (this.properties.getBannerMode(environment) == Mode.OFF) {
            return null;
        } else {
            ResourceLoader resourceLoader = this.resourceLoader != null ? this.resourceLoader : new DefaultResourceLoader((ClassLoader)null);
            SpringApplicationBannerPrinter bannerPrinter = new SpringApplicationBannerPrinter((ResourceLoader)resourceLoader, this.banner);
            return this.properties.getBannerMode(environment) == Mode.LOG ? bannerPrinter.print(environment, this.mainApplicationClass, logger) : bannerPrinter.print(environment, this.mainApplicationClass, System.out);
        }
    }
    ```

    `Banner.print()`를 호출하며,

    ```java
    Banner print(Environment environment, Class<?> sourceClass, PrintStream out) {
        Banner banner = this.getBanner(environment);
        banner.printBanner(environment, sourceClass, out);
        return new PrintedBanner(banner, sourceClass);
    }
    ```

    뜯어보면 `SpringBootBanner.printBanner()`가보면 우리가 아는 스프링 로고를 띄우는 것을 볼 수 있습니다.

    ```java
    public void printBanner(Environment environment, Class<?> sourceClass, PrintStream printStream) {
        printStream.println();
        printStream.println("  .   ____          _            __ _ _\n /\\\\ / ___'_ __ _ _(_)_ __  __ _ \\ \\ \\ \\\n( ( )\\___ | '_ | '_| | '_ \\/ _` | \\ \\ \\ \\\n \\\\/  ___)| |_)| | | | | || (_| |  ) ) ) )\n  '  |____| .__|_| |_|_| |_\\__, | / / / /\n =========|_|==============|___/=/_/_/_/\n");
        String version = String.format(" (v%s)", SpringBootVersion.getVersion());
        String padding = " ".repeat(Math.max(0, 42 - (version.length() + " :: Spring Boot :: ".length())));
        printStream.println(AnsiOutput.toString(new Object[]{AnsiColor.GREEN, " :: Spring Boot :: ", AnsiColor.DEFAULT, padding, AnsiStyle.FAINT, version}));
        printStream.println();
    }
    ```

    로그로 확인해보면 아래처럼 print됩니다.

    ```java
    .   ____          _            __ _ _
    /\\ / ___'_ __ _ _(_)_ __  __ _ \ \ \ \
    ( ( )\___ | '_ | '_| | '_ \/ _` | \ \ \ \
    \\/  ___)| |_)| | | | | || (_| |  ) ) ) )
    '  |____| .__|_| |_|_| |_\__, | / / / /
    =========|_|==============|___/=/_/_/_/

    :: Spring Boot ::                (v3.4.3)
    ```

9. 애플리케이션 컨텍스트 생성

    ```java
    context = this.createApplicationContext();
    context.setApplicationStartup(this.applicationStartup);
    ```

    WebApplicationType(SERVLET, REACTIVE)에 따라서 `ApplicationContext`(Spring 컨텍스트)를 생성합니다. `ApplicationContext`는 Bean을 관리하고 DI(Dependency Injection)를 수행하는 역할을 합니다.

10. 컨텍스트 준비 단계 (빈 등록, 환경 설정, 리스너 실행)

    ```java
    this.prepareContext(bootstrapContext, context, environment, listeners, applicationArguments, printedBanner);
    ```

    컨텍스트를 초기화하기 전에 필요한 설정을 수행합니다. Bean 정의, 리스너 등록, 환경 변수 적용 등을 수행합니다.

    ```java
    private void prepareContext(DefaultBootstrapContext bootstrapContext, ConfigurableApplicationContext context, ConfigurableEnvironment environment, SpringApplicationRunListeners listeners, ApplicationArguments applicationArguments, Banner printedBanner) {
        context.setEnvironment(environment);
        this.postProcessApplicationContext(context);
        this.addAotGeneratedInitializerIfNecessary(this.initializers);
        this.applyInitializers(context);
        listeners.contextPrepared(context);
        bootstrapContext.close(context);
        if (this.properties.isLogStartupInfo()) {
            this.logStartupInfo(context.getParent() == null);
            this.logStartupInfo(context);
            this.logStartupProfileInfo(context);
        }

        ConfigurableListableBeanFactory beanFactory = context.getBeanFactory();
        beanFactory.registerSingleton("springApplicationArguments", applicationArguments);
        if (printedBanner != null) {
            beanFactory.registerSingleton("springBootBanner", printedBanner);
        }

        if (beanFactory instanceof AbstractAutowireCapableBeanFactory autowireCapableBeanFactory) {
            autowireCapableBeanFactory.setAllowCircularReferences(this.properties.isAllowCircularReferences());
            if (beanFactory instanceof DefaultListableBeanFactory listableBeanFactory) {
                listableBeanFactory.setAllowBeanDefinitionOverriding(this.properties.isAllowBeanDefinitionOverriding());
            }
        }

        if (this.properties.isLazyInitialization()) {
            context.addBeanFactoryPostProcessor(new LazyInitializationBeanFactoryPostProcessor());
        }

        if (this.properties.isKeepAlive()) {
            context.addApplicationListener(new KeepAlive());
        }

        context.addBeanFactoryPostProcessor(new PropertySourceOrderingBeanFactoryPostProcessor(context));
        if (!AotDetector.useGeneratedArtifacts()) {
            Set<Object> sources = this.getAllSources();
            Assert.notEmpty(sources, "Sources must not be empty");
            this.load(context, sources.toArray(new Object[0]));
        }

        listeners.contextLoaded(context);
    }
    ```

11. 애플리케이션 컨텍스트 초기화 및 빈 로드

    ```java
    this.refreshContext(context);
    ```

    `ApplicationContext`를 갱신(refresh)하여 빈(Bean)들을 초기화하고 애플리케이션을 사용할 준비를 합니다.

    ```java
    private void prepareContext(DefaultBootstrapContext bootstrapContext, ConfigurableApplicationContext context, ConfigurableEnvironment environment, SpringApplicationRunListeners listeners, ApplicationArguments applicationArguments, Banner printedBanner) {
        context.setEnvironment(environment);
        this.postProcessApplicationContext(context);
        this.addAotGeneratedInitializerIfNecessary(this.initializers);
        this.applyInitializers(context);
        listeners.contextPrepared(context);
        bootstrapContext.close(context);
        if (this.properties.isLogStartupInfo()) {
            this.logStartupInfo(context.getParent() == null);
            this.logStartupInfo(context);
            this.logStartupProfileInfo(context);
        }

        ConfigurableListableBeanFactory beanFactory = context.getBeanFactory();
        beanFactory.registerSingleton("springApplicationArguments", applicationArguments);
        if (printedBanner != null) {
            beanFactory.registerSingleton("springBootBanner", printedBanner);
        }

        if (beanFactory instanceof AbstractAutowireCapableBeanFactory autowireCapableBeanFactory) {
            autowireCapableBeanFactory.setAllowCircularReferences(this.properties.isAllowCircularReferences());
            if (beanFactory instanceof DefaultListableBeanFactory listableBeanFactory) {
                listableBeanFactory.setAllowBeanDefinitionOverriding(this.properties.isAllowBeanDefinitionOverriding());
            }
        }

        if (this.properties.isLazyInitialization()) {
            context.addBeanFactoryPostProcessor(new LazyInitializationBeanFactoryPostProcessor());
        }

        if (this.properties.isKeepAlive()) {
            context.addApplicationListener(new KeepAlive());
        }

        context.addBeanFactoryPostProcessor(new PropertySourceOrderingBeanFactoryPostProcessor(context));
        if (!AotDetector.useGeneratedArtifacts()) {
            Set<Object> sources = this.getAllSources();
            Assert.notEmpty(sources, "Sources must not be empty");
            this.load(context, sources.toArray(new Object[0]));
        }

        listeners.contextLoaded(context);
    }
    ```

12. 컨텍스트 초기화 후 추가적인 작업 수행 (커스텀 로직 등)

    ```java
    this.afterRefresh(context, applicationArguments);
    ```
    애플리케이션 초기화 후 수행해야 할 추가적인 작업을 처리합니다. 여기서도 WebApplicationType(SERVLET, REACTIVE)에 따라서 ServletWebServerApplicationContext 혹은 ReactiveWebServerApplicationContextd의 refresh를 호출합니다.

    ```java
    private void refreshContext(ConfigurableApplicationContext context) {
        if (this.properties.isRegisterShutdownHook()) {
            shutdownHook.registerApplicationContext(context);
        }

        this.refresh(context);
    }
    ```

    사용자 정의 초기화 로직을 실행할 수 있습니다.

13. 애플리케이션 실행 완료 시간 기록

    ```java
    startup.started();
    ```

    맨 처음에 기록한 시간에서 시작시간에서 현재 시간을 빼서 실행시간을 측정합니다.

    ```java
    final Duration started() {
        long now = System.currentTimeMillis();
        this.timeTakenToStarted = Duration.ofMillis(now - this.startTime());
        return this.timeTakenToStarted;
    }
    ```

14. 애플리케이션 실행 정보 로깅

    ```java
    if (this.properties.isLogStartupInfo()) {
        (new StartupInfoLogger(this.mainApplicationClass, environment)).logStarted(this.getApplicationLog(), startup);
    }
    ```

    실행 정보를 로깅하여 애플리케이션 시작 시점의 정보를 기록합니다. `logStartupInfo`는 기본적으로 true입니다.

15. 애플리케이션이 완전히 시작됨을 리스너에 알림

    ```java
    listeners.started(context, startup.timeTakenToStarted());
    ```

    애플리케이션이 완전히 시작되었음을 `listeners`에 알립니다.

    ```java
    void started(ConfigurableApplicationContext context, Duration timeTaken) {
        this.doWithListeners("spring.boot.application.started", (listener) -> {
            listener.started(context, timeTaken);
        });
    }
    ```

16. ApplicationRunner 및 CommandLineRunner 실행

    ```java
    this.callRunners(context, applicationArguments);
    ```

    `ApplicationRunner` 및 `CommandLineRunner`를 실행하여 추가적인 초기화 작업을 수행할 수 있습니다.

    ```java
    private void callRunners(ConfigurableApplicationContext context, ApplicationArguments args) {
        ConfigurableListableBeanFactory beanFactory = context.getBeanFactory();
        String[] beanNames = beanFactory.getBeanNamesForType(Runner.class);
        Map<Runner, String> instancesToBeanNames = new IdentityHashMap();
        String[] var6 = beanNames;
        int var7 = beanNames.length;

        for(int var8 = 0; var8 < var7; ++var8) {
            String beanName = var6[var8];
            instancesToBeanNames.put((Runner)beanFactory.getBean(beanName, Runner.class), beanName);
        }

        Comparator<Object> comparator = this.getOrderComparator(beanFactory).withSourceProvider(new FactoryAwareOrderSourceProvider(beanFactory, instancesToBeanNames));
        instancesToBeanNames.keySet().stream().sorted(comparator).forEach((runner) -> {
            this.callRunner(runner, args);
        });
    }
    ```

17. 애플리케이션 실행 상태 확인 및 완료 알림

    ```java
    if (context.isRunning()) {
        listeners.ready(context, startup.ready());
    }
    ```

    `ApplicationContext`가 정상적으로 실행되고 있는지 확인하고, 실행이 완료되었음을 `listeners`에 알립니다. 여기서 `ApplicationReadyEvent`를 발생시킵니다.

    ```java
    void ready(ConfigurableApplicationContext context, Duration timeTaken) {
        this.doWithListeners("spring.boot.application.ready", (listener) -> {
            listener.ready(context, timeTaken);
        });
    }
    ```

18. 예외 발생 시 처리

    ```java
    catch (Throwable ex) {
        throw this.handleRunFailure(context, ex, listeners);
    }
    ```

    실행 중 예외가 발생하면 이를 적절히 처리하고 애플리케이션을 안전하게 종료하도록 합니다.

    ```java
    private RuntimeException handleRunFailure(ConfigurableApplicationContext context, Throwable exception, SpringApplicationRunListeners listeners) {
        if (exception instanceof AbandonedRunException abandonedRunException) {
            return abandonedRunException;
        } else {
            try {
                try {
                    this.handleExitCode(context, exception);
                    if (listeners != null) {
                        listeners.failed(context, exception);
                    }
                } finally {
                    this.reportFailure(this.getExceptionReporters(context), exception);
                    if (context != null) {
                        context.close();
                        shutdownHook.deregisterFailedApplicationContext(context);
                    }

                }
            } catch (Exception var9) {
                Exception ex = var9;
                logger.warn("Unable to close ApplicationContext", ex);
            }

            Object var10000;
            if (exception instanceof RuntimeException runtimeException) {
                var10000 = runtimeException;
            } else {
                var10000 = new IllegalStateException(exception);
            }

            return (RuntimeException)var10000;
        }
    }
    ```

## 결론

Spring Boot의 `run` 메서드는 애플리케이션이 실행되는 동안 다양한 단계를 거치며 필요한 설정을 수행하고, 실행 상태를 모니터링합니다. 이 과정에서 리스너를 활용하여 다양한 이벤트를 처리할 수 있으며, 예외 발생 시 적절한 대응이 가능합니다. 이러한 과정이 어떻게 일어나는지 알아두면 나중에 도움이 될 것 같아 정리하였습니다.
