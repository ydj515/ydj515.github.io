---
title: Spring AI Advisors API - 메모리, RAG, 가드, 로깅을 프롬프트 밖으로 끌어내기
description: Spring AI 시리즈 2편. Advisor 추상화의 의미, 순서 설계, advisor-context, ChatMemory.CONVERSATION_ID 같은 런타임 파라미터, CallAdvisor/BaseAdvisor를 직접 구현해 가드·프롬프트 보강·로깅을 다루는 패턴까지
author: ydj515
date: 2026-04-18 10:30:00 +0900
categories: [AI, spring]
tags: [spring ai, advisor, chat memory, call advisor, base advisor, custom advisor, safe guard]
mermaid: true
image:
  path: /assets/img/spring/logo.png
  lqip: data:image/webp;base64,UklGRpoAAABXRUJQVlA4WAoAAAAQAAAADwAABwAAQUxQSDIAAAARL0AmbZurmr57yyIiqE8oiG0bejIYEQTgqiDA9vqnsUSI6H+oAERp2HZ65qP/VIAWAFZQOCBCAAAA8AEAnQEqEAAIAAVAfCWkAALp8sF8rgRgAP7o9FDvMCkMde9PK7euH5M1m6VWoDXf2FkP3BqV0ZYbO6NA/VFIAAAA
  alt: spring
---

> 이 글은 **Spring AI 시리즈**의 2편입니다.
>
> - 1편: [Spring AI Basic — Prompt, Template, Structured Output](/posts/spring-ai-basic/)
> - 2편: Spring AI Advisors API (현재 글)
> - 3편: [Spring AI Tool Calling과 MCP](/posts/spring-ai-tool-mcp/)
> - 4편: [Spring AI Multimodal — 이미지, 오디오](/posts/spring-ai-multimodal/)
> - 5편: [Spring AI Embedding과 RAG 심화](/posts/spring-ai-rag/)

Spring AI에서 가장 자주 만지게 되는 추상화 중 하나가 **Advisors API**입니다.  
처음에는 그냥 "ChatClient 위에 끼우는 인터셉터"처럼 보이지만, 실제로는 다음과 같은 **횡단 관심사**를 깔끔하게 분리하는 자리입니다.

- 대화 메모리(`ChatMemory`)
- RAG 컨텍스트 주입
- 입력 검증 / 가드레일
- 로깅 / 트레이싱 / 메트릭
- 프롬프트 자동 보강

이 글은 Advisor를 단순히 사용하는 수준을 넘어, 순서 설계, advisor-context, 런타임 파라미터, `CallAdvisor`/`BaseAdvisor` 직접 구현까지 한 흐름으로 정리한 글입니다.

> springboot3 + java sample은 [github-sample](https://github.com/ydj515/sample-repository-example/tree/main/spring-ai-example)를 참조해주세요.

## 1. Advisors API란?

Spring AI에서 정말 중요한 추상화 중 하나가 `Advisors API`입니다.  
이 레이어는 모델 호출 전후를 가로채어 요청과 응답을 보강합니다.

문서 표현을 빌리면 Advisor는 요청/응답을 `intercept`, `modify`, `enhance`하는 역할을 합니다.

예를 들어 이런 작업을 Advisor로 분리할 수 있습니다.

- 대화 메모리 주입
- RAG 컨텍스트 주입
- 안전성 필터링
- 반복적인 프롬프트 보강
- 요청/응답 로깅

### 메모리 관점에서 보면 더 이해가 쉽다

위키독스의 [Memory 활용 대화 에이전트 실습](https://wikidocs.net/323541)에서는 `ChatMessageHistory`를 프롬프트에 수동으로 넣어 대화 기록을 유지하는 흐름을 보여줍니다.  
핵심 메시지는 단순합니다.

- 기억이 없는 체인은 매번 처음 만나는 안내원처럼 동작합니다.
- 메모리가 있는 체인은 이전 대화를 참고하는 개인 비서처럼 동작합니다.

Spring AI에서는 이 개념이 `ChatMemory`와 `MessageChatMemoryAdvisor`로 자연스럽게 연결됩니다.

```java
ChatMemory chatMemory = MessageWindowChatMemory.builder()
    .maxMessages(20)
    .build();

ChatClient chatClient = ChatClient.builder(chatModel)
    .defaultAdvisors(MessageChatMemoryAdvisor.builder(chatMemory).build())
    .build();
```

즉, 위키독스에서 수동으로 `history`를 프롬프트에 주입하던 패턴을, Spring AI에서는 Advisor 계층으로 끌어올려 재사용 가능한 정책으로 만들 수 있습니다.

### RAG도 같은 패턴으로 이해할 수 있다

메모리가 "이전 대화"를 주입하는 것이라면, RAG는 "외부 지식"을 주입하는 것입니다.  
Spring AI에서는 `QuestionAnswerAdvisor` 같은 Advisor로 이 흐름을 구성할 수 있습니다.

```java
var chatClient = ChatClient.builder(chatModel)
    .defaultAdvisors(
        MessageChatMemoryAdvisor.builder(chatMemory).build(),
        QuestionAnswerAdvisor.builder(vectorStore).build()
    )
    .build();
```

여기서 포인트는 프롬프트 자체를 매번 수작업으로 고치지 않아도 된다는 것입니다.  
메모리, 검색 문맥, 안전성 같은 공통 정책을 Advisor로 분리해두면, 애플리케이션이 커져도 구조가 유지됩니다.

## 2. Advisor 순서가 왜 중요한가?

이 부분은 꼭 한 번 짚고 넘어가야 합니다.  
공식 문서 기준으로 Advisor는 `getOrder()` 값이 낮을수록 **요청(request)에서는 먼저 실행되고**, **응답(response)에서는 나중에 실행**됩니다.

즉 체감상 아래처럼 동작합니다.

- 요청 흐름: 앞에 있는 Advisor -> 뒤에 있는 Advisor -> 모델 호출
- 응답 흐름: 모델 응답 -> 뒤에 있는 Advisor -> 앞에 있는 Advisor

이걸 가장 단순하게 보여주는 예시는 아래와 같습니다.

```java
public class TraceAdvisor implements CallAdvisor {

    private final String name;
    private final int order;

    public TraceAdvisor(String name, int order) {
        this.name = name;
        this.order = order;
    }

    @Override
    public String getName() {
        return this.name;
    }

    @Override
    public int getOrder() {
        return this.order;
    }

    @Override
    public ChatClientResponse adviseCall(ChatClientRequest request, CallAdvisorChain chain) {
        System.out.println("[" + name + "] before");
        ChatClientResponse response = chain.nextCall(request);
        System.out.println("[" + name + "] after");
        return response;
    }
}
```

그리고 다음처럼 등록합니다.

```java
ChatClient chatClient = ChatClient.builder(chatModel)
    .defaultAdvisors(
        new TraceAdvisor("A", 0),
        new TraceAdvisor("B", 100)
    )
    .build();
```

이때 실제 실행 흐름은 아래처럼 됩니다.

1. `A before`
2. `B before`
3. ChatModel 호출
4. `B after`
5. `A after`

즉 Advisor 체인은 리스트처럼 보이지만, 실제 실행은 **스택처럼 감싸는 구조**입니다.  
이 개념이 중요한 이유는 메모리, RAG, 로깅, 가드레일이 서로 영향을 주기 때문입니다.

### 실제로 순서가 달라지면 어떤 문제가 생길까?

아래와 같은 대화 상황을 생각해보겠습니다.

1. 사용자가 첫 질문에서 `"우리 서비스는 PostgreSQL 기준으로 설명해줘."` 라고 말함
2. 다음 질문에서 `"인덱스 설계 주의점 정리해줘."` 라고 말함

이제 우리는 두 번째 질문을 받을 때,

- 이전 대화 맥락도 반영하고 싶고
- 벡터 스토어에서 관련 문서도 찾고 싶습니다

그래서 보통 이런 구성을 하게 됩니다.

```java
ChatClient chatClient = ChatClient.builder(chatModel)
    .defaultAdvisors(
        MessageChatMemoryAdvisor.builder(chatMemory).build(),
        QuestionAnswerAdvisor.builder(vectorStore).build(),
        new SimpleLoggerAdvisor()
    )
    .build();
```

이 구성이 의도하는 실제 흐름은 아래와 같습니다.

1. `MessageChatMemoryAdvisor`가 이전 대화를 프롬프트에 추가합니다.
2. `QuestionAnswerAdvisor`가 현재 질문 + 이전 대화 맥락을 참고해 벡터 검색을 수행합니다.
3. 검색된 문서가 프롬프트에 포함된 상태로 모델이 호출됩니다.
4. 모델 응답이 돌아오면 `QuestionAnswerAdvisor`가 자신의 컨텍스트를 응답에 반영합니다.
5. 마지막으로 메모리 Advisor가 이번 대화 내용을 메모리에 반영합니다.

이 순서가 중요한 이유는 `QuestionAnswerAdvisor`가 검색할 때 참고하는 입력이 달라지기 때문입니다.

- 메모리 먼저 -> 검색 질문이 `"PostgreSQL 기준 인덱스 설계 주의점"`에 가까워짐
- RAG 먼저 -> 검색 질문이 그냥 `"인덱스 설계 주의점"`에 머무를 가능성이 커짐

즉, 메모리보다 RAG가 먼저 실행되면 **벡터 검색 단계에서 중요한 맥락이 빠질 수 있습니다.**

### 잘못 배치한 경우

예를 들어 이렇게 구성하면 문제가 생길 수 있습니다.

```java
ChatClient chatClient = ChatClient.builder(chatModel)
    .defaultAdvisors(
        QuestionAnswerAdvisor.builder(vectorStore).build(),
        MessageChatMemoryAdvisor.builder(chatMemory).build()
    )
    .build();
```

이 경우 의도상 흐름은 다음처럼 흘러갑니다.

1. 먼저 `QuestionAnswerAdvisor`가 검색을 시도합니다.
2. 아직 메모리가 붙기 전이라, 검색에는 현재 질문만 반영될 수 있습니다.
3. 그 뒤에 `MessageChatMemoryAdvisor`가 대화 이력을 붙입니다.
4. 모델은 대화 이력이 들어간 프롬프트를 받더라도, **이미 검색은 덜 정확한 상태로 끝난 뒤**일 수 있습니다.

이런 상황에서는 모델이 Postgres보다 MySQL이나 일반적인 DB 문서를 섞어서 답할 가능성이 커집니다.

### 로깅 Advisor는 어디에 두는 게 좋을까?

`SimpleLoggerAdvisor` 같은 로깅 Advisor도 순서에 따라 보는 정보가 달라집니다.

- 앞쪽에 두면: 거의 원본에 가까운 요청을 먼저 볼 수 있습니다.
- 뒤쪽에 두면: 메모리/RAG가 적용된 뒤의 요청을 볼 수 있습니다.

즉 "무엇을 디버깅하고 싶은가"에 따라 위치가 달라집니다.

- 원본 사용자 입력을 보고 싶다 -> 앞쪽
- 최종적으로 모델에 들어간 완성 프롬프트를 보고 싶다 -> 뒤쪽

그래서 Advisor 순서를 정할 때는 단순히 보기 좋게 나열하는 것이 아니라, **어떤 데이터가 어느 시점에 준비되어 있어야 하는지**를 기준으로 생각해야 합니다.

정리하면 실무에서는 보통 아래 순서 감각이 유용합니다.

1. 원본 요청 검사 / 입력 보강
2. 메모리 주입
3. RAG / 검색 문맥 주입
4. 로깅 또는 응답 후처리

물론 모든 경우의 정답은 아니지만, 적어도 "검색 전에 필요한 컨텍스트가 다 들어왔는가?"를 기준으로 보면 대부분 방향을 잘 잡을 수 있습니다.

## 3. ChatClientResponse와 advisor-context

Spring AI 공식 문서에서 `ChatClientRequest`와 `ChatClientResponse`는 둘 다 advisor `context`를 가진다고 설명합니다.  
이 context는 advisor 체인 전체에서 공유되는 내부 상태 저장소처럼 생각하면 됩니다.

핵심은 아래 두 가지입니다.

- `ChatClientRequest.context()`는 요청 단계에서 advisor끼리 상태를 공유할 때 사용합니다.
- `ChatClientResponse.context()`는 응답 단계에서 앞선 advisor가 남긴 상태를 읽을 때 사용합니다.

그리고 이 context는 **기본적으로 immutable**하게 다뤄집니다.  
즉 직접 수정하는 것이 아니라 `mutate().context(...)`로 새 요청/응답 객체를 만들어 넘기는 방식입니다.

예를 들어 `tenantId`, `traceId`, `retrievalCount` 같은 내부 정보를 advisor 체인에서만 돌리고 싶다고 해보겠습니다.

```java
public class TenantTraceAdvisor implements CallAdvisor {

    @Override
    public String getName() {
        return "tenant-trace-advisor";
    }

    @Override
    public int getOrder() {
        return 10;
    }

    @Override
    public ChatClientResponse adviseCall(ChatClientRequest request, CallAdvisorChain chain) {
        ChatClientRequest enrichedRequest = request.mutate()
            .context("tenantId", "acme")
            .context("traceId", "trace-123")
            .build();

        ChatClientResponse response = chain.nextCall(enrichedRequest);

        Integer retrievalCount = (Integer) response.context().getOrDefault("retrievalCount", 0);

        return response.mutate()
            .context("handledBy", "TenantTraceAdvisor")
            .context("retrievalCount", retrievalCount)
            .build();
    }
}
```

이 예시에서 중요한 점은 `tenantId`나 `traceId`를 곧바로 LLM 프롬프트에 넣지 않았다는 것입니다.  
즉 이 값들은 advisor 체인 내부에서만 공유되는 메타데이터로 쓸 수 있습니다.

다른 Advisor가 이 값을 이어서 쓰는 것도 가능합니다.

```java
public class RetrievalCountAdvisor implements CallAdvisor {

    @Override
    public String getName() {
        return "retrieval-count-advisor";
    }

    @Override
    public int getOrder() {
        return 20;
    }

    @Override
    public ChatClientResponse adviseCall(ChatClientRequest request, CallAdvisorChain chain) {
        String tenantId = (String) request.context().get("tenantId");

        // tenantId를 기반으로 다른 vector store, 필터, index를 선택할 수 있음
        ChatClientResponse response = chain.nextCall(request);

        return response.mutate()
            .context("retrievalCount", 3)
            .context("resolvedTenant", tenantId)
            .build();
    }
}
```

이렇게 하면 응답을 꺼내는 쪽에서도 `ChatClientResponse`를 통해 advisor chain 내부 정보를 함께 볼 수 있습니다.

```java
ChatClientResponse response = chatClient.prompt()
    .advisors(
        new TenantTraceAdvisor(),
        new RetrievalCountAdvisor()
    )
    .user("우리 팀 문서 기준으로 Spring AI MCP 도입 포인트를 요약해줘.")
    .call()
    .chatClientResponse();

String answer = response.chatResponse().getResult().getOutput().getText();
String tenantId = (String) response.context().get("resolvedTenant");
Integer retrievalCount = (Integer) response.context().get("retrievalCount");
```

이 패턴은 특히 아래 같은 경우에 유용합니다.

- tenant별 검색 인덱스 선택
- traceId, correlationId 전달
- 내부 감사 로그용 메타데이터 전달
- 응답 후 메트릭 계산

중요한 점은 `advise-context`와 prompt는 다르다는 것입니다.  
advisor context에 저장했다고 해서 자동으로 LLM이 그 값을 보는 것은 아닙니다. 정말 모델에게 보여주고 싶다면 advisor가 직접 prompt를 수정해야 합니다.

즉 아래처럼 구분하면 헷갈림이 줄어듭니다.

| 위치 | 용도 | LLM에 전달되나 |
| --- | --- | --- |
| Prompt 파라미터 | 모델이 읽어야 하는 실제 지시/문맥 | 전달됨 |
| Advisor context | advisor 체인 내부 상태 공유 | 자동 전달되지 않음 |
| ToolContext | tool 실행 시 필요한 내부 정보 | 전달되지 않음 |

## 4. 런타임 advisor 파라미터: `ChatMemory.CONVERSATION_ID`

advisor를 Bean으로 등록해두더라도, 실제 호출마다 바뀌는 값은 런타임에 넘겨야 하는 경우가 많습니다.  
그 대표적인 예시가 `ChatMemory.CONVERSATION_ID`입니다.

공식 문서 기준 `ChatMemory.CONVERSATION_ID`는 advisor context에서 대화 식별자를 꺼내기 위한 키입니다.  
즉 같은 `MessageChatMemoryAdvisor`를 쓰더라도, 어떤 대화방의 메모리를 읽고 쓸지 호출 시점에 정할 수 있습니다.

```java
ChatMemory chatMemory = MessageWindowChatMemory.builder()
    .maxMessages(20)
    .build();

ChatClient chatClient = ChatClient.builder(chatModel)
    .defaultAdvisors(MessageChatMemoryAdvisor.builder(chatMemory).build())
    .build();

String conversationId = "room-42";

String answer = chatClient.prompt()
    .advisors(a -> a.param(ChatMemory.CONVERSATION_ID, conversationId))
    .user("내가 방금 전에 뭐 물어봤는지 기억해?")
    .call()
    .content();
```

이 코드는 의미상 아래처럼 동작합니다.

1. `MessageChatMemoryAdvisor`는 advisor parameter에서 `ChatMemory.CONVERSATION_ID`를 찾습니다.
2. 값이 `room-42`라면 해당 대화방의 메모리만 조회합니다.
3. 응답이 끝나면 같은 `room-42` 메모리에 현재 대화 내용을 저장합니다.

즉 conversation ID를 제대로 분리해야 사용자 A와 사용자 B의 대화가 섞이지 않습니다.

### 왜 conversation ID 분리가 중요한가?

예를 들어 같은 서버에서 여러 사용자의 요청을 처리한다고 해보겠습니다.

- 사용자 A: "내 이름은 철수야"
- 사용자 B: "내 이름은 영희야"

이때 conversation ID를 제대로 분리하지 않으면, 다음 질의에서 메모리가 엉킬 수 있습니다.

```java
String answer = chatClient.prompt()
    .advisors(a -> a.param(ChatMemory.CONVERSATION_ID, "user-a"))
    .user("내 이름이 뭐였지?")
    .call()
    .content();
```

위처럼 사용자별 또는 세션별 conversation ID를 명시해두면, 메모리는 `user-a` 범위 안에서만 조회됩니다.

실무에서는 보통 아래 기준으로 conversation ID를 잡습니다.

- 웹 서비스 채팅창: `sessionId`
- 로그인 사용자 단위: `userId`
- 팀/채널 대화: `workspaceId:channelId`
- 고객 상담 건별: `ticketId`

### 기본 conversation ID에만 의존하면 왜 위험할까?

`ChatMemory`에는 `DEFAULT_CONVERSATION_ID`도 존재합니다.  
하지만 운영 환경에서는 기본값에만 의존하기보다, **반드시 호출별 conversation ID를 명시적으로 넣는 편이 안전합니다.**

특히 멀티유저 환경에서는 이 값이 빠지면 메모리 분리 전략이 불명확해지고, 대화가 섞일 위험이 생깁니다.

### 다른 advisor 파라미터와 같이 쓰기

Spring AI에서는 advisor parameter를 여러 개 함께 넣을 수 있습니다.

```java
ActorFilms actorFilms = chatClient.prompt()
    .advisors(a -> a.param(ChatMemory.CONVERSATION_ID, "user-100"))
    .advisors(AdvisorParams.ENABLE_NATIVE_STRUCTURED_OUTPUT)
    .user("Tom Hanks 영화 5개를 actor와 movies 구조로 정리해줘.")
    .call()
    .entity(ActorFilms.class);
```

즉 한 호출 안에서

- 메모리 분리용 advisor 파라미터
- structured output 활성화 파라미터

를 함께 조합할 수 있습니다.

## 5. Custom Advisor 직접 만들어보기

기본 제공되는 `MessageChatMemoryAdvisor`, `QuestionAnswerAdvisor`, `SimpleLoggerAdvisor` 만으로 대부분의 요구는 커버됩니다.  
하지만 실제 서비스에서는 곧 다음과 같은 요구가 생깁니다.

- 너무 짧은 질문은 LLM에 보내지 말고 빠르게 차단하고 싶다.
- 모델이 질문을 더 잘 이해하도록 프롬프트 자체를 보강하고 싶다.
- 민감 단어가 포함된 요청은 자동 차단하고 정해진 메시지를 응답하고 싶다.
- 요청과 응답을 통째로 로그로 남기되, 어떤 advisor는 raw payload, 어떤 advisor는 핵심 텍스트만 남기게 분리하고 싶다.

이 요구들은 모두 `CallAdvisor`, `StreamAdvisor`, `BaseAdvisor`를 직접 구현해서 해결할 수 있습니다.

### 1) 입력 가드: `CheckCharSizeAdvisor`

`CallAdvisor`만 구현해서 "조건이 안 맞으면 LLM에 보내기 전 예외를 던지는" 가장 단순한 형태입니다.

```java
// 사용자 질문 길이가 너무 짧으면 LLM 호출 전에 예외를 던지는 advisor
@Slf4j
public class CheckCharSizeAdvisor implements CallAdvisor {

    @Override
    public ChatClientResponse adviseCall(ChatClientRequest request, CallAdvisorChain chain) {
        // 호출 전 길이 검증
        String userText = request.prompt().getUserMessage().getText();
        if (userText.length() < 2) {
            log.warn("prompt size too short. length={}", userText.length());
            throw new PromptTooShortException("Char size too short");
        }
        // 정상이면 체인을 그대로 이어서 LLM 호출
        return chain.nextCall(request);
    }

    @Override
    public String getName() {
        return this.getClass().getSimpleName();
    }

    @Override
    public int getOrder() {
        // 입력 검증은 가장 앞쪽에서 동작해야 하므로 최상위 우선순위
        return Ordered.HIGHEST_PRECEDENCE;
    }
}
```

여기서 던진 `PromptTooShortException`은 일반 Spring MVC와 동일하게 `@RestControllerAdvice`로 잡아 사용자에게 정형화된 에러를 돌려주면 됩니다.  
즉 Advisor는 "비즈니스 가드"를 LLM 호출 앞에 두는 자리로 쓸 수 있다는 게 포인트입니다.

> Advisor에서 예외를 던지는 방식은 `call()` 흐름에서는 자연스럽지만, `stream()` 흐름에서는 사용자가 토큰을 받기 시작한 뒤에는 효과가 떨어집니다.  
> 그래서 입력 가드는 보통 stream 시작 전, 즉 `before` 시점에 두는 것이 안전합니다.

### 2) 프롬프트 보강: `ReReadingAdvisor` (Re2 패턴)

`BaseAdvisor`를 구현하면 `before`/`after` 훅으로 요청·응답을 자연스럽게 변형할 수 있습니다.  
다음 예시는 "사용자 질문을 한 번 더 읽도록" 모델에게 강제하는 Re-Reading 프롬프트 패턴을 advisor로 만든 것입니다.

```java
public class ReReadingAdvisor implements BaseAdvisor {

    // 사용자 질문을 한 번 더 반복해 LLM이 핵심 의도를 다시 읽도록 유도
    private static final String DEFAULT_RE2_ADVISE_TEMPLATE = """
            {re2_input_query}
            Read the question again: {re2_input_query}
            """;

    private final String re2AdviseTemplate;
    private int order = 0;

    public ReReadingAdvisor() {
        this(DEFAULT_RE2_ADVISE_TEMPLATE);
    }

    public ReReadingAdvisor(String re2AdviseTemplate) {
        this.re2AdviseTemplate = re2AdviseTemplate;
    }

    @Override
    public ChatClientRequest before(ChatClientRequest request, AdvisorChain chain) {
        // PromptTemplate으로 사용자 메시지를 다시 렌더링
        String augmentedUserText = PromptTemplate.builder()
                .template(this.re2AdviseTemplate)
                .variables(Map.of("re2_input_query", request.prompt().getUserMessage().getText()))
                .build()
                .render();

        // augmentUserMessage로 user message만 교체한 새 prompt를 만들어 체인에 흘려보냄
        return request.mutate()
                .prompt(request.prompt().augmentUserMessage(augmentedUserText))
                .build();
    }

    @Override
    public ChatClientResponse after(ChatClientResponse response, AdvisorChain chain) {
        return response;
    }

    @Override
    public int getOrder() {
        return this.order;
    }
}
```

`BaseAdvisor`의 장점은 다음과 같습니다.

- `before`/`after`만 구현하면 되므로 call/stream 두 흐름 모두 자동으로 처리됩니다.
- 요청 변형(`mutate()`), 응답 변형 둘 다 자연스럽게 표현할 수 있습니다.
- "프롬프트를 살짝 보강하는 횡단 정책"에 가장 잘 어울립니다.

### 3) 정책 객체로 분리하기: `SafeGuardPolicy`

가드레일을 advisor로 만들 때 흔히 빠지는 함정이 있습니다.  
**"민감 단어 목록을 advisor 안에 하드코딩"** 하는 패턴인데, 이 경우 정책 변경마다 코드를 고치고 배포해야 합니다.

샘플 레포는 정책을 `record`로 분리해서 advisor가 정책 자체를 주입받게 합니다.

```java
public record SafeGuardPolicy(List<String> sensitiveWords, String blockedMessage) {

    public static final String DEFAULT_BLOCKED_MESSAGE = "사용자의 질문에 문제가 있는 단어가 있으면 시스템에 요청 할수 없습니다.";

    // 외부 리소스(텍스트 파일)에서 민감 단어 목록을 로드
    public static SafeGuardPolicy fromResource(Resource resource) {
        try {
            String content = resource.getContentAsString(StandardCharsets.UTF_8);
            List<String> words = content.lines()
                    .map(String::trim)
                    .filter(line -> !line.isEmpty())
                    .filter(line -> !line.startsWith("#"))
                    .toList();
            if (words.isEmpty()) {
                throw new IllegalStateException("SafeGuard 민감 단어 목록이 비어 있습니다.");
            }
            return new SafeGuardPolicy(words, DEFAULT_BLOCKED_MESSAGE);
        }
        catch (IOException exception) {
            throw new UncheckedIOException("SafeGuard 민감 단어 목록을 읽을 수 없습니다.", exception);
        }
    }
}
```

그리고 정책 자체를 `@Bean`으로 노출합니다.

```java
@Configuration
public class AdvisorConfig {

    // 민감 단어 목록을 외부 파일에서 로드하여 정책 Bean으로 제공
    @Bean
    SafeGuardPolicy safeGuardPolicy(
            @Value("classpath:advisors/sensitive-words.txt") Resource sensitiveWordsResource) {
        return SafeGuardPolicy.fromResource(sensitiveWordsResource);
    }
}
```

이 구조의 장점은 명확합니다.

- 민감 단어 목록 같은 정책은 **데이터**, advisor는 **행동** 이라는 책임 분리가 가능합니다.
- 정책 데이터가 코드에서 분리되니, 운영 중 갱신이 쉬워집니다.
- 같은 정책을 여러 advisor가 공유할 수 있습니다.

> 보안성이 매우 중요한 가드 정책은 단순 단어 매칭만으로는 부족할 수 있으므로, 운영 단계에서는 별도 검출 모델이나 정책 엔진과 조합하는 편이 안전합니다.

### 4) 같은 역할, 다른 추상화 레벨: `SimpleLoggerAdvisorHigh` vs `SimpleLoggerAdvisorLow`

같은 "로깅 advisor"라도, 어디까지 로그로 남길지에 따라 구현이 달라집니다.

```java
// 요청/응답 객체 전체를 통째로 출력 (raw payload 디버깅용)
@Slf4j
public class SimpleLoggerAdvisorHigh implements CallAdvisor, StreamAdvisor {

    @Override
    public ChatClientResponse adviseCall(ChatClientRequest request, CallAdvisorChain chain) {
        log.info("SimpleLoggerAdvisorHigh request: {}", request);
        ChatClientResponse response = chain.nextCall(request);
        log.info("SimpleLoggerAdvisorHigh response: {}", response);
        return response;
    }

    @Override
    public Flux<ChatClientResponse> adviseStream(ChatClientRequest request, StreamAdvisorChain chain) {
        log.info("SimpleLoggerAdvisorHigh request: {}", request);
        // 스트림 응답은 ChatClientMessageAggregator로 모아서 한 번에 로깅
        return new ChatClientMessageAggregator()
                .aggregateChatClientResponse(chain.nextStream(request),
                        res -> log.info("SimpleLoggerAdvisorHigh response: {}", res));
    }

    @Override
    public int getOrder() {
        return Ordered.HIGHEST_PRECEDENCE + 1;
    }
}
```

```java
// System / User / Assistant 메시지 텍스트만 깔끔하게 추출해서 출력
@Slf4j
public class SimpleLoggerAdvisorLow implements CallAdvisor, StreamAdvisor {

    @Override
    public ChatClientResponse adviseCall(ChatClientRequest request, CallAdvisorChain chain) {
        String systemMessage = request.prompt().getSystemMessage().getText();
        String userMessage = request.prompt().getUserMessage().getText();
        log.info("System Message: {}, User Message: {}", systemMessage, userMessage);
        ChatClientResponse response = chain.nextCall(request);
        String content = Objects.requireNonNull(response.chatResponse())
                .getResult().getOutput().getText();
        log.info("Response Message: {}", content);
        return response;
    }

    @Override
    public int getOrder() {
        // High보다 안쪽에 위치 → 메모리/RAG 등이 적용된 최종 프롬프트를 본다
        return Ordered.HIGHEST_PRECEDENCE + 3;
    }
}
```

같은 "로깅"이지만 두 advisor는 보는 그림이 다릅니다.

- `High`: 거의 원본에 가까운 요청을 보고 싶을 때 (raw payload 디버깅)
- `Low`: 메모리/RAG가 다 붙은 뒤의 실제 텍스트를 보고 싶을 때

즉 advisor는 "무엇을 로깅하는가"보다 **"체인의 어느 위치에서 보는가"** 가 더 중요합니다.

### Call vs Stream vs Base — 어떤 걸 구현해야 할까?

샘플 레포 advisor들을 보면 인터페이스 선택 기준이 보입니다.

| 구현 인터페이스 | 적합한 경우 | 예시 |
| --- | --- | --- |
| `CallAdvisor` | call 흐름만 처리, 가드/예외/단순 로깅 | `CheckCharSizeAdvisor` |
| `CallAdvisor` + `StreamAdvisor` | call/stream 둘 다 동일하게 처리, 스트림은 `aggregator`로 모아 처리 | `SimpleLoggerAdvisorHigh/Low` |
| `BaseAdvisor` | `before`/`after`만 구현해 요청·응답을 자연스럽게 변형 | `ReReadingAdvisor` |

실무 감각으로는 다음이 잘 맞습니다.

- 입력 검증/차단 → `CallAdvisor` 단독
- 프롬프트 변형 → `BaseAdvisor`
- 요청/응답 관찰(로깅/메트릭) → `CallAdvisor` + `StreamAdvisor` + `ChatClientMessageAggregator`

### Custom Advisor를 만들 때 자주 빠지는 함정

- `Ordered.HIGHEST_PRECEDENCE`로 막 도배하면 어떤 advisor가 먼저인지 알 수 없습니다. 가드/로깅/메모리/RAG 순서로 의도적으로 격자를 잡아야 합니다.
- `stream` 응답을 한 토큰씩 로깅하면 로그가 폭증합니다. 반드시 `ChatClientMessageAggregator`로 모아서 한 번에 로깅하는 편이 좋습니다.
- 정책 데이터(민감 단어, 화이트리스트 등)는 advisor 클래스 내부가 아니라 외부 리소스/Bean으로 분리하는 편이 운영에 유리합니다.
- advisor에서 prompt를 직접 갈아끼울 때는 반드시 `request.mutate().prompt(...)`로 새 객체를 만들어 흘려야 합니다. 원본을 직접 수정하면 immutability를 깨뜨려 옆 advisor가 영향을 받습니다.

## 정리

Advisor는 "ChatClient 호출을 가로채는 인터셉터"라는 단순한 추상화로 시작하지만, 운영 단계로 갈수록 다음을 결정하는 핵심 자리가 됩니다.

- 어디에 메모리/RAG/가드/로깅을 끼울 것인가
- 순서를 어떻게 잡을 것인가 (`getOrder()`)
- 어떤 정보를 prompt에 넣고, 어떤 정보를 advisor-context로만 흘릴 것인가
- 어떤 정보는 호출 시점에 advisor 파라미터로 넘길 것인가 (`ChatMemory.CONVERSATION_ID`)

샘플 레포의 `CheckCharSizeAdvisor`, `ReReadingAdvisor`, `SafeGuardPolicy`, `SimpleLoggerAdvisorHigh/Low`는 각각 **가드 / 프롬프트 보강 / 정책 객체 분리 / 같은 역할 다른 위치** 라는 네 가지 패턴을 보여줍니다. 처음 직접 advisor를 만들 때는 이 네 가지 중 하나에서 시작하는 것이 가장 안전합니다.

## 다음 글

- [3편 — Spring AI Tool Calling과 MCP](/posts/spring-ai-tool-mcp/)
- [4편 — Spring AI Multimodal: 이미지와 오디오](/posts/spring-ai-multimodal/)
- [5편 — Spring AI Embedding과 RAG 심화](/posts/spring-ai-rag/)

이전 글이 궁금하다면:

- [1편 — Spring AI Basic](/posts/spring-ai-basic/)

## 출처

- [Spring AI Advisors API](https://docs.spring.io/spring-ai/reference/api/advisors.html)
- [Spring AI Chat Memory](https://docs.spring.io/spring-ai/reference/api/chat-memory.html)
- [Spring AI Chat Client API](https://docs.spring.io/spring-ai/reference/api/chatclient.html)
- [위키독스 - Memory 활용 대화 에이전트 (실습)](https://wikidocs.net/323541)
