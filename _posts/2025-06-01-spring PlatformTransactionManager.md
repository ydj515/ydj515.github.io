---
title: Spring PlatformTransactionManager
description: Spring PlatformTransactionManager
author: ydj515
date: 2025-06-01 11:33:00 +0800
categories: [spring]
tags: [spring, transaction, jpa, mybatis, jooq, jdbc, troubleshooting]
pin: true
math: true
mermaid: true
image:
  path: /assets/img/spring/logo.png
  lqip: data:image/webp;base64,UklGRpoAAABXRUJQVlA4WAoAAAAQAAAADwAABwAAQUxQSDIAAAARL0AmbZurmr57yyIiqE8oiG0bejIYEQTgqiDA9vqnsUSI6H+oAERp2HZ65qP/VIAWAFZQOCBCAAAA8AEAnQEqEAAIAAVAfCWkAALp8sF8rgRgAP7o9FDvMCkMde9PK7euH5M1m6VWoDXf2FkP3BqV0ZYbO6NA/VFIAAAA
  alt: spring
---

## Spring PlatformTransactionManager
Spring에서는 JPA, JDBC, MyBatis, JOOQ 등 다양한 데이터 접근 기술을 사용할 수 있으며, 기술 간 전환이 필요한 경우가 종종 있습니다.
특히 JPA 기반 코드에서 JDBC, MyBatis, 또는 JOOQ 등으로 변경할 수 있도록 추상화를 고려한다면, 트랜잭션 관리 방식에 대한 공통된 이해가 필요합니다.

PlatformTransactionManager는 Spring이 제공하는 트랜잭션 처리의 추상화 계층으로, 이 인터페이스를 통해 기술에 관계없이 일관된 방식의 트랜잭션 처리가 가능합니다.
이 인터페이스의 구조와 함께, 주요 기술들이 이를 어떻게 구현하고 적용하는지, 그리고 트랜잭션 전파 및 예외 처리 방식은 어떤 차이가 있는지를 비교합니다.

### PlatformTransactionManager란?

PlatformTransactionManager는 Spring이 제공하는 트랜잭션 처리의 핵심 인터페이스로, JPA, JDBC, MyBatis 등 다양한 기술에 대해 일관된 트랜잭션 관리 방식을 제공합니다.

```java
public interface PlatformTransactionManager extends TransactionManager {
    TransactionStatus getTransaction(TransactionDefinition definition) throws TransactionException;

    void commit(TransactionStatus status) throws TransactionException;

    void rollback(TransactionStatus status) throws TransactionException;
}
```

> @Transactional 또는 TransactionTemplate 등은 내부적으로 PlatformTransactionManager를 통해 트랜잭션을 시작하거나 종료합니다.
{: .prompt-info }

### 구조 및 동작 방식

Spring은 기술에 따라 다음과 같은 PlatformTransactionManager 구현체를 제공합니다.
- JpaTransactionManager (JPA)
- DataSourceTransactionManager (JDBC, MyBatis, JOOQ 등)

이들은 공통적으로`AbstractPlatformTransactionManager`를 상속하며, 핵심 트랜잭션 로직은 doBegin()을 통해 기술별로 다르게 구현됩니다.

## AbstractPlatformTransactionManager

`PlatformTransactionManager` interface를 implements한 `AbstractPlatformTransactionManager`를 실제로 각 기술들이 구현하고 있습니다.

아래는 `AbstractPlatformTransactionManager`의 class diagram입니다.
![alt text](/assets/img/spring/platformTransactionManager/AbstractPlatformTransactionManager.png)

그리고 `AbstractPlatformTransactionManager`를 아래의 구현체들이 각각 정의해서 사용합니다.
![alt text](/assets/img/spring/platformTransactionManager/PlatformTransactionManagerExtends.png)

크게 `JpaTransactionManager`, `DataSourceTransactionManager` 둘중 하나를 확장해서 사용하곤합니다.

## 트랜잭션 시작 흐름

트랜잭션은 startTransaction()을 통해 시작되며, 각 구현체별 doBegin() 구현을 호출하게 됩니다.

### startTransaction()

```java
private TransactionStatus startTransaction(TransactionDefinition definition, Object transaction,
        boolean nested, boolean debugEnabled, @Nullable SuspendedResourcesHolder suspendedResources) {

    boolean newSynchronization = (getTransactionSynchronization() != SYNCHRONIZATION_NEVER);
    DefaultTransactionStatus status = newTransactionStatus(
            definition, transaction, true, newSynchronization, nested, debugEnabled, suspendedResources);
    this.transactionExecutionListeners.forEach(listener -> listener.beforeBegin(status));
    try {
        doBegin(transaction, definition); // 구현체에서 실제 트랜잭션 시작
    }
    catch (RuntimeException | Error ex) {
        this.transactionExecutionListeners.forEach(listener -> listener.afterBegin(status, ex));
        throw ex;
    }
    prepareSynchronization(status, definition);
    this.transactionExecutionListeners.forEach(listener -> listener.afterBegin(status, null));
    return status;
}
```

### JDBC:DataSourceTransactionManager.doBegin()

DataSourceTransactionManager가 `abstract doBegin()`을 구현한 메소드입니다.

```java
@Override
protected void doBegin(Object transaction, TransactionDefinition definition) {
    DataSourceTransactionObject txObject = (DataSourceTransactionObject) transaction;
    Connection con = null;

    try {
        if (!txObject.hasConnectionHolder() ||
                txObject.getConnectionHolder().isSynchronizedWithTransaction()) {
            Connection newCon = obtainDataSource().getConnection();
            if (logger.isDebugEnabled()) {
                logger.debug("Acquired Connection [" + newCon + "] for JDBC transaction");
            }
            txObject.setConnectionHolder(new ConnectionHolder(newCon), true);
        }

        txObject.getConnectionHolder().setSynchronizedWithTransaction(true);
        con = txObject.getConnectionHolder().getConnection();

        Integer previousIsolationLevel = DataSourceUtils.prepareConnectionForTransaction(con, definition);
        txObject.setPreviousIsolationLevel(previousIsolationLevel);
        txObject.setReadOnly(definition.isReadOnly());

        // Switch to manual commit if necessary. This is very expensive in some JDBC drivers,
        // so we don't want to do it unnecessarily (for example if we've explicitly
        // configured the connection pool to set it already).
        if (con.getAutoCommit()) {
            txObject.setMustRestoreAutoCommit(true);
            if (logger.isDebugEnabled()) {
                logger.debug("Switching JDBC Connection [" + con + "] to manual commit");
            }
            con.setAutoCommit(false);
        }

        prepareTransactionalConnection(con, definition);
        txObject.getConnectionHolder().setTransactionActive(true);

        int timeout = determineTimeout(definition);
        if (timeout != TransactionDefinition.TIMEOUT_DEFAULT) {
            txObject.getConnectionHolder().setTimeoutInSeconds(timeout);
        }

        // Bind the connection holder to the thread.
        if (txObject.isNewConnectionHolder()) {
            TransactionSynchronizationManager.bindResource(obtainDataSource(), txObject.getConnectionHolder());
        }
    }

    catch (Throwable ex) {
        if (txObject.isNewConnectionHolder()) {
            DataSourceUtils.releaseConnection(con, obtainDataSource());
            txObject.setConnectionHolder(null, false);
        }
        throw new CannotCreateTransactionException("Could not open JDBC Connection for transaction", ex);
    }
}
```

### JPA:JpaTransactionManager.doBegin()

JpaTransactionManager가 `abstract doBegin()`을 구현한 메소드입니다.

```java
@Override
protected void doBegin(Object transaction, TransactionDefinition definition) {
    JpaTransactionObject txObject = (JpaTransactionObject) transaction;

    if (txObject.hasConnectionHolder() && !txObject.getConnectionHolder().isSynchronizedWithTransaction()) {
        throw new IllegalTransactionStateException(
                "Pre-bound JDBC Connection found! JpaTransactionManager does not support " +
                "running within DataSourceTransactionManager if told to manage the DataSource itself. " +
                "It is recommended to use a single JpaTransactionManager for all transactions " +
                "on a single DataSource, no matter whether JPA or JDBC access.");
    }

    try {
        if (!txObject.hasEntityManagerHolder() ||
                txObject.getEntityManagerHolder().isSynchronizedWithTransaction()) {
            EntityManager newEm = createEntityManagerForTransaction();
            if (logger.isDebugEnabled()) {
                logger.debug("Opened new EntityManager [" + newEm + "] for JPA transaction");
            }
            txObject.setEntityManagerHolder(new EntityManagerHolder(newEm), true);
        }

        EntityManager em = txObject.getEntityManagerHolder().getEntityManager();

        // Delegate to JpaDialect for actual transaction begin.
        int timeoutToUse = determineTimeout(definition);
        Object transactionData = getJpaDialect().beginTransaction(em, new JpaTransactionDefinition(definition, timeoutToUse, txObject.isNewEntityManagerHolder())); // JPA 제공자 (예: Hibernate) 통해 트랜잭션 시작
        txObject.setTransactionData(transactionData);
        txObject.setReadOnly(definition.isReadOnly());

        // Register transaction timeout.
        if (timeoutToUse != TransactionDefinition.TIMEOUT_DEFAULT) {
            txObject.getEntityManagerHolder().setTimeoutInSeconds(timeoutToUse);
        }

        // Register the JPA EntityManager's JDBC Connection for the DataSource, if set.
        if (getDataSource() != null) {
            ConnectionHandle conHandle = getJpaDialect().getJdbcConnection(em, definition.isReadOnly());
            if (conHandle != null) {
                ConnectionHolder conHolder = new ConnectionHolder(conHandle);
                if (timeoutToUse != TransactionDefinition.TIMEOUT_DEFAULT) {
                    conHolder.setTimeoutInSeconds(timeoutToUse);
                }
                if (logger.isDebugEnabled()) {
                    logger.debug("Exposing JPA transaction as JDBC [" + conHandle + "]");
                }
                TransactionSynchronizationManager.bindResource(getDataSource(), conHolder);
                txObject.setConnectionHolder(conHolder);
            }
            else {
                if (logger.isDebugEnabled()) {
                    logger.debug("Not exposing JPA transaction [" + em + "] as JDBC transaction because " +
                            "JpaDialect [" + getJpaDialect() + "] does not support JDBC Connection retrieval");
                }
            }
        }

        // Bind the entity manager holder to the thread.
        if (txObject.isNewEntityManagerHolder()) {
            TransactionSynchronizationManager.bindResource(
                    obtainEntityManagerFactory(), txObject.getEntityManagerHolder());
        }
        txObject.getEntityManagerHolder().setSynchronizedWithTransaction(true);
    }

    catch (TransactionException ex) {
        closeEntityManagerAfterFailedBegin(txObject);
        throw ex;
    }
    catch (Throwable ex) {
        closeEntityManagerAfterFailedBegin(txObject);
        throw new CannotCreateTransactionException("Could not open JPA EntityManager for transaction", ex);
    }
}
```

## 구현체 및 기술별 사용 방식
### JPA: JpaTransactionManager

- 구현체: org.springframework.orm.jpa.JpaTransactionManager
- 사용하는 기술: EntityManager, JPA provider (Hibernate 등)
- 트랜잭션 범위: Persistence Context (EntityManager) 단위
- Spring이 제공하는 JPA 연동 추상화
- EntityManager의 생명주기를 트랜잭션에 맞춰 관리

```java
@Bean
public PlatformTransactionManager transactionManager(EntityManagerFactory emf) {
    return new JpaTransactionManager(emf);
}
```

```java
@Transactional
public void save() {
    entityManager.persist(entity);
}
```

### JDBC: DataSourceTransactionManager

- 구현체: org.springframework.jdbc.datasource.DataSourceTransactionManager
- 사용하는 기술: java.sql.Connection, javax.sql.DataSource
- 트랜잭션 범위: Connection 단위
- 매우 단순하며, 커넥션을 직접 제어
- SQL 기반 로직에 적합

```java
@Bean
public PlatformTransactionManager transactionManager(DataSource dataSource) {
    return new DataSourceTransactionManager(dataSource);
}
```

```java
@Transactional
public void save() {
    jdbcTemplate.update("INSERT INTO user ...");
}
```

### MyBatis: DataSourceTransactionManager 사용

- 구현체: DataSourceTransactionManager 사용
- 사용하는 기술: SqlSession, 내부적으로는 JDBC Connection 사용
- 트랜잭션 범위: SqlSession + Connection 단위
- MyBatis 자체적으로 트랜잭션을 제공하지 않기 때문에 Spring이 JDBC 방식으로 감쌈
- SqlSession을 Spring에서 주입받으면 트랜잭션 자동 연동 가능

```java
@Bean
public PlatformTransactionManager transactionManager(DataSource dataSource) {
    return new DataSourceTransactionManager(dataSource);
}
```

```java
@Transactional
public void save() {
    userMapper.insert(user); // Mapper는 SqlSessionTemplate 통해 트랜잭션 적용됨
}
```

### JOOQ: DataSourceTransactionManager or Custom

- 구현체: 주로 DataSourceTransactionManager 사용, 고급 사용 시 DefaultTransactionProvider 또는 사용자 정의 구현
- 사용하는 기술: DSLContext, 내부적으로 JDBC
- 트랜잭션 범위: DSLContext + Connection 단위
- JOOQ는 Spring과의 통합에서 Spring의 트랜잭션 관리자를 그대로 사용하거나, 직접 DSLContext에서 트랜잭션을 제어할 수도 있음

```java
@Bean
public PlatformTransactionManager transactionManager(DataSource dataSource) {
    return new DataSourceTransactionManager(dataSource);
}
```

```java
@Transactional
public void save() {
    dsl.insertInto(USER).set(...).execute();
}
```

```java
// JOOQ 자체 트랜잭션 기능 사용. 이 방식은 Spring 트랜잭션과 별개이므로 병행 사용 시 주의 필요
dsl.transaction(configuration -> {
    DSLContext ctx = DSL.using(configuration);
    ctx.insertInto(...).execute();
});
```

## 기술별 처리 방식 정리

| 기술    | 구현체                                          | 내부 트랜잭션 대상     | 특징                                                             |
| ------- | ----------------------------------------------- | ---------------------- | ---------------------------------------------------------------- |
| JPA     | JpaTransactionManager                           | EntityManager          | 영속성 컨텍스트 중심, JPA provider(Hibernate 등)를 통한 추상화   |
| JDBC    | DataSourceTransactionManager                    | Connection             | 가장 단순한 방식, SQL 직접 실행                                  |
| MyBatis | DataSourceTransactionManager                    | SqlSession (JDBC 기반) | JDBC 기반으로 Spring과 자동 연동, SqlSessionTemplate 등으로 처리 |
| JOOQ    | DataSourceTransactionManager 또는 자체 트랜잭션 | DSLContext (JDBC 기반) | Spring 통합 또는 JOOQ 내부 트랜잭션 처리 방식 모두 가능          |

--

## 번외. 왜 JPA는 반드시 트랜잭션이 필요한가요?

JPA에서는 @Transactional 또는 TransactionTemplate과 같은 트랜잭션 경계를 명시하지 않으면, 다음과 같은 예외가 발생합니다.

```java
javax.persistence.TransactionRequiredException: Executing an update/delete query
```

### 이유는?
JPA는 내부적으로 **영속성 컨텍스트(Persistence Context)**를 통해 객체 상태를 추적하고 변경을 감지합니다.

persist, merge, remove, JPQL의 update/delete 등은 트랜잭션이 있어야만 실제 DB에 반영됩니다.

트랜잭션이 없다면 컨텍스트가 없거나 flush() 시점이 없기 때문에 SQL이 실행되지 않거나 예외가 발생합니다.


```java
// 트랜잭션 없이 실행되는 서비스
public void save() {
    entityManager.persist(new User("chatgpt")); // 예외 발생
}
```
-> TransactionRequiredException 예외 발생

### 반면, 왜 JDBC는 트랜잭션 없이도 동작하나요?

JDBC는 Connection 단위로 동작하며, autoCommit=true일 경우 트랜잭션 없이도 쿼리가 자동 커밋됩니다.

즉, 트랜잭션이 없어도 동작은 하며, 오히려 명시적으로 묶지 않으면 쿼리 단위로 자동 커밋이 발생해버립니다.

> 따라서, JPA를 사용할 때는 항상 @Transactional을 명시하거나 TransactionTemplate으로 트랜잭션을 제어해주는 것이 필수입니다.
{:.prompt-danger}

### 왜 JDBC는 트랜잭션 없이도 되나요?

JDBC는 SQL을 직접 날리는 낮은 수준의 API입니다. Connection 객체의 autoCommit 설정이 기본적으로 true이기 때문에, conn.prepareStatement().execute() 하면 즉시 실행 -> 즉시 commit 됩니다.

```java
Connection conn = DriverManager.getConnection(...); // autoCommit=true
PreparedStatement ps = conn.prepareStatement("INSERT INTO user ...");
ps.execute(); // 즉시 실행되고 바로 commit
```

**즉, JDBC는 "트랜잭션"이라는 개념이 아예 없더라도 하나의 쿼리 단위로 독립 실행이 가능한 구조입니다.**

### 결론
- JPA는 객체의 상태와 생명주기를 관리하고 SQL 실행을 지연시키는 구조이므로, 반드시 트랜잭션이 필요합니다.
- 트랜잭션 없이 사용하면 TransactionRequiredException과 같은 예외가 발생하며, 의도한 대로 DB에 반영되지 않습니다.
- 반면 JDBC는 기본적으로 트랜잭션이 없어도 동작하지만, 오히려 트랜잭션을 명시하지 않으면 쿼리마다 자동 커밋되어 원자성 보장이 어렵습니다.
- 따라서 JPA를 사용할 때는 항상 @Transactional 또는 TransactionTemplate으로 트랜잭션을 명확히 지정해야 합니다.

**JPA는 트랜잭션을 전제로 한 ORM 도구입니다. 트랜잭션 없이 JPA를 쓰는 것은 JPA의 철학과 작동 방식을 위반하는 것이며, 반드시 예외로 이어지게 되어 있습니다.**

--

## 정리

PlatformTransactionManager를 이해하면 Spring에서 어떤 데이터 접근 기술을 사용하더라도 일관된 트랜잭션 처리를 설계할 수 있습니다.
특히 기술 간 전환이나 복합 사용이 필요한 경우, 내부 동작 방식까지 알고 있다면 유연하게 대응할 수 있습니다.

