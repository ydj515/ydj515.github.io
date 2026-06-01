---
title: "agentgateway 오픈소스 기여기: Playground stateless MCP route 버그 수정하기"
description: 버그를 발견하고 GitHub Issue를 작성한 뒤 리뷰 피드백을 반영해 PR을 머지하기까지의 과정
author: ydj515
date: 2026-04-26 20:30:00 +0900
categories: [OpenSource, GitHub, MCP]
tags: [agentgateway, mcp, open source, github issue, pull request, streamable http, troubleshooting]
mermaid: true
image:
  path: /assets/img/agentgateway/logo.png
  lqip: data:image/webp;base64,UklGRpoAAABXRUJQVlA4WAoAAAAQAAAADwAABwAAQUxQSDIAAAARL0AmbZurmr57yyIiqE8oiG0bejIYEQTgqiDA9vqnsUSI6H+oAERp2HZ65qP/VIAWAFZQOCBCAAAA8AEAnQEqEAAIAAVAfCWkAALp8sF8rgRgAP7o9FDvMCkMde9PK7euH5M1m6VWoDXf2FkP3BqV0ZYbO6NA/VFIAAAA
  alt: agentgateway
---

[agentgateway](https://github.com/agentgateway/agentgateway)를 사용하다가 발견한 Playground 버그를 GitHub Issue로 등록하고, Pull Request를 올리고, 리뷰 피드백을 반영해 최종적으로 머지되기까지의 과정을 정리합니다.

- Issue: [Playground does not support stateless MCP routes #1434](https://github.com/agentgateway/agentgateway/issues/1434)
- 첫 번째 PR: [FIX #1434: support stateless MCP routes in playground #1435](https://github.com/agentgateway/agentgateway/pull/1435)
- 최종 PR: [fix(ui): support stateless MCP routes in playground #1595](https://github.com/agentgateway/agentgateway/pull/1595)

![Issue #1434](/assets/img/agentgateway/issue-1434.png)

## 전체 흐름

먼저 이번 기여의 흐름을 시간순으로 정리하면 다음과 같습니다.

1. stateless MCP route가 Playground에서 동작하지 않는 문제를 발견하고 issue 등록
2. 기존 SSE 흐름을 유지하면서 stateless만 추가 지원하는 방향으로 PR 등록
3. 리뷰 과정에서 maintainer가 Playground의 MCP 연결 방식은 기존 SSE 흐름을 유지하기보다 Streamable HTTP 기반으로 정리하는 것이 더 적절하다는 피드백을 줌
4. 그 피드백을 반영해 기존 PR은 닫고, SSE 흐름을 제거한 새 PR를 다시 등록
5. 최종적으로 새 PR merge

정리하면 첫 번째 PR은 "기존 동작을 유지하면서 stateless만 추가 지원하자"는 접근이었고, 최종 PR은 "Playground의 MCP 연결은 Streamable HTTP로 통일하자"는 접근이었습니다.

> 이 과정에서 maintainer와 소통하면서 차이가 이번 기여에서 가장 중요한 지점이었습니다.

## 문제 상황

agentgateway는 MCP 서버를 연결하고 테스트할 수 있는 Playground UI를 제공합니다. 원래는 여기서 MCP route를 선택해 연결하면, Playground가 MCP 클라이언트처럼 동작하면서 서버의 tool 목록을 보여줘야 합니다.

이번에는 backend를 `statefulMode: stateless`로 설정해 두었습니다. 이 경우 Playground도 이 route를 `/mcp` endpoint의 Streamable HTTP 연결로 다뤄야 했습니다. 그런데 실제로는 route를 선택하고 연결을 시도해도 tool 목록이 보이지 않았고, Playground는 연결에 실패했습니다.

> 여기서 stateless mode는 서버가 클라이언트별 연결 상태나 세션을 오래 유지하지 않고, 각 요청을 가능한 독립적으로 처리하는(SSE처럼 세션을 유지하지 않는) 방식입니다.
{:.prompt-info}

- agentgateway.yaml

```yaml
routes:
  - backends:
      - mcp:
          statefulMode: stateless
          targets:
            - name: example-mcp
              mcp:
                host: http://localhost:8082/mcp
```

설정은 이렇게 해두었는데, 실제 로그를 보니 Playground는 `/mcp`가 아니라 `/sse`로 요청을 보내고 있었습니다.

```text
POST /sse?sessionId=... -> 405 Method Not Allowed
```

즉 stateless route를 선택했는데도 Playground는 여전히 기존 SSE 흐름 기준으로 동작하고 있었던 것입니다.

| 구분                | 기대 동작                     | 실제 동작              |
| ------------------- | ----------------------------- | ---------------------- |
| stateless MCP route | `/mcp` endpoint로 연결        | `/sse` endpoint로 연결 |
| MCP transport       | Streamable HTTP               | SSE                    |
| 결과                | Playground에서 tool 조회 가능 | 연결 실패              |

조금 더 코드 관점에서 보면 문제는 다음 두 가지였습니다.

1. MCP 연결 코드가 `SSEClientTransport`를 사용하도록 고정
2. endpoint를 만들 때 선택된 route의 실제 MCP endpoint를 보지 않고 Playground route endpoint 뒤에 `/sse`를 붙이는 방식

> 즉 stateless MCP route를 선택해도 UI 내부에서는 아래와 같은 흐름으로 연결을 시도했습니다.

```text
selected route endpoint
  -> append /sse
  -> create SSE transport
  -> connect MCP client
```

하지만 stateless MCP route에서 필요한 흐름은 아래에 더 가깝습니다.

```text
selected route endpoint
  -> resolve /mcp endpoint
  -> create Streamable HTTP transport
  -> connect MCP client
```

경로와 transport가 동시에 맞아야 하므로, 단순히 `/sse`를 `/mcp`로 바꾸는게 아니라 클라이언트 transport 자체도 SSE에서 Streamable HTTP로 대응이되어야했습니다.

## 이슈를 어떻게 작성했는가

버그를 발견한 뒤 바로 코드를 고치기보다 먼저 [Issue #1434](https://github.com/agentgateway/agentgateway/issues/1434)를 작성했습니다.

이슈를 쓸 때는 단순히 "안 된다"라고 적기보다, maintainer가 바로 상황을 그려볼 수 있게 정보를 최대한 붙여두려고 했습니다. 문제가 발생한 조건, 기대한 동작, 실제 동작, 근거 로그를 한 번에 볼 수 있게 정리했고, 화면 캡처와 설정도 같이 첨부했습니다.

이슈에는 아래 내용을 포함했습니다.

- Summary: 현재상황 요약. (Playground가 MCP route를 항상 legacy SSE transport를 사용한다.)
- Reproduction: `statefulMode: stateless` MCP backend 설정 예시를 제공.
- Expected behavior: stateless route에서는 `/mcp`와 Streamable HTTP transport를 사용해야 한다.
- Actual behavior: 여전히 `/sse`로 연결해 실패하는 현상.
- Logs: 실제 요청 경로와 `405 Method Not Allowed` 로그 첨부.
- Root cause: Playground가 MCP backend의 session mode에 따라 transport를 바꾸지 않음.
- Proposed fix: route의 MCP backend 설정을 보고 적절한 endpoint와 transport를 선택하게 수정.

## 첫 번째 PR: 기존 SSE 흐름을 보존하면서 stateless만 추가 지원

이슈를 올린 뒤 바로 [PR #1435](https://github.com/agentgateway/agentgateway/pull/1435)를 만들었습니다.

> **"기존 stateful route는 그대로 SSE를 쓰고, stateless route일 때만 Streamable HTTP를 쓰자"는 방식으로 PR을 만들었습니다.**

주요 변경 방향은 다음과 같았습니다.

- 선택된 route의 backend type이 MCP인지 확인한다.
- MCP backend의 `statefulMode`를 읽는다.
- `statefulMode: stateless`이면 `/mcp` endpoint를 계산한다.
- stateless route는 `StreamableHTTPClientTransport`를 사용한다.
- stateful route는 기존처럼 `SSEClientTransport`를 사용한다.
- 연결 패널에 실제 연결 endpoint와 session mode를 보여준다.
- 에러 메시지도 항상 `/sse`를 가정하지 않고 실제 endpoint를 기준으로 보여준다.

당시에는 "기존 동작은 그대로 두고, 안 되는 케이스만 보완하자"는 쪽으로 생각하여 코드 수정 방향을 잡았습니다.

기존 코드가 이미 SSE transport를 전제로 하고 있었기 때문에, stateful route는 그대로 두고 stateless route만 예외적으로 처리하는 편이 덜 위험하겠다고 생각했습니다.

하지만 리뷰에서는 제가 예상하지 못한 방향의 제안이 나왔습니다.

> maintainer는 이제 agentgateway 자체가 MCP route에서 Streamable HTTP를 지원할 수 있으므로, Playground UI에서 굳이 SSE 흐름을 유지할 필요가 없다는 의견을 주었습니다.

![PR #1435 feedback](/assets/img/agentgateway/pr-1435-feedback.png)

처음에는 "오픈소스 프로젝트라면 하위 호환성을 최대한 지키는 방향이 더 낫지 않을까?"라고 생각했습니다. 그래서 기존 SSE 흐름을 보존하는 쪽으로 접근했지만, maintainer가 보고 있던 방향은 조금 달랐습니다.

이 피드백을 받고 나서야, maintainer가 보고 있는 기준이 "예전 방식을 얼마나 남길 것인가"보다 "앞으로 어떤 쪽으로 정리할 것인가"에 더 가깝다는 걸 알게 됐습니다.

그때부터는 하위 호환성을 지키는 것 자체보다, 이 repository가 어디를 향하고 있는지를 먼저 보는 게 더 중요하겠다는 생각이 들었습니다.

## 피드백 반영: PR을 고치는 대신 새 PR로 정리

리뷰를 받은 뒤 선택지는 두 가지였습니다.

1. 기존 PR에서 코드를 크게 수정한다.
2. 기존 PR을 닫고, 새 방향에 맞는 PR을 다시 만든다.

저는 두 번째 방식을 선택했습니다.

첫 번째 PR은 "stateful과 stateless를 분기한다"는 전제 위에서 작성되어 있었습니다. 그런데 리뷰 후 결정된 방향은 "Playground MCP 연결을 Streamable HTTP로 통일한다"였습니다.

전제가 바뀐 상태에서 기존 PR 위에 계속 덧대는 것보다, 아예 새 방향으로 다시 쓰는 편이 더 낫겠다고 느꼈습니다.

그래서 PR #1435는 머지하지 않고, maintainer에게 이번 PR은 여기서 정리하고 새로 올리겠다고 먼저 공유한 뒤 닫았습니다.

지나고 보니 닫힌 PR도 그냥 버려진 작업은 아니었습니다.

PR #1435가 있었기 때문에 문제를 어디까지 풀어야 하는지, 그리고 이 프로젝트에서는 어떤 방향의 수정이 더 맞는지 이야기가 앞으로 나갈 수 있었습니다.

## 최종 PR: Playground MCP 연결을 Streamable HTTP로 통일

이후 [PR #1595](https://github.com/agentgateway/agentgateway/pull/1595)를 새로 만들었습니다.

최종 PR의 핵심은 단순합니다.

Playground에서 MCP 연결을 만들 때 더 이상 `SSEClientTransport`를 사용하지 않고, `StreamableHTTPClientTransport`를 사용하도록 바꾸는 것입니다.

변경 파일은 하나였습니다.

- `ui/src/app/playground/page.tsx`

변경량도 크지 않았습니다.

- 42 lines added
- 24 lines removed
- 1 file changed

하지만 의미는 꽤 분명했습니다. PR의 실제 diff를 보면 핵심은 아래 세 부분입니다.

![PR #1595 files changed](/assets/img/agentgateway/pr-1595-files.png)

### 1. SSE transport import 제거

기존 코드는 MCP 연결을 위해 SSE 전용 transport를 import하고 있었습니다.

```text
@modelcontextprotocol/sdk/client/sse.js
```

이 import 자체가 Playground의 MCP 연결이 SSE 기반이라는 전제를 코드에 박아두는 역할을 했습니다.

최종 PR에서는 이를 Streamable HTTP transport import로 바꿨습니다.

```text
@modelcontextprotocol/sdk/client/streamableHttp.js
```

이 변경은 단순한 import 교체처럼 보이지만, 실제로는 Playground가 MCP route를 바라보는 기본 전제를 바꾼 것입니다.

- 기존 전제: MCP 연결은 `/sse` endpoint와 SSE transport를 사용한다.
- 변경 후 전제: MCP 연결은 Streamable HTTP endpoint를 사용한다.

### 2. MCP 연결 endpoint 계산 함수 추가

기존 Playground 흐름에서는 MCP route를 선택했을 때 route endpoint를 거의 그대로 사용하거나, SSE 기반 연결을 전제로 path를 보정했습니다.

하지만 실제 endpoint 형태는 하나로 고정되어 있지 않았습니다. 이미 /mcp로 끝날 수도 있고, 기존 SSE 흐름의 영향으로 /sse로 끝날 수도 있으며, route가 explicit exact path로 정의되어 있을 수도 있습니다. 반대로 기본 route에서는 /mcp를 붙여야 하는 경우도 있습니다.

> endpoint에 항상 /mcp를 붙이는 것이 아니라, route 설정과 기존 endpoint 형태를 기준으로 최종 MCP endpoint를 결정하는 것입니다.

```js
if route has explicit exact path:
    use endpoint as-is
else if endpoint ends with /mcp:
    use endpoint as-is
else if endpoint ends with /sse:
    replace /sse with /mcp
else:
    append /mcp
```

최종 PR에서는 이러한 분기들을 한 곳에서 처리하기 위해 MCP endpoint resolution 로직을 별도 유틸 함수로 분리했습니다.

### 3. 연결 생성 코드 변경

연결 생성 로직도 기존 SSE 기반 흐름에서 Streamable HTTP 기반 흐름으로 변경했습니다.

기존에는 선택된 route endpoint에 `/sse`를 붙인 뒤, 그 주소로 SSE transport를 생성하고 MCP client를 연결했습니다.

```text
endpoint + /sse
  -> create SSE transport
  -> connect MCP client
```

최종 PR에서는 앞에서 계산한 MCP endpoint를 그대로 사용해 Streamable HTTP transport를 생성하도록 변경했습니다.

```text
resolved MCP endpoint
  -> create Streamable HTTP transport
  -> connect MCP client
```

개념적으로는 아래와 같은 구조입니다.

```tsx
const transport = new StreamableHTTPClientTransport(new URL(connectionEndpoint), {
  requestInit: {
    headers,
    credentials: "omit",
    mode: "cors",
  },
});
```

여기서 `connectionEndpoint`는 endpoint resolution 로직을 통해 계산된 실제 MCP 연결 주소입니다.

> 이렇게 되면 Playground는 더 이상 선택된 route에 기계적으로 `/sse`를 붙이지 않습니다. 먼저 실제로 연결해야 할 MCP endpoint를 계산하고, 그 값을 Streamable HTTP transport에 넘겨 MCP client를 연결합니다.

### 4. 표시 endpoint와 에러 메시지도 함께 수정

기존 Playgound에서는 `/sse` 기준 안내하였던 에러 메시지를 connection panel의 selected endpoint와 연결 실패 메시지 모두 `connectionEndpoint` 기준으로 바꿨습니다.

수정 전후를 요약하면 다음과 같습니다.

| 영역             | 수정 전                         | 수정 후                            |
| ---------------- | ------------------------------- | ---------------------------------- |
| import           | SSE client transport            | Streamable HTTP client transport   |
| MCP URL 계산     | route endpoint 뒤에 `/sse` 추가 | 실제 MCP endpoint를 계산           |
| 연결 transport   | SSE                             | Streamable HTTP                    |
| UI 표시 endpoint | route endpoint 중심             | 계산된 MCP connection endpoint     |
| 에러 메시지      | `/sse` 기준 안내 가능           | 실제 connection endpoint 기준 안내 |

## 테스트

PR 본문에는 아래 테스트를 남겼습니다.

```bash
cd ui
npm run build
```

그리고 수동으로 다음을 확인했습니다.

- Playground MCP connection이 Streamable HTTP를 사용한다.
- 연결 패널에 `/mcp` endpoint가 표시된다.
- transport 표시가 `STREAMABLE HTTP`로 나타난다.

PR을 써보면서 테스트 내용을 남기는 일도 생각보다 어렵고, 정리해야할 게 많았습니다.

그냥 "테스트했습니다"라고 적는 것보다, 어떤 명령을 돌렸고 화면에서 무엇을 확인했는지 같이 적어두어 리뷰어에게 훨씬 좋은 리뷰를 받기위해 노력했습니다.

## 정리하면

돌아보면 이 버그는 stateless MCP route가 `/mcp`와 Streamable HTTP를 기대하는데, Playground는 여전히 `/sse`와 SSE를 기준으로 보고 있었다는 데서 시작했습니다. 그래서 저도 처음엔 endpoint만 맞추면 되지 않을까 싶었지만, 실제로는 transport까지 같이 바꿔야 풀리는 문제였습니다.

처음에는 stateful은 SSE, stateless는 Streamable HTTP로 나누는 쪽이 더 자연스럽다고 생각했습니다. 그런데 리뷰를 거치면서 굳이 두 흐름을 계속 함께 들고 갈 필요가 없고, Streamable HTTP 쪽으로 정리하는 편이 더 단순하다는 방향이 잡혔습니다.

결과적으로 최종 PR은 예외 처리를 더 늘리는 대신, Playground의 MCP 연결 방식을 한쪽으로 정리하는 쪽으로 마무리됐습니다. PR #1435가 닫힌 것도 그 방향 전환 때문이었습니다.

## 머지와 이슈 종료

PR #1595는 maintainer의 approve를 받은 뒤 squash merge되었습니다.

이후 `Fixes #1434`에 의해 Issue #1434도 함께 close되었습니다.

**1.2.0 release note**에 fix된 내용이 반영되었습니다.  
<https://github.com/agentgateway/agentgateway/releases/tag/v1.2.0-alpha.1>

![v1.2.0-alpha.1 release note](/assets/img/agentgateway/release-note.png)

흐름을 날짜 기준으로 정리하면 다음과 같습니다.

| 날짜       | 작업                                        |
| ---------- | ------------------------------------------- |
| 2026-04-02 | Issue #1434 생성                            |
| 2026-04-02 | PR #1435 생성                               |
| 2026-04-07 | maintainer가 Streamable HTTP 통일 방향 제안 |
| 2026-04-14 | PR #1435 close                              |
| 2026-04-19 | PR #1595 생성                               |
| 2026-04-20 | PR #1595 approve 및 merge                   |
| 2026-04-20 | Issue #1434 close                           |

작은 버그처럼 보였지만, 이슈 작성, 재현 조건 정리, 첫 번째 해결안, 리뷰 피드백, 후속 PR, 머지까지 경험할 수 있었습니다.

가장 크게 남은 건 maintainer와 이야기를 주고받는 과정에서 이 repository가 어디를 향하고 있는지 조금은 감이 왔다는 점입니다. 

처음에는 제가 생각한 방식대로 고치면 된다고 봤는데, 막상 리뷰를 받아보니 더 중요한 건 지금 이 프로젝트가 어떤 방향으로 정리되려는지였습니다. 그걸 보면서 제 수정안도 다시 맞춰가는 과정이 이번 기여에서 가장 인상 깊게 남았습니다.

> 영어로 issue 등록, PR 작성, 소통하는 것도 많이 배웠습니다..

## 출처

- [agentgateway/agentgateway](https://github.com/agentgateway/agentgateway)
- [Issue #1434: Playground does not support stateless MCP routes](https://github.com/agentgateway/agentgateway/issues/1434)
- [PR #1435: FIX #1434: support stateless MCP routes in playground](https://github.com/agentgateway/agentgateway/pull/1435)
- [PR #1595: fix(ui): support stateless MCP routes in playground](https://github.com/agentgateway/agentgateway/pull/1595)
