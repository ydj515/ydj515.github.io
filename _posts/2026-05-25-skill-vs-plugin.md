---
title: Agent Skill과 Plugin
description: Codex와 Claude Code의 skill과 plugin의 차이
author: ydj515
date: 2026-05-25 09:30:00 +0900
categories: [AI, devtools]
tags: [codex, claude code, skill, plugin, MCP, agent, workflow]
image:
  path: /assets/img/agent/logo.png
  lqip: data:image/webp;base64,UklGRpoAAABXRUJQVlA4WAoAAAAQAAAADwAABwAAQUxQSDIAAAARL0AmbZurmr57yyIiqE8oiG0bejIYEQTgqiDA9vqnsUSI6H+oAERp2HZ65qP/VIAWAFZQOCBCAAAA8AEAnQEqEAAIAAVAfCWkAALp8sF8rgRgAP7o9FDvMCkMde9PK7euH5M1m6VWoDXf2FkP3BqV0ZYbO6NA/VFIAAAA
  alt: agent
---

AI 에이전트에게 반복 작업을 맡기다 보면, 어느 순간 프롬프트만으로는 부족해집니다. 코드 리뷰 체크리스트, 문서 작성 규칙, 검증 순서처럼 매번 같은 기준으로 처리해야 하는 일은 별도의 재사용 단위로 분리하는 편이 더 안정적입니다.

처음에는 이런 작업을 SKILL.md로 빼두면 충분하다고 생각했습니다. 실제로 workflow, rule, output format을 skill로 정리하면 꽤 편합니다. 그런데 몇 개를 만들고, 설치 가능한 형태로 배포하는 도구까지 만들다 보니 질문이 달라졌습니다.

> 이건 skill로 만들어야 하나, plugin으로 만들어야 하나?

둘 다 재사용을 위한 구조처럼 보이지만, 책임은 다릅니다.

* Skill은 에이전트가 따라야 할 워크플로, 규칙, 절차를 정의합니다.
* Plugin은 skill, app, MCP server 등을 설치 가능한 단위로 묶어 배포합니다.

다시 말해 무엇을 하게 할 것인가는 skill의 문제이고, 그걸 어떻게 설치하고 나눌 것인가는 plugin의 문제입니다.

[`agent-skills-installer`](https://github.com/ydj515/agent-skills-installer)와 [`agent-plugins-installer`](https://github.com/ydj515/agent-plugins-installer)를 직접 만들고 npm에 배포해 보면서 정리한 skill과 plugin의 구분 기준입니다.

- [`agent-skills-installer`](https://www.npmjs.com/package/agent-skills-installer): AI 에이전트용 skill CLI installer
- [`agent-plugins-installer`](https://www.npmjs.com/package/agent-plugins-installer): AI 에이전트용 plugin CLI installer

---

## 언제 Skill을 만들고, 언제 Plugin을 만들까

물어보면 대부분의 경우를 분류할 수 있습니다.

### 1. Agent가 따라야 할 규칙과 절차인가

그렇다면 우선 `skill`을 만들어야 합니다.

예를 들어 이런 것들입니다.

- 코드 리뷰 체크리스트
- 배포 전 검증 순서
- 장애 분석 절차
- 문서 생성 규칙
- 특정 형식의 보고서 출력 규약

핵심이 외부 연결보다 `판단 흐름과 출력 일관성`이라면 skill 쪽입니다.

### 2. 그 규칙을 여러 사용자에게 설치 가능하게 배포할 것인가

그렇다면 `plugin`이 필요합니다.

나 혼자 로컬에서 쓰는 skill은 단순하지만, 팀 전체가 설치해서 쓰기 시작하면 버전, 배포 경로, 메타데이터, 설치 정책 문제가 생깁니다. 그때 필요한 것이 plugin입니다.

### 3. 외부 시스템, MCP, app과 연결해야 하는가

그렇다면 대부분 `plugin` 또는 `plugin + skill` 조합이 맞습니다.

GitHub, Slack, 사내 API, 문서 시스템, 데이터베이스, 브라우저 자동화 같은 외부 연결이 들어가면 skill만으로 끝나지 않습니다. 실제 연결 통로와 설정을 담는 plugin 계층이 필요합니다.

판단 순서는 다음의 순서로 판단하면 됩니다.

1. 행동 규칙인가?
2. 여러 사람에게 설치 가능하게 배포해야 하는가?
3. 외부 시스템 연결이 필요한가?

| 지금 만들려는 것                                    | 추천 선택        | 왜 이 선택이 맞는가                                                        | 예시                                                                    |
| --------------------------------------------------- | ---------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 에이전트가 따라야 할 절차, 체크리스트, 출력 규칙    | `Skill`          | 핵심이 실행 규칙과 출력 일관성이기 때문                                    | 코드 리뷰 절차, 장애 분석 흐름, 문서 작성 규칙                          |
| 그 절차를 여러 사용자에게 설치 가능하게 배포        | `Plugin`         | 핵심이 공유, 설치, 버전 관리이기 때문                                      | 팀 공용 리뷰 도구 묶음, 사내 배포용 에이전트 패키지                     |
| 외부 시스템 연결과 함께 재사용 가능한 워크플로 제공 | `Plugin + Skill` | 연결 통로는 plugin이, 행동 규칙은 skill이 맡는 구조가 가장 자연스럽기 때문 | GitHub PR 리뷰 plugin + 리뷰 skill, 사내 API 조회 plugin + 보고서 skill |
| 아직 규칙이 자주 바뀌는 실험 단계                   | 우선 `Skill`     | 배포 구조보다 워크플로를 먼저 안정화하는 편이 비용이 낮기 때문             | 개인용 초안 skill, 팀 내부 베타 워크플로                                |

> 보통은 `Skill -> Plugin -> Plugin + Skill` 순서로 확장하는 편이 좋습니다.

---

## Skill은 무엇이 중요할까

skill은 "좋은 글"보다 "모델이 같은 상황에서 같은 방식으로 행동하도록 경계를 그어 주는 문서"에 가깝습니다. 그래서 아래 네 가지가 중요합니다.

### 1. 호출 조건이 명확해야 한다

Codex나 Claude Code가 skill을 사용할지 판단할 때 중요한 신호는 description입니다.

**description은 단순 소개문이 아니라, 모델이 "지금 이 skill을 써야 하는가?"를 판단하는 기준입니다.**

좋은 description은 보통 다음을 포함합니다.

- 어떤 요청에서 이 skill을 써야 하는지
- 어떤 상황에서는 쓰면 안 되는지
- 어떤 결과를 기대할 수 있는지

예를 들어 "보안 리뷰를 수행한다"의 모호함 보다 "PR이나 저장소 변경분에 대해 보안 중심 코드 리뷰를 할 때 사용한다"처럼 구체적이어야합니다.

### 2. 입력과 출력이 명확해야 한다

특히 중요한 것은 출력 형식입니다.

애매한 skill은 이런 식입니다.

- "적절히 분석해서 정리해라"
- "필요하면 더 조사해라"
- "좋은 방식으로 답변해라"

좋은 skill은 이런 식이어야 합니다.

- 입력이 무엇인지
- 어떤 순서로 처리하는지
- 최종 출력이 어떤 형식이어야 하는지
- 실패하거나 불확실할 때 어떻게 말해야 하는지

예를 들어 보안 리뷰 skill이라면 다음이 분명해야 합니다.

- 입력: PR diff, 파일 경로, 실행 로그
- 처리: 위협 모델링 -> 후보 이슈 탐색 -> 검증 -> 심각도 판단
- 출력: 우선순위 순으로 finding 정리, 파일/라인 참조 포함

즉 skill은 자연어로 쓰지만, 실제로는 `입력 계약`과 `출력 계약`을 가진 작은 프로토콜에 가깝습니다.

### 3. 한 skill은 한 가지 책임에 집중해야 한다

skill 하나에 너무 많은 일을 넣으면 호출 정확도가 떨어집니다.

예를 들어 아래를 한 skill에 다 넣는 것은 좋지 않습니다.

- 코드 리뷰
- 테스트 실행
- 배포
- 릴리즈 노트 작성
- PR 코멘트 정리

이렇게 되면 모델이 skill을 언제 꺼내야 하는지도 애매해지고, 꺼냈을 때 어디까지 수행해야 하는지도 불명확해집니다. 좋은 skill은 "이 skill은 정확히 어떤 일을 끝내기 위해 존재하는가"가 선명해야 합니다.

### 4. 본문은 짧게, 세부 자료는 분리해야 한다

문서 구조도 중요합니다. 긴 본문 하나에 모든 규칙을 넣기보다, 핵심은 `SKILL.md`에 두고 세부 자료는 분리하는 편이 좋습니다.

skill은 보통 이런 구조로 작성됩니다.

```text
my-skill/
├── SKILL.md
├── references/
│   ├── output-format.md
│   └── edge-cases.md
├── scripts/
│   └── validate_output.py
└── examples/
    ├── good-output.md
    └── bad-output.md
```

- 자주 판단해야 하는 규칙은 `SKILL.md`
- 길고 드문 참고 사항은 `references/`
- 반복 실행 로직은 `scripts/`
- 기대 결과 예시는 `examples/`

---

## Plugin은 무엇이 중요할까

plugin은 skill보다 운영적인 단위입니다. skill이 행동 설계라면, plugin은 그 행동과 연결 기능을 다른 환경에서도 설치하고 업데이트할 수 있게 묶는 배포 단위입니다.

### 1. 무엇을 묶고 무엇을 분리할지 정해야 한다

plugin에는 보통 이런 것들이 들어갑니다.

- 하나 이상의 skill
- app integration
- MCP server 설정
- hooks
- scripts
- assets
- marketplace metadata

그래서 plugin 설계에서는 무엇을 묶고 무엇을 분리할지부터 정해야 합니다.

예를 들어 하나의 plugin이 아래를 모두 담을 수는 있습니다.

- GitHub PR 리뷰 skill
- GitHub API 연결
- PR comment 정리 script
- 설치용 metadata

여기에 Slack 알림, Jira 동기화, 배포 승인까지 넣기 시작하면 plugin도 금방 비대해집니다. plugin도 결국 "하나의 분명한 배포 단위"여야 합니다.

### 2. 설치 경험이 좋아야 한다

plugin은 누군가가 설치하고 처음 실행하는 순간까지 고려해야 의미가 있습니다.

- 이름이 명확한가
- 설명이 기능을 잘 전달하는가
- 어떤 기능이 포함되는지 이해하기 쉬운가
- 설치 후 첫 실행이 매끄러운가
- 인증이나 권한 요구가 예측 가능한가

plugin 품질은 기능 자체보다 `처음 쓰는 사람이 얼마나 덜 헤매는가`입니다.

### 3. 버전과 의존성 관리를 생각해야 한다

로컬 skill은 내 환경에서만 돌면 되지만, plugin은 버전이 생기는 순간 호환성 문제가 생깁니다.

특히 아래를 신경 써야 합니다.

- 내부 skill 변경이 기존 사용자 흐름을 깨지 않는가
- 연결하는 MCP server 버전과 호환되는가
- 외부 app 인증 방식이 바뀌면 어떻게 대응할 것인가
- plugin 간 의존성이 있다면 범위를 어떻게 고정할 것인가

이 시점부터 plugin은 단순 문서 묶음이 아니라 하나의 배포 제품처럼 봐야 합니다.

### 4. 외부 연결과 보안 책임이 생긴다

plugin은 외부 시스템과 연결되는 순간부터 보안 경계가 생깁니다.

예를 들어 아래를 생각해야 합니다.

- 어떤 권한이 필요한가
- 어떤 순간에 인증하는가
- 어떤 데이터가 외부로 전송되는가
- 로그에 민감 정보가 남지 않는가
- 실패 시 사용자에게 무엇을 알려줘야 하는가

skill에서는 이 문제가 상대적으로 작을 수 있지만, plugin에서는 핵심 품질 요소입니다.

---

## Installer를 만들며 더 분명해진 차이

위에서의 차이점은 실제 installer를 만들 때 더 구체적으로 드러났습니다. 처음에는 skill installer와 plugin installer 모두 "설치를 도와주는 도구"라서 구조도 비슷할 거라고 생각했습니다. 그런데 실제로 구현해 보니 달랐습니다.

`agent-skills-installer` 쪽은 결국 `skill 폴더를 어디에, 어떤 안전장치와 함께 복사할 것인가`가 중심이었습니다. 어떤 에이전트가 어떤 로컬 경로를 읽는지, user scope와 project scope를 어떻게 나눌지, 기존 파일을 덮어쓸 때 어떤 보호 장치를 둘지 같은 문제가 핵심이었습니다.

반대로 `agent-plugins-installer`는 더 복잡했습니다. plugin은 skill 몇 개를 복사하는 문제로 끝나지 않았고, 대상 런타임마다 필요한 배포 구조가 조금씩 달랐습니다. marketplace provisioning, 로컬 marketplace, extension 구조처럼 각 도구가 기대하는 포맷과 메타데이터를 함께 맞춰야 했습니다.

결국 skill은 "행동을 어떻게 정의하느냐"의 문제에 가깝고, plugin은 "그 행동과 연결 기능을 어떻게 각 런타임에 맞게 배포하느냐"의 문제에 가깝습니다. 문서만 읽을 때는 이 차이가 추상적으로 보일 수 있지만, 설치기까지 만들고 배포해 보면 왜 둘을 다른 단위로 다루는지가 꽤 분명해집니다.

---

## Skill과 Plugin을 비교하면

| 항목        | Skill                                          | Plugin                                              |
| ----------- | ---------------------------------------------- | --------------------------------------------------- |
| 핵심 역할   | 규칙, 절차, 워크플로 정의                      | 설치, 공유, 배포 단위                               |
| 중심 관심사 | 입력/출력 형식, 판단 순서, 호출 조건           | 패키징, 설치 경험, 메타데이터, 버전 관리            |
| 포함 요소   | 지침 문서, 참고 자료, 예시, 보조 스크립트      | skill, app, MCP server, hooks, scripts, assets 등   |
| 실패 형태   | 잘못 호출됨, 출력 형식이 흔들림, 절차를 빠뜨림 | 설치 실패, 인증 실패, 버전 충돌, 연결 장애          |
| 평가 포인트 | 절차 준수율, 출력 일관성, trigger 정확도       | 설치 성공률, 연결 안정성, 업그레이드 안전성         |
| 적합한 범위 | 로컬 규칙, 팀 규칙, 도메인 워크플로            | 팀 공유 자산, 외부 도구 통합, 배포 가능한 기능 묶음 |

---

## 평가 기준은 어떻게 달라질까

구분 기준이 잡혔다면 다음 질문은 평가입니다. skill은 행동이 안정적인지, plugin은 설치부터 사용까지의 흐름이 안정적인지를 봐야 합니다.

## Skill은 어떻게 평가해야 할까

skill은 한두 번 멋진 답을 내는 것보다, 비슷한 입력에서 계속 같은 품질이 나오는지가 더 중요합니다. 평가할 때는 아래 다섯 가지를 보면 됩니다.

### 1. Trigger 정확도

맞는 상황에서 호출되는가, 아닌 상황에서 불필요하게 호출되지 않는가를 봐야 합니다.

예를 들어 보안 리뷰 skill이 일반 문서 요약 요청에서 튀어나오면 안 됩니다.

### 2. 절차 준수율

skill이 정의한 단계를 빠뜨리지 않는지 봐야 합니다.

예를 들어 "탐색 -> 검증 -> 결과 정리"가 정의돼 있는데, 검증 없이 바로 결론을 내면 skill은 실패한 것입니다.

### 3. 출력 계약 준수율

- 필수 섹션이 빠지지 않는가
- 파일/라인 참조가 필요한데 누락되지 않는가
- JSON이어야 하는데 자연어로 새지 않는가
- 우선순위 기준이 일관되는가

skill은 "답을 잘하는가"보다 먼저 "약속한 형식으로 내는가"를 봐야 합니다.

### 4. 엣지 케이스 대응력

다음 같은 경우도 테스트해야 합니다.

- 입력이 불완전한 경우
- 정보가 모순되는 경우
- 결과가 없을 수 있는 경우
- 사용자가 애매하게 요청하는 경우

좋은 skill은 이런 상황에서 억지 결론을 내리지 않고, 부족한 점을 명확히 드러냅니다.

### 5. 비용과 길이

skill이 너무 장황하면 토큰을 많이 소모하고, reference를 너무 많이 읽게 만들면 성능도 떨어집니다. 결과 품질뿐 아니라 비용 대비 효율도 같이 봐야 합니다.

작은 eval 세트를 갖고 있는 것이 좋습니다.

- 대표 요청 10~20개
- 엣지 케이스 5개 이상
- 실패해야 하는 요청 몇 개
- 기대 출력 예시
- 체크리스트 기반 통과 기준

---

## Plugin은 어떻게 평가해야 할까

plugin 평가는 skill 평가보다 범위가 넓습니다. plugin은 "잘 대답한다"보다 "설치부터 사용까지의 흐름이 매끄럽다"가 더 중요하기 때문입니다.

### 1. 설치 성공률

처음 설치하는 사용자가 문서를 따라 했을 때 제대로 동작하는지 봐야 합니다.

### 2. 온보딩 난이도

plugin을 설치한 뒤 다음이 자연스러워야 합니다.

- 어떤 기능이 들어 있는지 알 수 있는가
- 첫 실행 예시가 있는가
- 인증이 필요한 경우 어디서 막히는지 바로 보이는가

### 3. 포함된 skill 품질

plugin 안에 여러 skill이 들어 있다면, 결국 plugin 품질은 내부 skill 품질을 그대로 반영합니다. 따라서 plugin 평가는 항상 내부 skill 평가를 포함해야 합니다.

### 4. 외부 연결 안정성

MCP server, app integration, API 연결이 포함된다면 다음을 봐야 합니다.

- 연결 실패 시 복구 경로가 있는가
- 권한 에러가 이해 가능하게 드러나는가
- 타임아웃, 인증 만료, 네트워크 오류를 잘 처리하는가

### 5. 업그레이드 안전성

plugin은 배포 단위이기 때문에 업데이트 이후 기존 사용자 흐름이 깨지지 않는지가 중요합니다. changelog와 버전 정책, 호환성 가이드가 필요한 이유도 여기에 있습니다.

---

## 자주 하는 실수

실제로 많이 보는 실수는 대체로 아래 네 가지입니다.

### 1. skill로 끝낼 문제를 plugin으로 시작한다

아직 규칙도 안정되지 않았는데 바로 배포 구조부터 잡는 경우입니다. 이러면 packaging은 있는데 workflow는 자주 바뀌어서 유지보수가 더 어려워집니다.

### 2. plugin이 필요한데 skill만 만든다

팀 전체가 써야 하고 외부 시스템 연결도 필요한데 로컬 `SKILL.md` 하나로만 운영하는 경우입니다. 처음에는 빨라도, 결국 설치 방법과 버전 차이 때문에 팀마다 다른 동작이 나오기 쉽습니다.

### 3. 입력보다 출력 형식을 덜 중요하게 본다

특히 skill에서 흔한 실수입니다. 프롬프트는 길고 친절한데 최종 결과 형식이 명확하지 않아서, 상황마다 결과물이 달라지는 경우가 많습니다.

### 4. 배포 문서를 구현 문서보다 가볍게 본다

plugin은 코드가 아니라 설치 경험까지가 제품입니다. README, 설치 예시, 인증 가이드, troubleshooting 문서가 비어 있으면 좋은 plugin도 실제로는 잘 쓰이지 않습니다.

---

## 정리

skill과 plugin은 비슷해 보이지만 서로 다른 계층입니다. skill은 에이전트가 따라야 할 행동의 구조를 정의하고, plugin은 그 행동과 연결 기능을 설치 가능한 자산으로 만듭니다.

판단 기준은 세 가지입니다.

- 규칙, 절차, 출력 형식이 핵심이면 skill
- 그 규칙을 여러 사용자가 설치 가능하게 공유해야 하면 plugin
- 외부 시스템 연결까지 함께 묶어야 하면 plugin + skill

보통은 skill로 시작하는 편이 안전합니다. 반복 사용 가치가 확인되면 plugin으로 올리고, 외부 연결이 생기면 그때 배포 단위를 다시 잡는 순서로 진행하는게 좋습니다.

---

## 출처

- [OpenAI Codex Skills](https://developers.openai.com/codex/skills)
- [OpenAI Codex Plugins](https://developers.openai.com/codex/plugins)
- [OpenAI Codex Build Plugins](https://developers.openai.com/codex/plugins/build)
- [OpenAI Evals Guide](https://developers.openai.com/api/docs/guides/evals)
- [OpenAI Evaluation Best Practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices)
- [Claude Code Skills and Slash Commands](https://code.claude.com/docs/en/slash-commands)
- [Claude Code Plugins](https://code.claude.com/docs/en/plugins)
- [Claude Code Plugin Dependencies](https://code.claude.com/docs/en/plugin-dependencies)
- [Claude Code Plugins Reference](https://code.claude.com/docs/en/plugins-reference)
