---
title: "Spring 개발자가 본 Go의 트랜잭션 관리 - 여러 리포지토리를 하나로 묶기"
description: "Spring의 @Transactional에 익숙한 개발자 관점에서 Go의 트랜잭션 전달 방식. TransactionProvider, Role Interface, Context 전파"
author: ydj515
date: 2026-09-22 09:00:00 +0900
categories: [Go, Database]
tags: [go, transaction, database-sql, spring, unit-of-work, context]
image:
  path: /assets/img/go/logo.png
  alt: "Go 프로그래밍 언어 로고"
---

## 들어가며: 트랜잭션은 어떻게 전달할까?

Spring에서는 `@Transactional`이 붙은 메서드에서 여러 리포지토리를 호출하면 같은 트랜잭션으로 묶을 수 있습니다. Go의 `database/sql`에서는 트랜잭션을 시작하고, 각 리포지토리가 같은 `*sql.Tx`를 사용하도록 직접 연결해야 합니다.

처음에는 커밋과 롤백을 매번 작성하는 것이 번거롭게 느껴졌습니다. 하지만 여러 리포지토리를 다루면서 생긴 고민은 따로 있었습니다. **트랜잭션 경계는 서비스에서 정하되, DB 구현을 어디까지 드러낼 것인가?**

이 글에서는 하나의 DB에서 주문·결제·재고·아웃박스를 함께 변경하는 상황을 예로 들어 세 가지 전달 방식을 정리했습니다.

---

## 1. Spring이 처리해 주던 부분

```java
@Transactional
public void completePayment() {
    orderRepository.markAsPaid(orderId);
    paymentRepository.complete(paymentId);
    inventoryRepository.confirm(orderId);
    outboxRepository.append(event);
}
```

일반적인 Spring JDBC/JPA 환경에서는 트랜잭션 매니저가 커넥션이나 EntityManager를 현재 스레드에 연결합니다. 같은 트랜잭션 매니저와 리소스에 참여하는 리포지토리들은 이를 재사용합니다. 개발자가 트랜잭션 객체를 인자로 넘기지 않아도 되는 이유입니다.

**다만 프록시를 거치는 호출을 전제로 하며, 새 스레드나 다른 DB까지 자동으로 묶어 주는 것은 아닙니다.** 리액티브 트랜잭션은 스레드 대신 Reactor Context를 사용합니다. [Spring 공식 문서](https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative/tx-decl-explained.html)

### Go에서는 직접 관리하는 트랜잭션

Go의 `database/sql`에서는 시작과 종료를 코드로 작성합니다. 반복되는 처리는 다음과 같은 헬퍼로 묶을 수 있습니다.

```go
func runInTx(ctx context.Context, db *sql.DB, fn func(*sql.Tx) error) error {
    tx, err := db.BeginTx(ctx, nil)
    if err != nil {
        return err
    }
    // 중간에 반환되거나 panic이 발생해도 롤백을 시도한다.
    // 이미 커밋된 트랜잭션에는 영향을 주지 않는다.
    defer tx.Rollback()

    if err := fn(tx); err != nil {
        return err
    }
    // 콜백 성공과 커밋 성공은 별개이므로 커밋 에러도 반환한다.
    return tx.Commit()
}
```

콜백이 에러를 반환하면 롤백하고, 성공하면 커밋합니다. 커밋 후 실행되는 `Rollback`은 변경 사항을 되돌리지 않습니다. `Commit`도 실패할 수 있으므로 에러를 호출자에게 반환해야 합니다.

여기서 중요한 것은 **콜백 안의 쿼리가 모두 전달받은 `tx`를 사용해야 한다**는 점입니다. 중간에 `db.ExecContext`를 호출하면 그 쿼리는 트랜잭션 밖에서 실행됩니다. [Go 공식 문서](https://go.dev/doc/database/execute-transactions)

---

## 2. Go에서 트랜잭션을 전달하는 방법

가장 단순한 방법은 `*sql.Tx`를 인자로 전달하는 것입니다. 작은 서비스라면 이것만으로도 충분합니다. SQL에 의존한다는 이유만으로 잘못된 설계가 되는 것은 아닙니다.

다만 비즈니스 계층에서 DB 구현을 분리하려면, 트랜잭션에 연결된 리포지토리나 작은 인터페이스를 전달할 수 있습니다. 명시성은 유지하면서 `database/sql` 의존성을 저장소 구현 안에 둘 수 있습니다.

반대로 `context.Context`에 트랜잭션을 넣으면 기존 함수 시그니처를 유지하기 쉽습니다. 대신 필수 의존성이 함수 선언에서 보이지 않습니다. Go의 Context 문서는 Value를 API 경계를 지나는 요청 범위 데이터에 사용하고, 함수의 선택적 인자를 전달하는 용도로 쓰지 말라고 안내합니다. 트랜잭션 전파를 직접 금지하는 문장은 아니지만, 범용 의존성 주입 수단으로 확대하는 데는 신중할 필요가 있습니다. [context 패키지 문서](https://pkg.go.dev/context)

트랜잭션에 연결된 객체를 명시적으로 전달하는 방식은 호출 코드에서 어떤 트랜잭션에 참여하는지 명확히 드러난다는 장점이 있습니다. 반면 기존 리포지토리 API를 변경하기 어렵다면 Context 전파가 현실적인 대안이 될 수 있습니다. 아래에서는 이러한 세 가지 전달 방식을 설명합니다.

---

## 3. 방법1. TransactionProvider: 리포지토리를 묶어서 전달하기

여러 리포지토리를 같은 트랜잭션에 연결한 뒤, 하나의 묶음으로 콜백에 전달하는 방식입니다. Unit of Work 형태로 구성할 수 있습니다.

```go
// 생략: OrderRepository, PaymentRepository, InventoryRepository, OutboxRepository 정의
type TxRepositories struct {
    Order     OrderRepository
    Payment   PaymentRepository
    Inventory InventoryRepository
    Outbox    OutboxRepository
}

type TransactionProvider interface {
    Transact(ctx context.Context, fn func(TxRepositories) error) error
}
```

### 서비스에서 사용하는 모습

서비스는 콜백에서 받은 리포지토리만 사용합니다. 주문부터 아웃박스까지 하나의 작업으로 묶는걸 볼 수 있습니다.

```go
// 생략: PaymentService와 Event 정의
func (s *PaymentService) CompletePayment(
    ctx context.Context, orderID, paymentID int64, event Event,
) error {
    return s.txProvider.Transact(ctx, func(repos TxRepositories) error {
        if err := repos.Order.MarkAsPaid(ctx, orderID); err != nil {
            return err
        }
        if err := repos.Payment.Complete(ctx, paymentID); err != nil {
            return err
        }
        if err := repos.Inventory.Confirm(ctx, orderID); err != nil {
            return err
        }
        return repos.Outbox.Append(ctx, event)
    })
}
```

각 단계의 에러는 콜백 밖으로 전달해 롤백합니다. 실제 구현에서는 상태 전이 검증, 갱신 행 수 확인, 중복 처리 방지도 각 작업에 포함해야 합니다.

### 같은 트랜잭션에 연결하기

Provider 구현에서는 앞의 `runInTx`를 재사용합니다.

```go
// 생략: transactionProvider의 필드와 각 리포지토리 구현
func (p *transactionProvider) Transact(
    ctx context.Context, fn func(TxRepositories) error,
) error {
    return runInTx(ctx, p.db, func(tx *sql.Tx) error {
        // 모든 리포지토리에 같은 tx를 연결한다.
        repos := TxRepositories{
            Order:     p.orderRepository.WithTx(tx),
            Payment:   p.paymentRepository.WithTx(tx),
            Inventory: p.inventoryRepository.WithTx(tx),
            Outbox:    p.outboxRepository.WithTx(tx),
        }
        return fn(repos)
    })
}
```

`WithTx`는 공유 리포지토리의 필드를 변경하지 않고, 해당 `tx`를 사용하는 새 인스턴스를 반환해야 합니다. 공유 객체를 수정하면 동시에 처리하는 요청의 트랜잭션이 섞일 수 있습니다. 이렇게 만든 리포지토리는 콜백 밖에 보관하지 않습니다.

### 리포지토리에서 쿼리 실행하기

주문 리포지토리를 예로 들면 `WithTx`는 다음처럼 구현할 수 있습니다. SQL은 PostgreSQL 기준입니다.

```go
type OrderRepository interface {
    MarkAsPaid(ctx context.Context, orderID int64) error
}

// *sql.DB와 *sql.Tx가 모두 구현하는 쿼리 실행 인터페이스다.
type executor interface {
    ExecContext(context.Context, string, ...any) (sql.Result, error)
}

type orderRepository struct {
    conn executor
}

func (r *orderRepository) WithTx(tx *sql.Tx) OrderRepository {
    // 기존 r.conn을 덮어쓰지 않고 트랜잭션 전용 객체를 만든다.
    return &orderRepository{conn: tx}
}

func (r *orderRepository) MarkAsPaid(ctx context.Context, orderID int64) error {
    // WithTx로 만든 객체라면 이 쿼리는 해당 트랜잭션에 참여한다.
    result, err := r.conn.ExecContext(ctx,
        "UPDATE orders SET status = 'PAID' WHERE id = $1 AND status = 'PENDING'",
        orderID,
    )
    if err != nil {
        return err
    }
    rows, err := result.RowsAffected()
    if err != nil {
        return err
    }
    if rows != 1 {
        return errors.New("order not found or not pending")
    }
    return nil
}
```

주문이 없거나 이미 처리된 상태라면 에러를 반환해 전체 작업을 롤백합니다. 이 예제는 중복 요청을 성공으로 처리하지 않으며, 멱등 응답이 필요하면 기존 처리 결과를 조회하는 로직을 별도로 둡니다.

서비스에서는 트랜잭션 경계가 보이고, 실제 `*sql.Tx`는 구현 내부에 있습니다. 대신 리포지토리를 구성하는 코드가 필요하고, 묶음이 커지면 해당 작업과 무관한 메서드도 노출됩니다.

[PocketBase의 `RunInTransaction`](https://pocketbase.io/docs/go-database/#transaction)도 트랜잭션에 연결된 `txApp`을 콜백으로 전달합니다. 위의 리포지토리 묶음과 동일한 구현은 아니지만, 콜백이 받은 객체로 DB 작업을 수행한다는 점은 같습니다.

---

## 4. 방법2. Role Interface: 필요한 작업만 노출하기

TransactionProvider의 콜백에 모든 리포지토리를 넘기는 대신, 결제 완료에 필요한 작업만 정의할 수 있습니다.

```go
// 생략: Event 정의
type PaymentCompletionTx interface {
    MarkOrderAsPaid(ctx context.Context, orderID int64) error
    CompletePayment(ctx context.Context, paymentID int64) error
    ConfirmInventory(ctx context.Context, orderID int64) error
    AppendOutbox(ctx context.Context, event Event) error
}

type PaymentCompletionProvider interface {
    Transact(ctx context.Context, fn func(PaymentCompletionTx) error) error
}
```

구현체는 같은 `*sql.Tx`를 사용하되, 서비스에는 이 작업에 필요한 메서드만 보여 줍니다. 해당 인터페이스로 주문 삭제나 회원 탈퇴 같은 무관한 작업을 호출할 수 없고, 테스트용 대역도 작게 만들 수 있습니다.

### 기존 Provider에 연결하기

기존 Provider를 감싸면 트랜잭션 생성 코드를 다시 작성할 필요가 없습니다.

```go
// 생략: 나머지 세 메서드도 각각 Payment, Inventory, Outbox에 위임한다.
type paymentCompletionTx struct {
    repos TxRepositories
}

func (t paymentCompletionTx) MarkOrderAsPaid(ctx context.Context, orderID int64) error {
    return t.repos.Order.MarkAsPaid(ctx, orderID)
}

type paymentCompletionProvider struct {
    base TransactionProvider
}

func (p *paymentCompletionProvider) Transact(
    ctx context.Context, fn func(PaymentCompletionTx) error,
) error {
    return p.base.Transact(ctx, func(repos TxRepositories) error {
        // 같은 트랜잭션을 유지하면서 콜백에 노출할 메서드만 좁힌다.
        return fn(paymentCompletionTx{repos: repos})
    })
}
```

위임한 메서드의 에러는 기존 Provider까지 전달됩니다. 롤백과 커밋 책임도 기존 Provider에 남습니다.

별개의 트랜잭션 기술이라기보다는 **Provider가 전달하는 인터페이스를 유스케이스에 맞게 좁히는 방법**입니다. 그만큼 인터페이스와 연결 코드가 늘어납니다.

인터페이스를 좁힌다고 락 순서나 정합성까지 보장되지는 않습니다. 메서드 호출 순서는 여전히 서비스가 결정합니다. 데드락을 줄이려면 실제 SQL의 잠금 순서를 통일하고, 제약 조건과 재시도 정책을 별도로 설계해야 합니다.

---

## 5. 방법3. Context 전파: 기존 호출 형태 유지하기

트랜잭션을 Context에 넣고, 하위 리포지토리가 이를 꺼내 사용하는 방식입니다.

```go
// 생략: txManager와 각 리포지토리 구현, 입력값 정의
err := txManager.Do(ctx, func(txCtx context.Context) error {
    if err := orderRepository.MarkAsPaid(txCtx, orderID); err != nil {
        return err
    }
    if err := paymentRepository.Complete(txCtx, paymentID); err != nil {
        return err
    }
    if err := inventoryRepository.Confirm(txCtx, orderID); err != nil {
        return err
    }
    return outboxRepository.Append(txCtx, event)
})
```

`Do`는 트랜잭션을 포함한 Context를 콜백에 넘깁니다. 각 리포지토리는 같은 Context에서 트랜잭션을 찾아 사용하고, 에러는 `Do`까지 반환해 롤백합니다.

### Context에서 트랜잭션 꺼내기

트랜잭션을 넣고 꺼내는 코드는 DB 접근 패키지 안에 모아 둡니다.

```go
// 다른 패키지의 Context 키와 충돌하지 않도록 비공개 타입을 사용한다.
type txKey struct{}

type contextTxManager struct {
    db *sql.DB
}

func (m *contextTxManager) Do(ctx context.Context, fn func(context.Context) error) error {
    return runInTx(ctx, m.db, func(tx *sql.Tx) error {
        txCtx := context.WithValue(ctx, txKey{}, tx)
        // 하위 호출에는 원래 ctx가 아니라 txCtx를 전달한다.
        return fn(txCtx)
    })
}

func requireTx(ctx context.Context) (*sql.Tx, error) {
    tx, ok := ctx.Value(txKey{}).(*sql.Tx)
    if !ok || tx == nil {
        // 트랜잭션이 필수인 경로에서는 일반 DB로 대체하지 않는다.
        return nil, errors.New("transaction required")
    }
    return tx, nil
}

type contextOrderRepository struct{}

func (r *contextOrderRepository) MarkAsPaid(ctx context.Context, orderID int64) error {
    tx, err := requireTx(ctx)
    if err != nil {
        return err
    }
    // 앞의 SQL 구현을 재사용하되, 실행할 tx는 Context에서 가져온다.
    return (&orderRepository{conn: tx}).MarkAsPaid(ctx, orderID)
}
```

이 구현은 Context에 트랜잭션이 없으면 즉시 실패합니다. 중첩된 `Do` 호출은 기존 트랜잭션을 재사용하지 않고 새로 시작하므로, 예제에서는 중첩 호출을 전제로 하지 않습니다.

기존 `Save(ctx, value)` 형태를 유지할 수 있다는 것이 장점입니다. 이미 Context를 통해 DB 세션을 조회하는 코드가 많다면 변경 범위를 줄일 수 있습니다.

반면 실수로 원래 `ctx`를 전달해도 컴파일은 됩니다. 트랜잭션이 없을 때 일반 DB로 대체하는 구현이라면 일부 쿼리만 별도로 커밋될 수도 있습니다. 트랜잭션이 필수인 작업은 Tx가 없으면 에러를 반환하도록 하고, 중간 실패 시 전체 변경이 롤백되는지 통합 테스트로 확인해야 합니다.

[Gitea의 `db.WithTx`](https://github.com/go-gitea/gitea/blob/main/models/db/context.go)는 Context로 트랜잭션에 연결된 XORM 세션을 전파합니다. 기존 DB 접근 구조 안에서 트랜잭션을 전달하는 사례로 참고할 만합니다.

---

## 6. 어떤 방식을 선택할까?

여러 리포지토리를 묶으면서 비즈니스 계층에서 SQL 구현을 분리하려는 새로운 코드라면 **TransactionProvider를 기본 방식으로 고려하는 것이 좋습니다.** 트랜잭션 경계가 명확히 드러나고 기존 리포지토리를 재사용하기도 용이하기 때문입니다.

| 방식                | 얻는 것                          | 감수할 것                       |
| ------------------- | -------------------------------- | ------------------------------- |
| TransactionProvider | 명시적인 전달, 리포지토리 재사용 | 묶음 구성 코드                  |
| Role Interface      | 유스케이스에 필요한 API만 노출   | 인터페이스와 구현 코드 증가     |
| Context 전파        | 기존 호출 형태 유지              | 숨은 의존성과 Context 누락 위험 |

만약 Provider의 콜백에 해당 유스케이스와 무관한 변경 메서드까지 노출되는 것이 우려된다면, Role Interface를 도입해 접근 범위를 좁히는 것이 안전합니다. 반면, 기존 코드베이스가 이미 Context 기반의 DB 세션 조회로 통일되어 있다면, 엄격한 전파 규칙과 롤백 테스트를 갖춘 상태에서 해당 방식을 유지하는 것도 합리적인 선택입니다.

> **명시성을 우선하면 트랜잭션에 연결된 객체를 직접 전달합니다.** 기존 호출 형태를 유지하기 위해 Context 전파를 선택할 수도 있지만, 트랜잭션 참여 여부를 코드에서 확인하기 어려워지는 점은 감수해야 합니다.
{: .prompt-tip }

---

## 7. 트랜잭션 범위는 짧게 유지하기

어떤 전달 방식을 쓰든 트랜잭션 안에서 외부 API 응답을 기다리면 커넥션과 락을 오래 점유할 수 있습니다. 이는 Go와 Spring 모두에 해당합니다.

결제 승인 API는 가능한 한 DB 트랜잭션 밖에서 호출하고, DB 안에서는 주문·결제·재고 변경과 아웃박스 저장을 묶습니다. 이벤트는 커밋 후 별도 발행기가 전달합니다.

다만 외부 결제 승인과 DB 커밋이 하나의 원자적 작업이 되는 것은 아닙니다. 승인 후 DB 저장에 실패하는 경우를 위해 멱등 키, 승인 결과 조회, 재처리나 보상 처리가 필요합니다. 아웃박스 역시 중복 발행될 수 있으므로 소비자는 멱등하게 처리해야 합니다.

---

## 정리

Spring의 `@Transactional`에 익숙한 상태로 Go를 처음 접했을 때는 Spring 처럼 사용하는 방법을 고민했습니다. 하지만 Go의 설계 철학은 어노테이션으로 proxy해서 동작을 숨기기 보다 **의존성과 실행 흐름을 코드로 명확하게 드러내는 것(Explicit)**을 지향합니다.

이러한 관점에서 보면 'Go스러운' 트랜잭션 관리는 결국 **어디서 트랜잭션이 시작되고, 어떤 작업들이 같은 트랜잭션으로 묶이는지**를 호출하는 쪽에서 투명하게 알 수 있도록 만드는 것입니다.

따라서 새로운 시스템을 설계한다면 `TransactionProvider`나 `Role Interface`처럼 트랜잭션에 묶인 객체를 명시적으로 전달하는 방식이 Go의 철학에 가장 잘 부합합니다. 부득이하게 `Context` 전파 방식을 사용해야 한다면, 이는 암묵적인 의존성을 만드는 것임을 인지하고 전달 누락을 막기 위한 엄격한 규칙과 테스트를 병행해야 합니다.

프레임워크가 알아서 묶어주던 환경을 벗어나 트랜잭션을 직접 제어하는 것은 다소 번거로울 수 있습니다. 하지만 이로 인해 트랜잭션의 범위가 어디까지인지, 불필요하게 긴 시간 동안 DB 커넥션을 점유하고 있지는 않은지 개발자가 직접 고민하고 명시적으로 통제하게 된다는 점이 Go가 의도한 진짜 장점일 것입니다.

---

## 참고 자료

- [Go — Executing transactions](https://go.dev/doc/database/execute-transactions)
- [Go — context 패키지](https://pkg.go.dev/context)
- [Spring — 선언적 트랜잭션의 동작 방식](https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative/tx-decl-explained.html)
- [PocketBase — Transaction](https://pocketbase.io/docs/go-database/#transaction)
- [Gitea — models/db/context.go](https://github.com/go-gitea/gitea/blob/main/models/db/context.go)
