---
title: Resilience4j
description: Resilience4j
author: ydj515
date: 2025-06-03 11:33:00 +0800
categories: [Resilience4j, java, kotlin, spring]
tags: [Resilience4j, java, kotlin, spring]
pin: true
math: true
mermaid: true
image:
  path: /assets/img/resilience4j/logo.png
  lqip: data:image/webp;base64,UklGRpoAAABXRUJQVlA4WAoAAAAQAAAADwAABwAAQUxQSDIAAAARL0AmbZurmr57yyIiqE8oiG0bejIYEQTgqiDA9vqnsUSI6H+oAERp2HZ65qP/VIAWAFZQOCBCAAAA8AEAnQEqEAAIAAVAfCWkAALp8sF8rgRgAP7o9FDvMCkMde9PK7euH5M1m6VWoDXf2FkP3BqV0ZYbO6NA/VFIAAAA
  alt: resilience4j
---

## Resilience4j

[Resilience4j](https://resilience4j.readme.io/)는 Java 8 및 함수형 프로그래밍 스타일을 위한 경량화된 **fault tolerance** 라이브러리입니다. Netflix의 Hystrix를 대체하기 위해 만들어졌으며, **Spring Boot**, **RxJava**, **Reactor** 등과 잘 통합됩니다.

고가용성을 요구하는 서비스에서는 일시적 장애나 외부 시스템 불안정에 대비한 방어적 설계가 필수적입니다. Resilience4j는 이런 요구사항을 충족하면서도 모듈 단위로 가볍게 적용할 수 있는 장점이 있습니다.

## 주요 모듈

> java17, springboot3.x기준으로 설명합니다. 전체 sample은 [github-sample](https://github.com/ydj515/blog-example/tree/main/resilience4j-example)를 참조해주세요.

### 1. CircuitBreaker(서킷브레이커)

> 대표 시나리오: 외부 API가 불안정할 때 서비스 전체 장애 확산 방지

![image.png](/assets/img/resilience4j/circuitbreaker.png)

- 실패율(예: HTTP 5xx 비율)이 일정 기준 이상으로 치솟으면 회로를 열어 해당 API 호출을 차단합니다.
- 일정 시간 후 Half-Open 상태로 전환되어 일부 요청을 시험삼아 보내고, 정상화되면 닫힙니다.
- 서비스 장애 확산을 방지하고, 장애 회복 시 자동으로 복원됩니다.
- 상태전이: `CLOSED(정상) → OPEN(차단) → HALF_OPEN(테스트) → CLOSED(복원)`
- bean 설정 예시:
  
  ```java
    @Bean
    public CircuitBreakerRegistry circuitBreakerRegistry(MeterRegistry meterRegistry) {
        CircuitBreakerConfig circuitBreakerConfig = CircuitBreakerConfig.custom()
                .slidingWindowType(CircuitBreakerConfig.SlidingWindowType.COUNT_BASED)  // 호출 수 기반으로 실패율 측정
                .failureRateThreshold(50)                                              // 실패율 50% 이상이면 차단
                .waitDurationInOpenState(Duration.ofSeconds(10))                        // OPEN 상태 유지 시간 (10초)
                .slidingWindowSize(10)                                                 // 모니터링할 호출 수 (10개)
                .permittedNumberOfCallsInHalfOpenState(3)                               // HALF_OPEN 상태에서 허용할 호출 수 (3개)
                .minimumNumberOfCalls(5)                                               // 실패율 계산을 시작할 최소 호출 수 (5개)
                .recordExceptions(Throwable.class)                                      // 모든 예외를 실패로 간주
                .build();

        // 커스텀 config 기반 Registry 생성
        CircuitBreakerRegistry registry = CircuitBreakerRegistry.of(circuitBreakerConfig);

        // Micrometer 메트릭 연동 (Actuator + Prometheus 등과 연결 시 유용)
        TaggedCircuitBreakerMetrics.ofCircuitBreakerRegistry(registry).bindTo(meterRegistry);

        return registry;
    }

    @Bean
    public CircuitBreaker customCircuitBreaker(CircuitBreakerRegistry registry) {
        return registry.circuitBreaker("customBreaker");
    }
  ```

- 옵션:

  | 옵션                                  | 설명                                                        |
  | ------------------------------------- | ----------------------------------------------------------- |
  | slidingWindowType                     | 호출 횟수 기반(COUNT_BASED) 또는 시간 기반(TIME_BASED) 결정 |
  | failureRateThreshold                  | 서킷을 OPEN으로 만들 실패율 임계치 (%)                      |
  | waitDurationInOpenState               | OPEN 상태 유지 시간 후 HALF_OPEN으로 전환                   |
  | slidingWindowSize                     | 실패율 계산을 위해 모니터링할 호출 수(또는 시간)            |
  | permittedNumberOfCallsInHalfOpenState | HALF_OPEN 상태에서 허용할 호출 수(테스트용)                 |
  | minimumNumberOfCalls                  | 실패율 계산이 시작되기 위한 최소 호출 수                    |
  | recordExceptions                      | 실패로 간주할 예외 유형 설정                                |

### 2. RateLimiter(속도 제한)

> 대표 시나리오: 클라이언트의 과도한 요청 방지, API 호출 빈도 제한

- 일정 시간 동안 허용할 수 있는 호출 횟수를 정의합니다.
- 토큰 버킷 알고리즘 기반으로 동작하며, 정해진 속도 이상 요청이 들어오면 실패 또는 대기 처리됩니다.
- bean 설정 예시:

  ```java
    @Bean
    public RateLimiterRegistry rateLimiterRegistry() {
        RateLimiterConfig config = RateLimiterConfig.custom()
                .limitForPeriod(5)                                // 주기(10초)당 최대 호출 횟수 (5회)
                .limitRefreshPeriod(Duration.ofSeconds(10))       // 주기 시간 (10초)
                .timeoutDuration(Duration.ofMillis(500))          // 초과 시 최대 대기 시간 (500ms)
                .build();

        return RateLimiterRegistry.of(config);
    }

    @Bean
    public RateLimiter customRateLimiter(RateLimiterRegistry registry) {
        return registry.rateLimiter("customLimiter");
    }
  ```

### 3. Retry(재시도)

> 대표 시나리오: 일시적 네트워크 오류, 타임아웃 등 회복 가능한 오류 재시도

- 실패 시 즉시 실패하지 않고 재시도를 시도합니다.
- 고정 지연(fixed delay), 지수 백오프(exponential backoff), 무작위 지연(jitter) 등의 전략을 지원합니다.
- 재시도 횟수, 대기 시간 등을 설정할 수 있어 유연하게 대응 가능합니다.
- bean 설정 예시:

  ```java
    @Bean
    public RetryRegistry retryRegistry() {
        RetryConfig config = RetryConfig.custom()
                .maxAttempts(3)                               // 최대 3회 시도 (최초 + 재시도 2회)
                .waitDuration(Duration.ofMillis(500))         // 각 재시도 간 대기 시간 (500ms)
    //          .retryExceptions(RuntimeException.class)      // (선택) 특정 예외만 재시도하도록 설정 가능
                .retryExceptions(Throwable.class)             // 모든 Throwable에 대해 재시도 수행
                .build();

        return RetryRegistry.of(config);
    }

    @Bean
    public Retry customRetry(RetryRegistry registry) {
        return registry.retry("customRetry");
    }
  ```

### 4. Bulkhead(격벽)

> 대표 시나리오: 하나의 기능 장애가 전체 시스템에 영향을 주지 않도록 격리

이 패턴은 배의 격실(선체 구역)에서 유래되었으며, 장애의 전파를 차단하는 데 유용합니다.

- ThreadPoolBulkhead: 별도의 스레드 풀에서 작업을 실행하여 메인 워크플로 차단 방지
- SemaphoreBulkhead: 동시에 실행 가능한 호출 수를 제한
- bean 설정 예시:

  ```java
    @Bean
    public ThreadPoolBulkheadRegistry threadPoolBulkheadRegistry() {
        ThreadPoolBulkheadConfig config = ThreadPoolBulkheadConfig.custom()
                .coreThreadPoolSize(5)               // 스레드 풀의 핵심 스레드 수
                .maxThreadPoolSize(10)               // 최대 스레드 풀 크기
                .queueCapacity(20)                   // 대기열 크기
                .build();

        return ThreadPoolBulkheadRegistry.of(config);
    }

    @Bean
    public ThreadPoolBulkhead customThreadPoolBulkhead(ThreadPoolBulkheadRegistry registry) {
        return registry.bulkhead("customThreadPoolBulkhead");
    }

    @Bean
    public BulkheadRegistry semaphoreBulkheadRegistry() {
        BulkheadConfig config = BulkheadConfig.custom()
                .maxConcurrentCalls(5)              // 동시에 실행 가능한 최대 호출 수
                .maxWaitDuration(Duration.ofMillis(100))  // 대기 최대 시간
                .build();

        return BulkheadRegistry.of(config);
    }

    @Bean
    public Bulkhead customSemaphoreBulkhead(BulkheadRegistry registry) {
        return registry.bulkhead("customSemaphoreBulkhead");
    }
  ```

### 5. TimeLimiter(시간제한)

> 대표 시나리오: 너무 오래 걸리는 작업을 빠르게 실패 처리

- 실행 시간 제한을 설정하여, 일정 시간 내에 응답이 없으면 실패로 간주하여 빠른 실패 처리 및 fallback을 유도하여 서비스 반응성 개선 및 사용자 경험 향상에 기여합니다.
- `CompletableFuture`와 함께 사용됩니다.
- bean 설정 예시:

  ```java
    @Bean
    public TimeLimiterRegistry timeLimiterRegistry() {
        TimeLimiterConfig config = TimeLimiterConfig.custom()
                .timeoutDuration(Duration.ofSeconds(2))       // 타임아웃 제한 시간 (2초)
                .cancelRunningFuture(true)                    // 타임아웃 시 실행 중인 작업을 취소
                .build();

        return TimeLimiterRegistry.of(config);
    }

    @Bean
    public TimeLimiter customTimeLimiter(TimeLimiterRegistry registry) {
        return registry.timeLimiter("customLimiter");
    }
  ```

### 6. Cache(캐시)

> 대표 시나리오: 동일한 외부 호출 반복 방지

- 동일한 입력에 대해 호출 결과를 캐시하여 불필요한 중복 호출을 줄입니다.
- Caffeine 기반으로 작동하며 TTL(Time-to-live), 최대 크기 등 정책을 세부 조정할 수 있습니다.
- bean 설정 예시:

  ```java
    @Bean
    public CacheRegistry cacheRegistry() {
        CacheConfig<Object, Object> cacheConfig = CacheConfig.custom()
                .ttl(Duration.ofMinutes(5))           // 캐시 항목 TTL(5분)
                .maxSize(1000)                         // 최대 캐시 크기
                .build();

        return CacheRegistry.of(cacheConfig);
    }

    @Bean
    public Cache<Object, Object> customCache(CacheRegistry registry) {
        return registry.cache("customCache");
    }
  ```


### 7. Fallback(대체처리)

> 대표 시나리오: 호출 실패 시 대체 응답 제공

- 장애 발생 시 미리 준비된 응답(기본값, 캐시 데이터 등)을 반환하거나 다른 비상 플랜으로 연결합니다.
- `Try`, `Either`, `Optional` 등을 활용한 함수형 스타일로 구현할 수 있습니다.
- 예시 코드:
  
  ```java
  public String callExternalApiWithFallback() {
      return Try.of(() -> externalApi.call())
                .recover(throwable -> {
                    log.warn("외부 API 실패, fallback 처리: {}", throwable.getMessage());
                    return "기본 응답";
                })
                .get();
  }
  ```
  
  또는 Resilience4j의 데코레이터 방식으로도 사용 가능합니다:

  ```java
    Supplier<String> decoratedSupplier = Decorators.ofSupplier(() -> externalApi.call())
        .withCircuitBreaker(circuitBreaker)
        .withFallback(throwable -> {
            log.warn("Fallback triggered due to: {}", throwable.toString());
            return "Fallback 응답";
        })
        .decorate();

    String result = decoratedSupplier.get();
  ```
  

## 모듈 조합 전략

```java
Supplier<String> supplier = () -> externalService.call();

Supplier<String> decorated = Decorators.ofSupplier(supplier)
    .withCircuitBreaker(circuitBreaker)
    .withRateLimiter(rateLimiter)
    .withRetry(retry)
    .withFallback(ex -> "기본 응답")
    .decorate();
```

### 실제 예시

Retry → RateLimiter → CircuitBreaker → TimeLimiter → 실제 작업 순으로 구성하였습니다. 우선 모듈들의 설명을 하자면 아래와 같습니다.

- Retry: 실패할 수 있는 요청을 다시 시도할 수 있도록 제일 바깥에서 감쌉니다.
- RateLimiter: 전체 요청 빈도를 제한
- CircuitBreaker: 지속 실패 감지 후 차단
- TimeLimiter: 요청의 최대 실행 시간 제어

이러한 순서로 구성한 이유는 다음과 같습니다.

우선 Retry를 통해 일시적인 장애에 대해 회복을 시도하고, 이후 RateLimiter로 요청 빈도를 제어하여 시스템의 과부하를 방지합니다. 그럼에도 문제가 지속될 경우 CircuitBreaker를 적용해 장애가 확산되지 않도록 빠르게 차단하며, 마지막으로 TimeLimiter를 통해 응답 지연 시 빠르게 실패 처리를 유도해 서비스 안정성과 사용자 경험을 함께 보장하도록 구성했습니다.

```java
@Service
@RequiredArgsConstructor
public class Resilience4jService {

    private final CircuitBreaker circuitBreaker;
    private final TimeLimiter timeLimiter;
    private final RateLimiter rateLimiter;
    private final Retry retry;

    public CompletableFuture<String> resilientCall() {
        ScheduledExecutorService timeLimiterScheduler = Executors.newScheduledThreadPool(1);
        ScheduledExecutorService retryScheduler = Executors.newScheduledThreadPool(1);

        Supplier<CompletionStage<String>> originalSupplier = () ->
                CompletableFuture.supplyAsync(() -> {
                    try {
                        Thread.sleep(3000); // 타임아웃 유도
                        return "정상 응답";
                    } catch (InterruptedException e) {
                        throw new RuntimeException("중단됨", e);
                    }
                });

        // TimeLimiter
        Supplier<CompletionStage<String>> timeLimited =
                TimeLimiter.decorateCompletionStage(timeLimiter, timeLimiterScheduler, originalSupplier);

        // CircuitBreaker
        Supplier<CompletionStage<String>> cbWrapped =
                CircuitBreaker.decorateCompletionStage(circuitBreaker, timeLimited);

        // RateLimiter
        Supplier<CompletionStage<String>> rlWrapped =
                RateLimiter.decorateCompletionStage(rateLimiter, cbWrapped);

        // Retry (마지막으로 wrapping)
        Supplier<CompletionStage<String>> retryWrapped =
                Retry.decorateCompletionStage(retry, retryScheduler, rlWrapped);

        // 실행 및 fallback 처리
        return retryWrapped.get()
                .toCompletableFuture()
                .exceptionally(ex -> "fallback: " + ex.getClass().getSimpleName()
                        + ", cb=" + circuitBreaker.getState()
                        + ", rl=" + rateLimiter.getMetrics().getAvailablePermissions()
                        + ", retry=" + retry.getMetrics().getNumberOfTotalCalls())
                .whenComplete((r, ex) -> {
                    timeLimiterScheduler.shutdown();
                    retryScheduler.shutdown();
                });
    }
}
```


## Spring Boot 통합 예시

- `application.yml` : `application.yml` 파일을 통해서 적용 가능합니다.

  ```yml
  resilience4j:
    circuitbreaker:
      instances:
        backendA:
          slidingWindowSize: 50
          failureRateThreshold: 50
          waitDurationInOpenState: 10s

    retry:
      instances:
        backendA:
          maxAttempts: 3
          waitDuration: 500ms
  ```

- `annotation` : `@CircuitBreaker`, `@Retry`, `@TimeLimiter` 등의 어노테이션으로 간단하게 적용 가능합니다.

  ```java
  @CircuitBreaker(name = "backendA", fallbackMethod = "fallback")
  public String callExternalService() {
      return externalService.call();
  }
  ```


## 모니터링

- Spring Boot Actuator로 `/actuator/circuitbreakers` 등 제공
- Micrometer → Prometheus → Grafana로 대시보드 구축 가능

## 정리

| 항목     | 내용                                |
| -------- | ----------------------------------- |
| 경량     | Hystrix 대비 메모리 적고 빠름       |
| 모듈화   | 원하는 기능만 선택적으로 사용       |
| Java 8+  | 함수형 스타일과 람다식에 적합       |
| 통합성   | Spring, Reactor, RxJava와 통합 용이 |
| 모니터링 | 메트릭 노출 및 시각화 지원          |


[출처]
- https://resilience4j.readme.io/
- https://github.com/resilience4j/resilience4j
