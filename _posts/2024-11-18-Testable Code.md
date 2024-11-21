---
title: Testable Code
description: 테스트가 쉽게 작성되고, 유지보수와 확장이 용이한 코드
author: ydj515
date: 2024-11-18 11:33:00 +0800
categories: [tdd, test, java]
tags: [tdd, test, testable]
pin: true
math: true
mermaid: true
image:
  path: /assets/img/testable/testing.png
  lqip: data:image/webp;base64,UklGRpoAAABXRUJQVlA4WAoAAAAQAAAADwAABwAAQUxQSDIAAAARL0AmbZurmr57yyIiqE8oiG0bejIYEQTgqiDA9vqnsUSI6H+oAERp2HZ65qP/VIAWAFZQOCBCAAAA8AEAnQEqEAAIAAVAfCWkAALp8sF8rgRgAP7o9FDvMCkMde9PK7euH5M1m6VWoDXf2FkP3BqV0ZYbO6NA/VFIAAAA
  alt: Testable Code
---

## Testable Code란?

**Testable Code**는 테스트가 쉽게 작성되고, 유지보수와 실행이 용이한 코드를 의미한다.  
즉, 코드의 동작을 다양한 테스트를 통해 검증할 수 있도록 작성된 코드이다.  
테스트 가능한 코드는 일반적으로 더 이해하기 쉽고, 재사용 가능하며, 버그 발생 가능성이 적다.

---

### Testable Code의 특징

#### 1. **분리된 관심사 (Separation of Concerns)**
- 코드가 **하나의 책임(Single Responsibility Principle)**을 가지며, 서로 독립적으로 동작한다.
- 한 컴포넌트가 변경되더라도 다른 컴포넌트에 영향을 주지 않는다.
- 특히 비즈니스 로직을 외부 시스템(데이터베이스, API 호출 등)과 분리하여 테스트 가능성을 높인다.
- 예시
    ```java
    public class OrderService {
        private final PaymentProcessor paymentProcessor;

        public OrderService(PaymentProcessor paymentProcessor) {
            this.paymentProcessor = paymentProcessor;
        }

        public boolean processOrder(Order order) {
            return paymentProcessor.process(order.getAmount());
        }
    }

    // 결제 처리와 관련된 로직을 별도 클래스로 분리
    // 외부 결제 시스템이라고 볼 수도 있음
    public class PaymentProcessor {
        public boolean process(double amount) {
            // 실제 결제 처리 로직
            // ...
            return amount > 0;
        }
    }

    @Test
    void testProcessOrder() {
        PaymentProcessor mockProcessor = mock(PaymentProcessor.class);
        when(mockProcessor.process(100.0)).thenReturn(true);

        OrderService orderService = new OrderService(mockProcessor);
        Order order = new Order(100.0);

        assertTrue(orderService.processOrder(order));
    }
    ```

#### 2. **의존성 주입 (Dependency Injection)**
- 의존성을 내부에서 직접 생성하지 않고 외부에서 주입한다.
- 테스트 시 **Mock 객체**를 주입하여 독립적인 테스트가 가능하다.

    ```java
    public class UserService {
        private final UserRepository userRepository;

        public UserService(UserRepository userRepository) {
            this.userRepository = userRepository; // 의존성을 외부에서 주입
        }

        public User findUserById(String userId) {
            return userRepository.findById(userId);
        }
    }

    @Test
    void testFindUserById() {
        UserRepository mockRepository = mock(UserRepository.class);
        UserService userService = new UserService(mockRepository);

        when(mockRepository.findById("123")).thenReturn(new User("123", "John"));

        User user = userService.findUserById("123");

        assertEquals("John", user.getName());
    }
    ```

#### 3. **작은 함수와 클래스**
- 하나의 함수 또는 클래스가 작고, 단일 책임을 가지도록 작성한다.
- 작은 단위로 작성된 코드는 개별 테스트가 쉽다.
- 예시
    ```java
    public class Calculator {
        public int add(int a, int b) {
            return a + b; // 단일 책임
        }

        public int multiply(int a, int b) {
            return a * b;
        }
    }

    @Test
    void testAdd() {
        Calculator calculator = new Calculator();
        assertEquals(5, calculator.add(2, 3));
    }

    @Test
    void testMultiply() {
        Calculator calculator = new Calculator();
        assertEquals(6, calculator.multiply(2, 3));
    }
    ```

#### 4. **상태와 입출력의 명확성**
- 함수가 상태를 변경하지 않고, **명시적인 입력과 출력**에 따라 동작한다. 즉, 함수가 내부 상태를 변경하지 않고, 결과를 반환하도록 작성한다.
- 이를 통해 함수가 외부 요소와 독립적으로 테스트 가능하다.

- 예시 1
    ```java
    // bad case
    // 이 함수는 호출될 때마다 count라는 내부 상태를 변경합
    // 이로 인해 함수의 동작이 호출 순서와 이전 호출 결과에 의존함
    // 테스트 중 함수 호출 횟수나 순서에 따라 결과가 달라질 수 있음
    public class Counter {
        private int count = 0; // 내부 상태

        public int increment() {
            count += 1; // 내부 상태를 변경
            return count;
        }
    }

    Counter counter = new Counter();
    counter.increment(); // 결과: 1
    counter.increment(); // 결과: 2

    // good case
    // 이 함수는 입력값(currentCount)만 사용하여 결과를 계산하고 반환하며 
    // 내부 상태를 변경하지 않으므로 함수는 완전히 독립적이며 부작용이 없음
    public class Counter {
        public int increment(int currentCount) {
            return currentCount + 1; // 입력값에만 의존하고 상태 변경 없음
        }
    }

    Counter counter = new Counter();
    int result1 = counter.increment(0); // 결과: 1
    int result2 = counter.increment(1); // 결과: 2
    ```

- 예시 2
    ```java
    // bad case
    // 상태(lastPrice)를 변경하기 때문에 다음과 같은 문제가 발생
    // 함수 호출 순서가 중요해짐
    // 함수가 외부의 상태에 의존하며, 테스트가 어려워짐
    public class DiscountCalculator {
        private double lastPrice; // 내부 상태

        public void applyDiscount(double price, double discountRate) {
            lastPrice = price * (1 - discountRate); // 내부 상태 변경
        }

        public double getLastPrice() {
            return lastPrice;
        }
    }

    // good case
    public class DiscountCalculator {
        public double applyDiscount(double price, double discountRate) {
            return price * (1 - discountRate);
        }
    }

    @Test
    void testApplyDiscount() {
        DiscountCalculator calculator = new DiscountCalculator();
        assertEquals(90.0, calculator.applyDiscount(100.0, 0.1), 0.001);
    }
    ```

#### 5. **테스트 더블의 활용**
- Mock, Stub, Fake 객체를 사용하여 의존성을 대체하고, 독립적인 테스트 환경을 구축한다.
- 예시
    ```java
    public class InventoryService {
        public boolean isAvailable(String productId) {
            // 재고 조회 로직
            // ....
            return true;
        }
    }

    // Mock을 사용한 테스트
    @Test
    void testInventoryCheck() {
        InventoryService mockInventoryService = mock(InventoryService.class);
        when(mockInventoryService.isAvailable("product123")).thenReturn(true);

        boolean result = mockInventoryService.isAvailable("product123");
        assertTrue(result);
    }
    ```

---

## Testable Code의 장점
### 1. 높은 유지보수성
테스트 가능성이 높은 코드는 쉽게 수정되고 확장될 수 있다.

### 2. 낮은 결합도
의존성이 분리된 코드는 독립적으로 테스트와 수정이 가능하다.

### 3. 높은 신뢰성
각 단위가 독립적으로 테스트되므로, 예상치 못한 오류를 사전에 방지할 수 있다.

### 4. 리팩토링의 용이성
테스트가 보장되므로 코드 변경 시 기존 기능의 안정성을 유지할 수 있다.

## 결론

Testable Code는 단순히 "테스트를 작성할 수 있는 코드"가 아니라, **테스트가 쉽게 작성되고, 유지보수와 확장이 용이한 코드를 의미**한다.

이를 위해 코드는 항상 단일 책임, 낮은 결합도, 명확한 입력과 출력을 갖추도록 설계되어야 한다.

테스트 가능한 코드를 작성함으로써, 개발자는 더 신뢰성 있는 소프트웨어를 빠르고 안정적으로 구축할 수 있다.

[출처]
https://www.testrail.com/blog/highly-testable-code/