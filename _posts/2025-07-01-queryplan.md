---
title: query explan을 로그로 남겨보자
description: Spring Boot에서 실행계획(EXPLAIN PLAN) log로 남기기
author: ydj515
date: 2025-07-01 11:33:00 +0800
categories: [query plan, springboot]
tags: [query plan, springboot]
pin: true
math: true
mermaid: true
image:
  path: /assets/img/spring/logo.png
  lqip: data:image/webp;base64,UklGRpoAAABXRUJQVlA4WAoAAAAQAAAADwAABwAAQUxQSDIAAAARL0AmbZurmr57yyIiqE8oiG0bejIYEQTgqiDA9vqnsUSI6H+oAERp2HZ65qP/VIAWAFZQOCBCAAAA8AEAnQEqEAAIAAVAfCWkAALp8sF8rgRgAP7o9FDvMCkMde9PK7euH5M1m6VWoDXf2FkP3BqV0ZYbO6NA/VFIAAAA
  alt: redis
---

## Spring Boot에서 dataproxy를 활용한 query explan을 로그로 남겨보자

JPA로 개발을 하다 보면, 어느 순간부터 이런 고민이 생깁니다.

> "아니 분명히 쿼리는 잘 나가고 있는데... 왜 이렇게 느리지?"

Spring Data JPA는 편리한 추상화 덕분에 쿼리를 쉽게 작성할 수 있습니다. 하지만 쿼리를 직접 작성하지 않기 때문에, 성능 문제가 발생했을 때 어디서 병목이 생기는지 찾기 어려웠던 기억이 납니다.

특히 다음과 같은 상황이 주로 빈번히 발생했습니다.

- 쿼리는 실행되지만 너무 느리다
- 실행계획을 보려고 콘솔에 쿼리 복붙 + 파라미터 대입 + EXPLAIN 실행...
- 귀찮고 번거로워서 결국 로그만 보고 넘긴다

그래서 이번 글에서는 `Spring Boot + Datasource-Proxy`를 이용해, 느린 쿼리를 자동으로 감지하고, `실행계획(EXPLAIN PLAN)` 까지 자동으로 로그에 남기는 방법을 소개하려고 합니다.




## query plan 로그 남기기

> java17, springboot3.x기준으로 설명합니다. 전체 sample은 [github-sample](https://github.com/ydj515/sample-repository-example/tree/main/proxy-query-plan-example)를 참조해주세요.

우선 이번에 사용한 **[Datasource proxy](https://github.com/jdbc-observations/datasource-proxy)**에 대해 설명하려고 합니다.

## Datasource-Proxy란?
Datasource-Proxy는 JDBC의 DataSource를 wrapping 해서 SQL 실행 정보를 가로채고, 로깅하거나 커스터마이징할 수 있게 도와주는 라이브러리입니다.

쉽게 말해, JPA나 MyBatis, JDBC 템플릿 등에서 발생하는 모든 쿼리 실행 흐름을 감시하고 가로챌 수 있는 인터셉터를 제공해줍니다.

아래의 주요 기능을 제공합니다.
- SQL 로그 출력 (? 파라미터 바인딩 포함)
- 쿼리 실행 시간 측정
- 커스텀 로깅 리스너 작성

## Datasource-Proxy 사용 이유
JPA는 기본적으로 SQL을 추상화하고, Hibernate가 내부적으로 쿼리를 실행합니다. 따라서 다음과 같은 한계가 있습니다.

| 문제 상황                                       | 한계                                          |
| ----------------------------------------------- | --------------------------------------------- |
| 느린 쿼리를 식별하고 싶다                       | Hibernate SQL 로그만으론 부족함 (? 값 미포함) |
| 바인딩된 SQL로 실행 계획(EXPLAIN) 실행하고 싶다 | JPA 단에서 파라미터를 포함한 쿼리 알 수 없음  |
| 쿼리 실행 시간을 기준으로 후처리 하고 싶다      | Hibernate 자체 기능만으로는 불가능            |

물론 Hibernate의 show_sql, format_sql, 그리고 Spring AOP 등을 조합해 유사한 기능을 수행할 수 있습니다. 하지만 그 경우에도 다음과 같은 복잡한 문제가 남습니다.

- SQL 로그에는 ?만 찍히고 실제 바인딩 값은 따로 봐야 한다
- 실행 시간 측정, 로그 출력, 쿼리 분석 기능이 서로 분리되어 유지보수가 어려움
- EXPLAIN을 실행하려면 로그를 복사해서 수동으로 실행해야 함

이런 문제를 해결하기 위해 Datasource-Proxy를 사용하면, 실제 DB에 전달되는 쿼리와 바인딩된 파라미터, 실행 시간 등 핵심 정보를 모두 얻을 수 있게 됩니다.

그래서 저는 Datasource-Proxy를 선택했습니다. 이 라이브러리를 사용한다면 

- 쿼리 실행 전/후 정보를 가로채서 바인딩 포함 SQL 생성
- 느린 쿼리를 감지하고 EXPLAIN 실행까지 자동화
- 별도 로직 없이 단일 리스너(QueryExecutionListener)로 구현 가능

의 기능을 구현하기 용이하였고, JPA의 추상화를 유지하면서도 로우레벨에 가까운 분석 도구를 손쉽게 확보할 수 있기 때문입니다.

## 적용기

우선 의존성에 Datasource-Proxy를 추가해줍니다.

- build.gradle.kts

```kotlin
implementation("net.ttddyy:datasource-proxy:1.9")
```

그리고 application.yml은 보통의 JPA 사용시와 다르지 않게 설정합니다. 예제에서는 postgres15를 사용하였습니다.

- application.yml

```yml
spring:
  application:
  name: proxy-query-plan-example
  datasource:
    url: jdbc:postgresql://localhost:5432/test
    username: test
    password: test
    driver-class-name: org.postgresql.Driver
  jpa:
    hibernate:
      ddl-auto: create-drop
    show-sql: true
    properties:
      hibernate:
        format_sql: true
        dialect: org.hibernate.dialect.PostgreSQLDialect
```

그리고 Datasource-Proxy를 적용하기 위한 @Configuration 클래스를 정의합니다. 핵심은 원본 DataSource를 유지하면서 proxy를 추가로 감싸는 구조입니다.

- DataSourceProxyConfig.java

```java
@Configuration
public class DataSourceProxyConfig {

    @Bean
    @Primary
    @DependsOn("dataSourceUnproxied") // 원래 DataSource보다 나중에 초기화되도록
    public DataSource dataSource(DataSource dataSourceUnproxied) {
        // Proxy wrapping
        ProxyDataSource proxyDataSource = new ProxyDataSourceBuilder()
                .dataSource(dataSourceUnproxied)
                .listener(new SlowQueryExplainListener(0, dataSourceUnproxied))
                .name("DS-Proxy")
                .logQueryBySlf4j()
                .build();
        return proxyDataSource;
    }

    @Bean
    public DataSource dataSourceUnproxied(
            @Value("${spring.datasource.url}") String url,
            @Value("${spring.datasource.username}") String username,
            @Value("${spring.datasource.password}") String password
    ) {
        HikariDataSource hikari = new HikariDataSource();
        hikari.setJdbcUrl(url);
        hikari.setUsername(username);
        hikari.setPassword(password);
        return hikari;
    }
}
```

- `dataSourceUnproxied` : HikariCP를 기반으로 하는 원래의 DataSource입니다. Spring Boot의 설정(spring.datasource.*)에서 값을 읽어와 직접 생성합니다.
- `dataSource` (Proxy) : ProxyDataSourceBuilder를 이용해 위 dataSourceUnproxied를 감싼 프록시입니다. 쿼리 실행 정보를 가로채고, 실행 시간 체크 및 EXPLAIN 로그를 출력합니다.
- `@Primary` : Spring이 DataSource를 자동 주입할 때 proxy된 버전을 우선 사용하도록 지정합니다.
- `@DependsOn` : dataSourceUnproxied가 먼저 초기화되도록 순서를 명시해 Spring의 의존성 주입 충돌을 방지합니다.

Spring Boot에서는 기본적으로 DataSource를 하나만 생성합니다. 그렇기에, 원본 DataSource를 유지하면서 proxy를 감싸야 하므로 dataSourceUnproxied를 별도로 정의하고, 이를 감싸 dataSource라는 proxy를 만듭니다.

이렇게 proxy형태로 감싸게 하면 필요한 경우 원본 DataSource도 직접 주입받아 사용할 수 있습니다. (@Qualifier("dataSourceUnproxied"))

그리고 `SlowQueryExplainListener`를 정의합니다. 이 리스너는 느린 쿼리를 감지하고, 해당 쿼리에 대해 실행 계획(EXPLAIN ANALYZE)을 출력해주는 역할을 합니다.

- SlowQueryExplainListener.java

```java
public class SlowQueryExplainListener implements QueryExecutionListener {

    private final long thresholdMs;
    private final DataSource dataSource;

    public SlowQueryExplainListener(long thresholdMs, DataSource dataSource) {
        this.thresholdMs = thresholdMs;
        this.dataSource = dataSource;
    }

    @Override
    public void beforeQuery(ExecutionInfo executionInfo, List<QueryInfo> list) {
        // 필요시 로깅 가능
    }

    @Override
    public void afterQuery(ExecutionInfo executionInfo, List<QueryInfo> queryInfoList) {
        long duration = executionInfo.getElapsedTime();
        if (duration > thresholdMs) {
            StringBuilder sqlBuilder = new StringBuilder();
            for (QueryInfo qi : queryInfoList) {
                sqlBuilder.append(qi.getQuery()).append(" ");
            }

            String sql = sqlBuilder.toString().trim();

            // 단순히 select 문에 대해서만 처리
            if (!sql.toLowerCase().startsWith("select")) return;

            // 바인딩된 SQL 생성
            String finalSql = bindParameters(sql, (queryInfoList.get(0).getParametersList().get(0)));

            System.out.println("⚠️ 느린 쿼리 (" + duration + "ms):\n" + finalSql);

            try (Connection conn = dataSource.getConnection();
                 PreparedStatement stmt = conn.prepareStatement("EXPLAIN (ANALYZE) " + finalSql);
                 ResultSet rs = stmt.executeQuery()) {

                System.out.println("📊 실행 계획:");
                while (rs.next()) {
                    System.out.println(rs.getString(1));
                }

            } catch (Exception e) {
                System.out.println("❗ EXPLAIN ANALYZE 실패: " + e.getMessage());
            }

        }
    }

    private String bindParameters(String sql, List<ParameterSetOperation> params) {
        if (params == null || params.isEmpty()) {
            return sql;
        }

        for (ParameterSetOperation paramOp : params) {
            Object value = null;
            Object[] args = paramOp.getArgs();

            // 보통 args[1]이 실제 바인딩 값임
            if (args != null && args.length > 1) {
                value = args[1];
            }

            String replacement;
            if (value == null) {
                replacement = "NULL";
            } else if (value instanceof Number) {
                replacement = value.toString();
            } else if (value instanceof Boolean) {
                replacement = ((Boolean) value) ? "TRUE" : "FALSE";
            } else {
                replacement = "'" + value.toString().replace("'", "''") + "'";
            }

            // 첫 번째 ?를 replacement로 치환
            sql = sql.replaceFirst("\\?", replacement);
        }

        return sql;
    }
}
```

실행 시간 임계값(thresholdMs)에 대한 정의를 하고, 실행 계획을 직접 실행하기 위한 실제 커넥션을 선언합니다.
```java
private final long thresholdMs;
private final DataSource dataSource;
```

다음은 쿼리 실행이 끝난 후 실행시간(executionInfo.getElapsedTime())이 기준을 넘었는지 확인하는 afterQuery부분입니다.

```java
@Override
public void afterQuery(ExecutionInfo executionInfo, List<QueryInfo> queryInfoList) {
    long duration = executionInfo.getElapsedTime();
    if (duration > thresholdMs) {
        ...
    }
}
```

그리고 실제로 실행된 SQL 및 파라미터 바인딩을 아래 블럭에서 합니다.

```java
StringBuilder sqlBuilder = new StringBuilder();
for (QueryInfo qi : queryInfoList) {
    sqlBuilder.append(qi.getQuery()).append(" ");
}
String sql = sqlBuilder.toString().trim();

if (!sql.toLowerCase().startsWith("select")) return;

String finalSql = bindParameters(sql, (queryInfoList.get(0).getParametersList().get(0)));
```

queryInfoList에는 실제 실행된 쿼리 문자열(? 포함된 SQL)이 들어있습니다. bindParameters(...) 메서드를 이용해 ? 자리에 실제 바인딩 값을 치환해 사람이 읽을 수 있는 형태로 만듭니다.

select구문만 실행계획을 보려고 조건문으로 검사합니다.

```java
try (Connection conn = dataSource.getConnection();
     PreparedStatement stmt = conn.prepareStatement("EXPLAIN (ANALYZE) " + finalSql);
     ResultSet rs = stmt.executeQuery()) {
     
    System.out.println("📊 실행 계획:");
    while (rs.next()) {
        System.out.println(rs.getString(1));
    }
} catch (Exception e) {
    System.out.println("❗ EXPLAIN ANALYZE 실패: " + e.getMessage());
}
```

실제 DB 커넥션을 열어 EXPLAIN (ANALYZE) 쿼리를 수행합니다. PostgreSQL 기준이며, MySQL이라면 EXPLAIN ANALYZE 지원 버전을 확인해야 합니다. 실패할 경우도 있으니 try-catch로 감싸서 실패 로그 또한 남깁니다.

```java
private String bindParameters(String sql, List<ParameterSetOperation> params) {
    ...
    sql = sql.replaceFirst("\\?", replacement);
}
```

Datasource-Proxy가 제공하는 ParameterSetOperation 객체로부터 바인딩 값을 추출합니다. JPA 기준으로는 일반적으로 args[1]이 실제 파라미터 값입니다. ? 자리에 값을 치환하기 위해 replaceFirst("\\?", ...)를 반복 호출합니다.

> SQL Injection 위험이 있기 때문에 운영 환경에서는 이 방법을 사용하지 마세요. 개발, 디버깅용에만 사용해야 합니다.
{:.prompt-danger}

## 로그 예시

```log
Hibernate: 
    select
        p1_0.user_id,
        p1_0.id,
        p1_0.title 
    from
        posts p1_0 
    where
        p1_0.user_id=?
⚠️ 느린 쿼리 (1ms):
select p1_0.user_id,p1_0.id,p1_0.title from posts p1_0 where p1_0.user_id=1
📊 실행 계획:
Seq Scan on posts p1_0  (cost=0.00..11.25 rows=100 width=32) (actual time=0.005..0.026 rows=100 loops=1)
  Filter: (user_id = 1)
  Rows Removed by Filter: 400
Planning Time: 0.020 ms
Execution Time: 0.046 ms
```

## 결론

이번 글에서는 Datasource-Proxy를 활용해 JPA 기반의 Spring Boot 애플리케이션에서 느린 쿼리를 자동으로 감지하고, 실행 계획(EXPLAIN ANALYZE) 까지 확인하는 방법을 소개했습니다.

위에서 설명한 방법은 개발 단계에서 빠르게 병목을 파악하고 쿼리를 튜닝하고 싶을 때, 복잡한 설정 없이 바로 적용할 수 있는 실용적인 방법입니다.

하지만, 실제 운영 환경에서는 쿼리 수가 많고, 민감한 데이터를 다루는 만큼 로그 출력 자체가 부하가 될 수 있고 보안상 주의가 필요합니다. 따라서 이러한 기능은 운영보다는 개발/테스트 환경에서의 성능 분석 도구로 활용하는 것이 적절합니다.

필요하다면 PostgreSQL의 auto_explain, pg_stat_statements, 혹은 APM 도구와 병행해서 사용하는 것도 좋은 선택입니다.