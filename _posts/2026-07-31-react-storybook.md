---
title: "React Storybook 10 도입 가이드: 컴포넌트 주도 개발부터 테스트 자동화까지"
description: "Storybook 10을 React와 Vite 프로젝트에 도입하고, 스토리 작성부터 접근성·인터랙션 테스트, CI와 배포까지 연결하는 실무 흐름을 정리합니다."
author: ydj515
date: 2026-07-31 00:00:00 +0900
categories: [react, storybook]
tags: [react, storybook, component-driven-development, frontend, testing]
image:
  path: /assets/img/storybook/logo.jpg
  alt: "Storybook 로고 이미지"
---

React 프로젝트를 여러 사람이 함께 개발하다 보면 다른 사람이 만든 컴포넌트를 가져와 화면에 적용하거나 검토해야 할 때가 많습니다. 그러나 코드와 Props만으로는 컴포넌트가 실제로 어떻게 보이고, 로딩·오류·비활성화 같은 상태에서 어떻게 달라지는지 빠르게 파악하기 어렵습니다. 결국 전체 애플리케이션을 실행해 특정 페이지까지 이동하거나, Playwright로 캡처한 이미지를 공유하며 상태를 설명하게 됩니다.

이 과정이 반복되면 컴포넌트 구현보다 **상태를 재현하고 결과를 전달하는 작업**에 더 많은 시간이 들어갑니다.

- **느린 피드백**: 컴포넌트 하나를 수정할 때마다 전체 앱을 실행하고 특정 페이지까지 이동해야 합니다.
- **재현의 어려움**: 빈 데이터, 오류, 로딩 같은 예외 상황을 의도적으로 만들기 번거롭습니다.
- **소통 비용**: 다른 개발자나 디자이너에게 컴포넌트의 외형과 동작 상태를 보여주려면 매번 화면을 캡처하거나 직접 시연해야 합니다.
- **문서 부재**: 시간이 지나면 컴포넌트의 사용 방법이나 속성 목록을 아무도 기억하지 못합니다.

Storybook은 이 문제들을 해결하기 위해 등장한 도구입니다.

## Storybook이란

Storybook은 UI 컴포넌트를 **애플리케이션과 분리된 환경**에서 개발하고 검증하는 도구입니다.

컴포넌트가 표현할 수 있는 상태를 **스토리(Story)**로 선언하면, Storybook은 각 스토리를 독립적으로 렌더링합니다. 예를 들어 `Button` 컴포넌트의 기본형, 보조형, 비활성화, 로딩 상태를 각각 하나의 스토리로 만들 수 있습니다.

```
Button (컴포넌트)
├── Primary     (스토리 1)
├── Secondary   (스토리 2)
├── Disabled    (스토리 3)
└── Loading     (스토리 4)
```

Storybook을 실행하면 전용 웹 UI가 열리고, 사이드바에서 원하는 컴포넌트와 상태를 선택할 수 있습니다. 전체 애플리케이션이나 실제 백엔드를 항상 실행할 필요는 없습니다. 대신 컴포넌트가 의존하는 라우터, 전역 상태, 테마, API 응답만 데코레이터나 모킹으로 최소한 재현합니다.

아래는 예제 프로젝트에 배포한 [Input Docs 화면](https://ydj515.github.io/react-sample/?path=/docs/shared-ui-input--docs)입니다.

![Input 컴포넌트와 placeholder, disabled, type Controls를 함께 보여 주는 Storybook Docs 화면](/assets/img/storybook/input-docs-controls.png)

왼쪽 사이드바에서는 컴포넌트와 스토리를 탐색하고, 가운데 Docs 영역에서는 렌더링 결과와 Props 정보를 함께 확인합니다. `placeholder`, `disabled`, `type` 같은 값을 Controls에서 바꾸면 미리보기에 즉시 반영됩니다. 개발자는 실제 페이지에 컴포넌트를 연결하기 전에 속성 조합과 상태를 확인하고, 디자이너와 QA는 같은 URL을 열어 동일한 화면을 검토할 수 있습니다.

이처럼 페이지 전체보다 컴포넌트와 상태를 먼저 정의하고, 작은 단위에서 화면을 조립해 가는 접근을 **컴포넌트 주도 개발(Component-Driven Development, CDD)**이라고 합니다.

## Storybook을 쓰면 뭐가 좋을까

### 1. 컴포넌트를 격리해서 개발한다

Storybook에서는 전체 앱을 실행할 필요가 없습니다. 컴포넌트 하나만 독립적으로 렌더링하므로 수정 후 결과를 즉시 확인합니다. 백엔드가 아직 준비되지 않았거나 특정 페이지에 진입하기 어려운 상황에서도 프론트엔드 개발을 먼저 진행할 수 있습니다.

### 2. 엣지 케이스를 재현한다

컴포넌트에서 중요하게 관리할 상태를 스토리로 정의해 두면 로딩, 오류, 빈 데이터, 긴 텍스트 같은 엣지 케이스를 즉시 전환할 수 있습니다. API나 전역 상태를 억지로 조작하며 재현할 필요가 줄어듭니다.

### 3. 스토리가 문서 역할을 한다

스토리 파일에는 컴포넌트의 사용 방법, 속성 목록, 예시 코드가 담기며, `autodocs`를 켜면 TypeScript 타입 정보를 바탕으로 API 문서를 자동 생성해 별도 위키를 관리할 필요가 없습니다.

### 4. 디자이너, QA와 소통한다

Storybook을 배포하면 디자이너는 브라우저에서 직접 컴포넌트를 확인하고, QA는 다양한 상태를 클릭만으로 검증할 수 있어 매번 개발 환경을 설정하거나 스크린샷을 주고받을 필요가 없습니다.

### 5. 스토리 안에서 테스트를 작성한다

`play` 함수를 사용하면 스토리가 렌더링된 뒤 클릭, 입력, 제출 같은 사용자 동작을 실행하고 결과를 검증할 수 있습니다. 스토리는 화면 상태를 보여 주는 문서이면서 컴포넌트 테스트의 입력 데이터가 됩니다. 이 검증을 CI에서 반복 실행하려면 뒤에서 소개할 Vitest 애드온을 연결합니다.

이 장점들을 요약하면 아래와 같습니다.

| 장점                     | Storybook 없이                            | Storybook 사용 시              |
| ------------------------ | ----------------------------------------- | ------------------------------ |
| 개발 피드백              | 전체 앱 실행 후 페이지 이동               | 컴포넌트만 독립 렌더링         |
| 엣지 케이스 확인         | API 조작, 네트워크 속도 조절              | 스토리 전환으로 즉시 재현      |
| 컴포넌트 문서            | 위키나 README 수동 관리                   | 스토리가 자동 문서 역할        |
| 디자인 검수              | 스크린샷 공유, 직접 시연                  | 배포된 Storybook에서 직접 확인 |
| 컴포넌트 상호작용 테스트 | 테스트 환경과 테스트 데이터를 별도로 구성 | 스토리를 테스트에 그대로 활용  |

## 컴포넌트 주도 개발(CDD) 흐름

Storybook을 단순한 컴포넌트 전시장으로만 사용하면 시간이 지나면서 스토리와 실제 구현이 쉽게 어긋납니다. 스토리를 개발 과정의 입력과 검증 수단으로 사용하려면, 먼저 화면이 아니라 **상태와 인터페이스**를 정의해야 합니다.

### 1. 사용자 흐름과 상태를 나열한다

기능 구현에 앞서 컴포넌트가 어떤 입력을 받고 어떤 상태를 표현해야 하는지 정리합니다. 로그인 폼이라면 기본, 입력 중, 유효성 검사 실패, 로그인 진행 중, 성공·실패 상태가 후보가 됩니다. 모든 조합을 만들 필요는 없고, 실제 앱에서 재현하기 어렵거나 실패 위험이 큰 상태를 우선합니다.

### 2. Props 인터페이스와 대표 스토리를 정의한다

상태를 표현하는 데 필요한 Props와 이벤트를 먼저 설계하고, 대표 상태를 스토리로 선언합니다. 이 과정에서 컴포넌트가 지나치게 많은 책임을 갖거나 외부 환경에 강하게 결합돼 있으면 스토리를 작성하기 어려워집니다. Storybook은 UI를 보여 주는 도구인 동시에 컴포넌트 경계를 점검하는 피드백 장치가 됩니다.

### 3. 컴포넌트를 구현하고 Controls로 탐색한다

스토리에 정의한 기본 상태가 렌더링되도록 컴포넌트를 구현합니다. 고정된 대표 상태는 스토리로 유지하고, 단순한 Props 조합은 Controls에서 바꿔 보며 탐색합니다. 이 구분을 지키면 스토리 수가 불필요하게 늘어나는 것을 막을 수 있습니다.

### 4. 동작을 검증하고 더 큰 화면으로 조립한다

사용자 동작이 중요한 컴포넌트에는 `play` 함수를 추가하고, 작은 컴포넌트를 폼·카드·페이지 단위로 조립합니다. 순수 계산이나 복잡한 상태 전이는 일반 Vitest 테스트로 검증하고, 화면 상태와 사용자 상호작용은 스토리와 Storybook 테스트로 확인합니다.

> **스토리 우선 개발과 TDD는 대체 관계가 아닙니다**
> 
> 스토리는 UI가 어떤 상태를 표현하고 사용자 입력에 어떻게 반응하는지 검증하는 데 강합니다. 반면 데이터 변환, 정렬, 유효성 검사, 상태 머신처럼 화면과 분리할 수 있는 로직은 빠른 단위 테스트가 더 적합합니다. 프로덕션에서는 로직을 Vitest로 촘촘하게 검증하고, 그 결과가 사용자에게 보이는 방식은 Storybook으로 확인하는 구성이 유지보수하기 좋습니다.
{:.prompt-warning }

## Storybook으로 개발하기

이제 Storybook 10을 React와 Vite 프로젝트에 적용하고, 스토리를 테스트와 CI까지 연결하는 과정을 살펴봅니다.

### 1. 설치와 기능 구성

Storybook 10은 Node.js 20 이상과 Vite 5 이상을 요구합니다. 프로젝트 루트에서 설치 명령을 실행하면 기존 의존성을 분석해 React·Vite에 맞는 프레임워크와 설정을 생성합니다.

```bash
# 기존 React 프로젝트의 루트에서 실행
npm create storybook@latest
```

설치 과정에서는 구성을 선택할 수 있습니다.

- **Recommended**: 컴포넌트 개발에 더해 Docs, Test, A11y 구성을 함께 설치합니다.
- **Minimal**: 기본 개발 기능만 설치하고 필요한 애드온을 나중에 추가합니다.

CI까지 연결할 예정이라면 Recommended 구성을 선택하는 편이 간단합니다. 명령형으로 기능을 지정하려면 다음처럼 실행할 수도 있습니다.

```bash
npm create storybook@latest --features docs test a11y
```

Storybook CLI는 프로젝트의 패키지 매니저를 자동 감지합니다. pnpm을 명시하고 싶다면 `--package-manager=pnpm` 옵션을 추가합니다.

설치가 끝나면 기본적으로 다음 파일이 생성됩니다. 온보딩 예제를 선택했는지에 따라 `src/stories`의 예시 파일은 생성되지 않을 수도 있습니다.

```
.storybook/
├── main.ts        # 스토리 경로, 애드온, 프레임워크 설정
└── preview.ts     # 전역 스타일, 데코레이터, 파라미터 설정

src/stories/       # 온보딩용 예시 스토리(선택 사항)
├── Button.stories.ts
├── Button.tsx
└── ...
```

#### 코어 기능과 애드온을 구분하기

Storybook 10에서는 컴포넌트를 탐색할 때 자주 쓰는 기능 대부분이 코어에 포함돼 있습니다. 아래 기능을 사용하기 위해 과거의 `@storybook/addon-essentials`나 개별 패키지를 설치할 필요는 없습니다.

| 코어 기능              | 역할                                                              |
| ---------------------- | ----------------------------------------------------------------- |
| **Controls**           | Args를 UI에서 변경해 Props 조합을 탐색합니다.                     |
| **Actions**            | 이벤트 핸들러 호출과 인자를 기록합니다.                           |
| **Viewport**           | 모바일·태블릿 등 여러 화면 크기를 시뮬레이션합니다.               |
| **Backgrounds**        | 서로 다른 배경에서 컴포넌트의 대비와 스타일을 확인합니다.         |
| **Measure & Outline**  | 요소의 크기, 여백, 경계와 정렬 문제를 시각화합니다.               |
| **Toolbars & Globals** | 언어, 밀도, 전역 테마처럼 여러 스토리가 공유하는 값을 제어합니다. |

`play` 함수의 실행 단계를 보여 주는 Interactions 패널과 테스트 상태 UI도 Storybook에 포함돼 있습니다. 다만 스토리를 브라우저 테스트로 실행하는 기능은 `@storybook/addon-vitest`가 담당합니다.

이 글에서 사용하는 확장 기능은 다음과 같습니다.

| 애드온     | 역할                                                        | 패키지                    |
| ---------- | ----------------------------------------------------------- | ------------------------- |
| **Docs**   | 스토리와 타입 정보를 바탕으로 컴포넌트 문서를 생성합니다.   | `@storybook/addon-docs`   |
| **A11y**   | axe-core로 접근성 위반 가능성을 검사합니다.                 | `@storybook/addon-a11y`   |
| **Themes** | 라이트·다크 테마를 Storybook 툴바에서 전환합니다.           | `@storybook/addon-themes` |
| **Vitest** | 스토리를 브라우저 모드 컴포넌트 테스트로 변환해 실행합니다. | `@storybook/addon-vitest` |

Recommended 설치에서 Docs, A11y, Vitest를 선택했다면 이미 등록돼 있을 수 있습니다. 누락된 애드온은 CLI로 추가하는 방식을 권장합니다. 패키지 설치뿐 아니라 `.storybook/main.ts` 등록과 필요한 초기 설정도 함께 처리하기 때문입니다.

```bash
npx storybook add @storybook/addon-docs
npx storybook add @storybook/addon-a11y
npx storybook add @storybook/addon-themes
npx storybook add @storybook/addon-vitest
```

특히 Vitest 애드온은 Vitest 프로젝트와 Playwright Browser Mode 설정이 함께 필요하므로 `addons` 배열만 직접 수정하기보다 CLI를 사용하는 편이 안전합니다.

설치가 끝난 `.storybook/main.ts`는 다음과 같은 형태가 됩니다.

```typescript
// .storybook/main.ts
import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  // 스토리는 컴포넌트와 가까이 두어 변경 사항을 함께 추적합니다.
  stories: ["../src/**/*.mdx", "../src/**/*.stories.@(ts|tsx)"],

  // 코어에 포함되지 않은 확장 기능만 등록합니다.
  addons: [
    "@storybook/addon-docs",
    "@storybook/addon-a11y",
    "@storybook/addon-themes",
    "@storybook/addon-vitest",
  ],

  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
};

export default config;
```

`stories`의 glob 패턴은 Storybook이 수집할 스토리와 MDX 파일의 위치를 지정합니다. 파일 이름에 `.stories`가 들어 있어도 이 패턴과 일치하지 않으면 사이드바와 테스트 대상에 포함되지 않습니다.

설정을 확인한 뒤 개발 서버를 실행합니다.

```bash
npm run storybook
```

기본 설정에서는 `http://localhost:6006`에서 Storybook UI가 열립니다.

### 2. 첫 번째 스토리 작성

Storybook에서 스토리를 정의하는 표준 형식을 **CSF(Component Story Format)**라고 합니다. 현재 널리 쓰이는 CSF3는 객체 기반 선언으로 간결합니다.

스토리 파일은 대상 컴포넌트와 같은 디렉터리에 두는 것이 관리하기 편합니다.

```
src/shared/ui/
├── button.tsx              # 컴포넌트 구현
├── button.stories.tsx      # 스토리 파일
├── card.tsx
├── input.tsx
└── ...
```

CSF3 파일은 크게 두 가지 내보내기로 구성됩니다.

1. **기본 내보내기(`default export`, Meta)**: 컴포넌트 메타 정보를 정의합니다.
2. **이름 있는 내보내기(`named export`, Story)**: 각 스토리를 객체로 정의합니다.

아래 예시로 `Button` 컴포넌트의 스토리를 작성합니다.

```tsx
// src/shared/ui/button.stories.tsx
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./button";

// 1. 컴포넌트 메타 정보 (default export)
const meta = {
  title: "Shared/UI/Button", // Storybook 사이드바에 표시할 경로
  component: Button,          // 대상 컴포넌트
  tags: ["autodocs"],        // 자동 문서 생성 활성화
  args: {
    children: "Button", // 모든 스토리에 공통으로 적용할 기본 속성
  },
  argTypes: {
    variant: {
      control: "select",
      options: ["primary", "secondary", "ghost", "danger"],
    },
    size: {
      control: "select",
      options: ["sm", "md", "lg", "icon"],
    },
    disabled: { control: "boolean" },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

// 2. 각 스토리 정의 (named export) — 컴포넌트의 상태 하나가 스토리 하나입니다
export const Primary: Story = {
  args: { variant: "primary" },
};

export const Secondary: Story = {
  args: { variant: "secondary" },
};

export const Danger: Story = {
  args: { variant: "danger" },
};

export const Disabled: Story = {
  args: { disabled: true },
};
```

`args`에는 컴포넌트에 전달할 속성을 객체로 정의하며, Storybook의 **Controls** 패널에서 이 값을 실시간으로 바꿔 가며 동작을 바로 확인할 수 있습니다.

메타 정보는 `satisfies Meta<typeof Button>`로 선언했습니다. `satisfies`를 쓰면 `meta` 객체가 `Meta` 타입을 만족하는지 검사하면서도 구체적인 타입 정보를 유지하므로, `StoryObj<typeof meta>`에서 각 스토리의 `args` 타입을 컴포넌트 속성에 맞게 정확히 추론할 수 있습니다.

> `tags: ["autodocs"]`를 설정하면 Storybook이 컴포넌트 속성의 타입 정보를 읽어 자동으로 문서 페이지를 생성합니다. React에서는 TypeScript 타입이나 PropTypes에서 추론한 정보를 활용합니다.
{:.prompt-tip }

스토리 이름은 나중에 문서로 활용하기 쉽도록 컴포넌트의 **상태**가 드러나게 짓습니다.

```tsx
// 좋은 예시 - 상태가 이름에서 바로 드러납니다
export const Active: Story = { ... };      // ProjectStatusBadge: 진행 중
export const Paused: Story = { ... };      // ProjectStatusBadge: 일시 중지
export const Empty: Story = { ... };       // RecentProjects: 데이터가 없는 상태
export const Disabled: Story = { ... };    // Button/Input: 비활성 상태

// 피할 예시 - 의미가 불명확합니다
export const Story1: Story = { ... };
export const Test: Story = { ... };
```

### 3. Controls로 Props 조합 탐색하기

스토리를 작성하면 Storybook은 컴포넌트 타입과 `argTypes`를 바탕으로 Controls 패널을 구성합니다. Controls에서 바꾼 값은 현재 미리보기에만 적용되므로, 코드를 수정하거나 새로운 스토리를 만들지 않고도 여러 Props 조합을 탐색할 수 있습니다.

```tsx
// src/shared/ui/input.stories.tsx (일부)
const meta = {
  title: "Shared/UI/Input",
  component: Input,
  argTypes: {
    disabled: { control: "boolean" },
    type: {
      control: "select",
      options: ["text", "email", "password", "number"],
    },
  },
} satisfies Meta<typeof Input>;
```

색상이나 날짜처럼 이름 규칙으로 추론할 수 있는 값은 `.storybook/preview.ts`의 `controls.matchers`에 패턴을 등록해 공통 처리할 수 있습니다.

```typescript
// .storybook/preview.ts (일부)
const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
};
```

주요 Control 타입은 다음과 같습니다.

| Control 타입 | 용도               | 예시              |
| ------------ | ------------------ | ----------------- |
| `text`       | 문자열 입력        | 제목, 설명        |
| `number`     | 숫자 입력          | 개수, 크기        |
| `boolean`    | 불리언 전환        | 활성화 여부       |
| `select`     | 목록에서 하나 선택 | variant, status   |
| `radio`      | 소수의 선택지 노출 | 크기(sm/md/lg)    |
| `color`      | 색상 선택          | 배경색, 테마 색상 |
| `date`       | 날짜 선택          | 생성일, 만료일    |
| `object`     | 객체와 배열 편집   | 복합 데이터       |

예제 Input 문서에서 `type`을 `email`로 바꾸고 `disabled`를 활성화하면 다음과 같이 렌더링됩니다.

![Input의 type을 email로 바꾸고 disabled를 True로 설정한 Storybook Controls 화면](/assets/img/storybook/input-controls-email-disabled.png)

1. `type`에서 `email`을 선택하면 `<input type="email">`이 렌더링됩니다. 외형은 비슷해도 브라우저가 입력값을 이메일 의미로 처리합니다.
2. `disabled`를 활성화하면 입력창이 비활성화돼 사용자 입력을 받지 않습니다.
3. Controls의 초기화 기능을 사용하면 스토리에 선언한 기본 `args`로 되돌아갑니다.

Controls는 값을 임시로 탐색하는 도구이고, 스토리는 팀이 반복해서 확인할 대표 상태를 고정하는 도구입니다. 예제 프로젝트에서는 `Default`, `Disabled`, `Typing`, `With Label`을 별도 스토리로 유지해 자주 검토하는 상태를 한 화면에서 비교합니다.

![Input 컴포넌트의 Disabled, Typing, With Label 상태를 나열한 Storybook Docs 화면](/assets/img/storybook/input-docs-states.png)

단순한 Props 조합은 Controls로 확인하고, 빈 데이터·오류·로딩처럼 재현 비용이 크거나 회귀 위험이 높은 상태만 스토리로 남기는 것이 유지보수에 유리합니다.

### 4. 데코레이터로 환경 설정

실제 프로젝트에서는 컴포넌트가 테마 제공자나 전역 스타일에 의존하는 경우가 많습니다. **데코레이터**는 스토리를 감싸 이런 외부 환경을 설정하는 함수입니다.

모든 스토리에 공통으로 적용할 데코레이터는 `.storybook/preview.ts`에 정의합니다. 저장소는 `@storybook/addon-themes`의 `withThemeByDataAttribute`를 써서 `html` 요소의 `data-theme` 속성을 토글하고, 툴바에서 라이트/다크 테마를 전환합니다.

```typescript
// .storybook/preview.ts
import { withThemeByDataAttribute } from "@storybook/addon-themes";
import type { Preview } from "@storybook/react-vite";

// Tailwind 전역 스타일을 스토리에도 그대로 적용합니다
import "../src/app/styles/index.css";

const preview: Preview = {
  parameters: {
    layout: "centered", // 스토리를 화면 중앙에 배치합니다
  },
  decorators: [
    // 모든 스토리를 감싸 data-theme 속성으로 라이트/다크 테마를 토글합니다
    withThemeByDataAttribute({
      themes: { light: "light", dark: "dark" },
      defaultTheme: "light",
      attributeName: "data-theme",
    }),
  ],
};

export default preview;
```

특정 스토리에서만 필요한 데코레이터는 스토리 객체에 직접 정의합니다. 저장소의 `ProjectCard`는 TanStack Router의 `<Link>`를 사용하므로, 라우터 컨텍스트 없이 스토리를 렌더하면 오류가 납니다. 이를 위해 메모리 라우터로 감싸는 `withRouter` 데코레이터를 만들어 두고 스토리에 적용합니다.

```tsx
// src/shared/lib/storybook/with-router.tsx (일부)
import type { Decorator } from "@storybook/react-vite";

// 메모리 히스토리 기반 최소 라우터를 만들어 스토리를 "/"에 렌더합니다
export const withRouter: Decorator = (Story) => <RouterStory Story={Story} />;
```

```tsx
// src/features/projects/ProjectCard.stories.tsx (일부)
import { withRouter } from "@/shared/lib/storybook/with-router";
import { ProjectCard } from "./ProjectCard";

const meta = {
  title: "Features/Projects/ProjectCard",
  component: ProjectCard,
  decorators: [withRouter], // Link를 쓰므로 메모리 라우터로 감쌉니다
  args: { project: sampleProject },
} satisfies Meta<typeof ProjectCard>;
```

`decorators`는 배열이므로 여러 개를 겹쳐 쓸 수 있습니다. 컴포넌트가 테마, 라우터, 전역 상태 같은 외부 환경에 의존할 때는 데코레이터로 필요한 실행 환경만 최소한으로 재현합니다. 실제 서버나 애플리케이션 전체를 그대로 복제하면 스토리가 느려지고 격리의 장점도 줄어듭니다.

### 5. 접근성 검사 자동화

접근성은 화면을 눈으로 확인하는 것만으로 놓치기 쉽습니다. `@storybook/addon-a11y`는 렌더링된 DOM을 axe-core 규칙으로 검사하고, Storybook의 Accessibility 패널에 `Violations`, `Passes`, `Incomplete` 결과를 보여 줍니다.

개발 중 패널에서 결과를 확인하는 것에 그치지 않고 CI에서 실패 조건으로 사용하려면 `.storybook/preview.ts`에 테스트 정책을 지정합니다.

```typescript
// .storybook/preview.ts (일부)
import type { Preview } from "@storybook/react-vite";

const preview: Preview = {
  parameters: {
    a11y: {
      // Vitest 애드온으로 실행할 때 접근성 위반을 테스트 실패로 처리합니다.
      test: "error",
    },
  },
};

export default preview;
```

이 설정을 사용하면 Vitest 애드온이 스토리를 실행할 때 접근성 검사도 함께 수행합니다. 프로젝트 도입 초기처럼 기존 위반이 많은 경우에는 `"todo"`로 시작해 Storybook UI에서 경고를 확인하고, 정리한 뒤 `"error"`로 강화할 수 있습니다.

> 자동 검사는 접근성 검토의 시작점입니다. `Incomplete` 항목과 키보드 탐색, 포커스 이동, 스크린 리더 문맥, 확대·축소 사용성은 사람이 직접 확인해야 합니다. axe-core의 기본 규칙은 WCAG 2.0·2.1 A/AA와 일부 모범 사례를 대상으로 하며, 필요하면 프로젝트 기준에 맞춰 규칙 집합을 조정할 수 있습니다.
{:.prompt-tip }

### 6. 인터랙션 테스트 작성

스토리가 "어떤 상태로 보이는가"를 정의한다면, 인터랙션 테스트는 "사용자가 조작했을 때 어떻게 변하는가"를 검증합니다. `play` 함수는 스토리 렌더링이 끝난 뒤 실행되며, Storybook 10은 `canvas`와 `userEvent`를 `play` 컨텍스트로 제공합니다.

테스트의 assertion과 mock 함수는 `storybook/test`에서 가져옵니다. 과거의 `@storybook/addon-interactions`와 `@storybook/test` 패키지는 별도로 설치하지 않습니다.

아래는 `Button` 클릭 시 `onClick` 콜백이 한 번 호출되는지 검증하는 예시입니다.

```tsx
// src/shared/ui/button.stories.tsx (일부)
import { expect, fn } from "storybook/test";

export const Clickable: Story = {
  args: {
    children: "Click me",
    onClick: fn(),
  },
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Click me" }),
    );

    await expect(args.onClick).toHaveBeenCalledTimes(1);
  },
};
```

`canvas`는 현재 스토리의 렌더링 영역에 범위가 제한된 Testing Library 쿼리를 제공합니다. 같은 문서에 여러 스토리가 렌더링되거나 페이지에 비슷한 텍스트가 많아도 현재 컴포넌트 안에서 요소를 찾을 수 있습니다.

모달과 툴팁처럼 포털을 사용해 Storybook 캔버스 바깥의 `document.body`에 렌더링되는 요소는 `screen`으로 조회합니다.

```tsx
// src/shared/ui/dialog.stories.tsx (일부)
import { expect, screen } from "storybook/test";

export const Default: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Open dialog</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Delete project</DialogTitle>
        <DialogDescription>
          이 작업은 되돌릴 수 없습니다.
        </DialogDescription>
        <DialogClose asChild>
          <Button variant="ghost">Cancel</Button>
        </DialogClose>
      </DialogContent>
    </Dialog>
  ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Open dialog" }),
    );

    await expect(
      await screen.findByRole("heading", { name: "Delete project" }),
    ).toBeVisible();

    await userEvent.click(
      screen.getByRole("button", { name: "Cancel" }),
    );

    await expect(
      screen.queryByRole("heading", { name: "Delete project" }),
    ).not.toBeInTheDocument();
  },
};
```

`play` 함수에서 자주 사용하는 API는 다음과 같습니다.

1. `canvas.getByRole()`과 `canvas.findByRole()`: 현재 스토리 안에서 접근성 역할을 기준으로 요소를 조회합니다.
2. `screen.getByRole()`: 포털처럼 스토리 루트 바깥에 렌더링된 요소를 문서 전체에서 조회합니다.
3. `userEvent.click()`, `userEvent.type()`, `userEvent.tab()`: 실제 사용자에 가까운 입력을 시뮬레이션합니다.
4. `expect()`: DOM 상태와 mock 함수 호출을 검증합니다.
5. `step()`: 긴 시나리오를 의미 있는 단계로 묶어 Interactions 패널에서 읽기 쉽게 만듭니다.

> `fn()`으로 만든 콜백은 assertion에 사용할 수 있고 Actions 패널에서도 호출 내역을 확인할 수 있습니다. 이벤트 Args에는 실행할 수 없는 빈 함수보다 `fn()`을 명시하는 편이 테스트와 디버깅에 유리합니다.
{:.prompt-info }

Storybook의 **Interactions** 패널에서는 `play` 함수의 단계를 순서대로 확인하고 실패한 지점에서 DOM 상태를 조사할 수 있습니다. 다만 브라우저에서 눈으로 확인한 성공은 자동 회귀 검증이 아니므로, 다음 단계에서 같은 스토리를 Vitest로 실행합니다.

### 7. Vitest 애드온으로 스토리를 CI에서 실행하기

`play` 함수는 Storybook UI에서 개발자가 시나리오를 확인하고 디버깅하기에 좋습니다. 그러나 `build-storybook`은 정적 파일을 번들링할 뿐 모든 스토리를 렌더링하거나 `play` 함수를 실행하지 않습니다. 스토리를 회귀 테스트로 사용하려면 Vitest 애드온을 별도로 실행해야 합니다.

React와 Vite 프로젝트에서는 다음 명령으로 구성을 자동 생성합니다.

```bash
npx storybook add @storybook/addon-vitest
```

Vitest 애드온은 Portable Stories를 이용해 스토리를 Vitest 테스트로 변환하고, Playwright의 Chromium을 사용하는 Browser Mode에서 렌더링합니다. 각 스토리는 기본적으로 렌더링 가능 여부를 검사하며, `play` 함수가 있으면 해당 assertion까지 실행합니다.

테스트 계층의 역할은 다음처럼 구분하는 것이 좋습니다.

| 계층                                        | 주된 대상                        | 잡아내는 문제                                  |
| ------------------------------------------- | -------------------------------- | ---------------------------------------------- |
| **일반 Vitest** (`*.test.tsx`, `*.test.ts`) | 순수 로직과 세밀한 컴포넌트 동작 | 정렬, 계산, 유효성 검사, 상태 전이             |
| **Storybook + Vitest 애드온**               | 스토리의 렌더링, `play`, A11y    | 누락된 Provider, 렌더링 오류, 사용자 동작 실패 |
| **`build-storybook`**                       | 정적 Storybook 번들              | 설정, import, 번들링, 정적 자산 오류           |
| **Playwright E2E**                          | 실제 애플리케이션의 사용자 흐름  | 라우팅, 네트워크, 인증, 여러 화면 간 통합 오류 |

일반 Vitest는 빠른 jsdom 환경을 사용하고, Storybook 테스트는 실제 브라우저가 필요한 별도 프로젝트로 분리할 수 있습니다. 일반 테스트의 커버리지에서 스토리를 제외하더라도, Storybook 프로젝트의 커버리지는 필요할 때 별도로 계산할 수 있습니다.

```typescript
// vitest.config.ts (일부)
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    coverage: {
      provider: "v8",
      exclude: [
        "src/**/*.stories.tsx",
        "src/routeTree.gen.ts",
        ".storybook/**",
      ],
    },
  },
});
```

예를 들어 `RecentProjects.stories.tsx`는 목록이 있는 `Default`와 빈 목록인 `Empty` 상태를 보여 주고, `RecentProjects.test.tsx`는 최신 수정일 기준 정렬과 3개 제한 같은 로직을 검증할 수 있습니다.

```tsx
// src/features/dashboard/components/RecentProjects.test.tsx (일부)
import { render, screen } from "@Testing Library/react";
import { describe, expect, it } from "vitest";

import { RecentProjects } from "./RecentProjects";

describe("RecentProjects", () => {
  it("최근 수정일 기준 최신 프로젝트 3개만 보여준다", () => {
    render(<RecentProjects projects={projects} />);

    expect(screen.getByText("Newest")).toBeInTheDocument();
    expect(screen.queryByText("Oldest")).not.toBeInTheDocument();
  });
});
```

`package.json`에는 로컬 실행과 CI 실행 의도가 드러나도록 스크립트를 구분합니다.

```json
{
  "scripts": {
    "test": "vitest run",
    "test-storybook": "vitest run --project=storybook",
    "build-storybook": "storybook build",
    "validate": "pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build"
  }
}
```

#### GitHub Actions에서 검증하기

GitHub Actions의 job은 서로 격리된 실행 환경을 사용합니다. 따라서 각 job에서 소스 체크아웃, pnpm·Node 설정, 의존성 설치를 수행해야 합니다. `actions/setup-node`의 pnpm 캐시를 사용하려면 pnpm 실행 파일을 먼저 설치해야 하므로 `pnpm/action-setup`을 앞에 둡니다.

Storybook 테스트도 Playwright Browser Mode를 사용하므로 Chromium 바이너리를 설치해야 합니다.

```yaml
# .github/workflows/ci.yml
name: Verify application

on:
  pull_request:
  push:
    branches: [main]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: pnpm/action-setup@v6
      - uses: actions/setup-node@v7
        with:
          node-version: 22
          cache: "pnpm"
      - run: pnpm install --frozen-lockfile
      - run: pnpm validate

  storybook-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: pnpm/action-setup@v6
      - uses: actions/setup-node@v7
        with:
          node-version: 22
          cache: "pnpm"
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm test-storybook

  storybook-build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: pnpm/action-setup@v6
      - uses: actions/setup-node@v7
        with:
          node-version: 22
          cache: "pnpm"
      - run: pnpm install --frozen-lockfile
      - run: pnpm build-storybook

  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: pnpm/action-setup@v6
      - uses: actions/setup-node@v7
        with:
          node-version: 22
          cache: "pnpm"
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm test:e2e
```

job을 분리하면 실패 원인을 빠르게 구분하고 병렬 실행할 수 있습니다. 대신 각 job이 의존성을 별도로 설치하므로 작은 프로젝트에서는 하나의 job 안에서 순차 실행하는 편이 더 단순할 수 있습니다. 팀 규모와 CI 실행 시간을 기준으로 선택합니다.

#### 정적 Storybook을 GitHub Pages에 배포하기

`pnpm build-storybook`은 기본적으로 `storybook-static` 디렉터리에 정적 파일을 생성합니다. 검증 워크플로와 배포 워크플로를 분리하면 Pull Request에는 읽기 권한만 주고, 기본 브랜치의 배포 작업에만 `pages: write`와 `id-token: write` 권한을 줄 수 있습니다.

저장소의 **Settings → Pages**에서 배포 원본을 **GitHub Actions**로 선택한 뒤 다음 워크플로를 추가합니다.

```yaml
# .github/workflows/deploy-storybook.yml
name: Deploy Storybook

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "storybook-pages"
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: pnpm/action-setup@v6
      - uses: actions/setup-node@v7
        with:
          node-version: 22
          cache: "pnpm"
      - run: pnpm install --frozen-lockfile
      - run: pnpm build-storybook
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v4
        with:
          path: storybook-static

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

`build` job은 Storybook 정적 파일을 Pages 전용 아티팩트로 업로드하고, `deploy` job은 해당 아티팩트를 배포합니다. `storybook-static`은 생성 결과물이므로 저장소에 커밋하지 않습니다.

> 조직이 AWS의 도메인과 권한 체계를 사용한다면 `storybook-static`을 S3에 업로드하고 CloudFront로 배포할 수 있습니다. 이 경우 GitHub Actions OIDC로 IAM 역할을 위임하고, S3 버킷은 비공개로 유지한 채 CloudFront OAC만 접근하도록 구성하는 편을 권장합니다. `index.html`에는 짧은 캐시 정책을 적용하고 해시가 포함된 정적 자산에는 긴 캐시를 적용하면 배포 직후 구버전 문서가 노출되는 문제를 줄일 수 있습니다.
{:.prompt-tip }

`build-storybook`과 Pages 배포는 "Storybook이 열리는가"를 확인하고 팀에 결과를 공유하는 단계입니다. 픽셀 단위의 시각적 회귀를 검증하려면 별도의 기준 이미지와 비교 과정이 필요합니다. Chromatic을 사용한다면 `@chromatic-com/storybook` Visual Tests 애드온을 추가할 수 있습니다.

```bash
npx storybook add @chromatic-com/storybook
```

> Vitest 애드온은 Vite 기반 Storybook에 적합합니다. Webpack이나 Rspack처럼 Vite를 사용할 수 없는 환경에서는 `@storybook/test-runner`가 대안이지만, 실행 전에 Storybook 서버가 필요하고 Storybook UI의 테스트 위젯과 통합되지 않는다는 차이가 있습니다.
{:.prompt-info }

## 스토리는 어디까지 만들면 좋을까

Storybook에 익숙해지면 반대 방향의 고민이 생깁니다. "모든 컴포넌트와 모든 속성 조합에 스토리를 만들어야 할까?"입니다. 결론부터 말하면 그렇지 않습니다. 스토리도 결국 유지보수해야 하는 코드이므로, 모든 조합을 만들면 컴포넌트를 고칠 때마다 관련 스토리도 함께 고쳐야 합니다. 그러면 중요한 스토리가 중요하지 않은 스토리 사이에 묻힐 수 있습니다.

무엇을 스토리로 남길지는 결국 **재현하기 번거롭거나, 자주 깨질 위험이 있거나, 남에게 보여줘야 하는 상태**인지로 판단하면 됩니다. 아래 세 가지 질문 중 하나라도 "예"라면 스토리로 만들 가치가 높습니다.

1. 이 상태를 실제 앱에서 직접 재현하기 번거로운가? (로딩, 오류, 특정 권한 등)
2. 이 컴포넌트를 여러 곳에서 재사용하거나 자주 수정해 기존 동작이 깨질 위험이 있는가?
3. 이 상태를 디자이너나 QA에게 보여주고 검수받아야 하는가?

### 어떤 컴포넌트에 스토리를 만들까

컴포넌트마다 스토리의 가치가 다르므로, 아래 표를 기준으로 우선순위를 판단합니다.

| 우선순위 | 컴포넌트 특징                              | 저장소 예시                                 |
| -------- | ------------------------------------------ | ------------------------------------------- |
| 높음     | 여러 화면에서 재사용하는 공통 컴포넌트     | `Button`, `Input`, `Card`, `Dialog`         |
| 높음     | 상태나 형태가 여러 개인 컴포넌트           | `ProjectStatusBadge`, `Badge`, `Toast`      |
| 높음     | 엣지 케이스 재현이 번거로운 컴포넌트       | `RecentProjects`(빈 목록), `Skeleton`(로딩) |
| 중간     | 여러 컴포넌트를 조합한 화면 단위           | `ProjectCard`, `MetricCard`                 |
| 낮음     | 한 곳에서만 쓰고 상태가 없는 정적 컴포넌트 | `AuthLayout`, `ThemeToggle`                 |
| 낮음     | UI가 없는 순수 로직(유틸, 커스텀 훅)       | `formatDate`, `useProjectFilters`           |

우선순위가 낮은 마지막 항목, 즉 화면이 없는 순수 로직은 스토리의 대상이 아닙니다. 앞서 살펴본 대로 `formatDate`나 `useProjectFilters` 같은 함수·훅은 Vitest 같은 단위 테스트 도구로 확인하는 편이 맞습니다. Storybook은 화면에서 확인할 요소를 다루는 데 적합합니다.

### 한 컴포넌트에서 어떤 상태까지 만들까

컴포넌트를 정했다면, 그 안에서 어떤 상태를 스토리로 남길지 골라야 합니다. 모든 속성 조합을 나열하는 대신 아래 기준으로 **대표 상태**만 고정합니다.

- **기본 상태**: 가장 일반적인 사용 예시로, 거의 항상 만듭니다.
- **주요 형태와 크기**: 대표적인 몇 개만 만듭니다. 세부 조합은 Controls 패널에서 즉석으로 바꿔 확인합니다.
- **엣지 케이스**: 로딩, 오류, 빈 데이터, 긴 텍스트가 넘치는 경우처럼 실제로 자주 깨지는 상태를 만듭니다.
- **사용자 조작이나 외부 조건이 필요한 상태**: 포커스, 선택, 권한, 네트워크 오류처럼 앱에서 만들기 번거로운 상태를 남깁니다.

스토리와 Controls는 역할이 다릅니다. "값만 살짝 바꿔 보고 싶은" 경우는 Controls로 충분하고, "다시 열었을 때도 그대로 보이도록 기억하고 싶은" 대표 상태만 스토리로 고정합니다. 예를 들어 저장소의 `RecentProjects`는 목록이 채워진 `Default`와 빈 배열을 넘긴 `Empty`, 이 두 상태만 스토리로 남깁니다. 실제 앱에서 "데이터가 없는 화면"을 재현하려면 API를 비워야 하지만, 스토리에서는 `args`로 빈 배열만 넘기면 끝나기 때문입니다.

> 스토리 개수 자체를 목표로 삼지 마세요. `variant` 3개와 `size` 3개를 모두 조합해 9개의 스토리를 만드는 것은 대부분 과합니다. 이런 조합은 Controls 패널에서 확인하고, 스토리는 재현하기 어렵거나 기존 동작이 깨질 위험이 있거나 다른 사람과 공유해야 하는 상태에만 남기는 편이 유지보수에 유리합니다.
{:.prompt-warning }

## 실무에서 자주 쓰는 팁

이제 스토리를 작성할 때 자주 쓰는 패턴을 살펴보겠습니다. 중복을 줄이고 스토리를 더 유연하게 구성하는 방법입니다.

### args 상속으로 중복 제거

Meta의 `args`에 공통 속성을 정의하면 각 스토리에서 중복 선언을 줄일 수 있습니다.

```tsx
// src/features/dashboard/components/MetricCard.stories.tsx
const meta = {
  component: MetricCard,
  args: {
    // 모든 스토리에 공통으로 적용할 기본값
    label: "전체 프로젝트",
    value: 12,
  },
} satisfies Meta<typeof MetricCard>;

export const Default: Story = {}; // 공통 args를 그대로 사용합니다

export const StringValue: Story = {
  args: { label: "진행률", value: "68%" }, // 필요한 값만 덮어씁니다
};
```

`Default` 스토리는 Meta에서 정의한 `label`과 `value`를 그대로 물려받고, `StringValue`는 두 값만 덮어써 문자열 값을 표시합니다.

### render 함수로 커스텀 렌더링

기본적으로 Storybook은 `args`를 속성으로 전달해 컴포넌트를 렌더링합니다. 여러 인스턴스를 나란히 배치하거나 감싸야 할 때는 `render` 함수를 사용합니다. 저장소의 `Button`은 모든 형태를 한 스토리에서 한눈에 비교할 수 있도록 다음과 같이 만듭니다.

```tsx
// src/shared/ui/button.stories.tsx (일부)
export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="primary">Primary</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="danger">Danger</Button>
    </div>
  ),
};
```

`render` 함수를 지정하지 않으면 Storybook이 내부적으로 `(args) => <Component {...args} />`를 실행하므로, 대부분 `args`만으로 충분합니다.

### globalTypes로 커스텀 툴바 토글 만들기

테마, 언어, 화면 밀도처럼 여러 스토리에 공통으로 적용되는 값은 `globalTypes`로 Storybook 툴바에 노출할 수 있습니다. 특정 컴포넌트의 Props를 바꾸는 Controls와 달리, globals는 Storybook 전체의 렌더링 환경을 바꿉니다.

예제 프로젝트가 `[data-density="compact"]` 스타일 분기를 사용한다면 다음처럼 밀도 선택 메뉴를 만들 수 있습니다. Storybook 10에서는 `globalTypes.defaultValue` 대신 `initialGlobals`로 초기값을 지정합니다.

```tsx
// .storybook/preview.tsx (일부)
import { useEffect, type PropsWithChildren } from "react";
import type { Decorator, Preview } from "@storybook/react-vite";

type Density = "comfortable" | "compact";

type DensityRootProps = PropsWithChildren<{
  density: Density;
}>;

function DensityRoot({ density, children }: DensityRootProps) {
  useEffect(() => {
    document.documentElement.setAttribute("data-density", density);

    return () => {
      document.documentElement.removeAttribute("data-density");
    };
  }, [density]);

  return children;
}

const withDensity: Decorator = (Story, context) => {
  const density: Density =
    context.globals.density === "compact"
      ? "compact"
      : "comfortable";

  return (
    <DensityRoot density={density}>
      <Story />
    </DensityRoot>
  );
};

const preview: Preview = {
  globalTypes: {
    density: {
      description: "컴포넌트 화면 밀도",
      toolbar: {
        title: "Density",
        icon: "component",
        items: [
          { value: "comfortable", title: "Comfortable" },
          { value: "compact", title: "Compact" },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    density: "comfortable",
  },
  decorators: [withDensity],
};

export default preview;
```

DOM 속성을 데코레이터 본문에서 바로 변경하면 스토리를 이동한 뒤에도 값이 남을 수 있습니다. 위 예시는 내부 컴포넌트의 `useEffect` 정리 함수에서 속성을 제거해 스토리 간 전역 상태 누수를 막습니다.

이 패턴은 테마, 언어, 밀도, 기기 모드처럼 여러 스토리에 공통으로 적용할 환경을 만들 때 유용합니다. 특정 컴포넌트 하나의 값을 바꾸는 용도라면 globals보다 `args`와 Controls를 우선합니다.

## 정리

- Storybook은 UI 컴포넌트를 애플리케이션에서 분리해 상태별로 개발하고 공유하는 환경입니다.
- 컴포넌트 주도 개발에서는 사용자 흐름과 상태를 먼저 정의하고, 대표 상태를 스토리로 고정한 뒤 Controls로 세부 조합을 탐색합니다.
- Storybook 10의 Controls, Actions, Viewport, Backgrounds 같은 기본 기능은 코어에 포함돼 있으며, Docs·A11y·Themes·Vitest처럼 워크플로를 확장하는 기능만 애드온으로 추가합니다.
- 데코레이터는 테마, 라우터, 전역 상태처럼 컴포넌트가 렌더링되는 데 필요한 환경만 최소한으로 재현합니다.
- `play` 함수는 `canvas`, `userEvent`, `expect`, `fn`을 이용해 사용자 동작과 결과를 스토리 안에서 검증합니다.
- Vitest 애드온은 스토리를 실제 브라우저 기반 컴포넌트 테스트로 실행하며, `build-storybook`은 정적 번들의 설정과 import 오류를 검증합니다. 두 단계는 서로 대체하지 않습니다.
- 일반 Vitest, Storybook 테스트, Playwright E2E는 검증 범위와 실행 비용이 다르므로 테스트 피라미드 안에서 역할을 나눠야 합니다.
- 모든 Props 조합을 스토리로 만들기보다 재현 비용, 회귀 위험, 협업 가치가 높은 상태를 우선하는 편이 유지보수에 유리합니다.

## 출처

- [react-sample 예제 저장소](https://github.com/ydj515/react-sample)
- [Storybook 10 설치](https://storybook.js.org/docs/10.5/get-started/install)
- [Storybook for React with Vite](https://storybook.js.org/docs/10.5/get-started/frameworks/react-vite)
- [스토리 작성과 CSF](https://storybook.js.org/docs/10.5/writing-stories)
- [Storybook Essentials](https://storybook.js.org/docs/10.5/essentials)
- [Autodocs](https://storybook.js.org/docs/10.5/writing-docs/autodocs)
- [Themes 애드온](https://storybook.js.org/docs/10.5/essentials/themes)
- [Interaction tests](https://storybook.js.org/docs/10.5/writing-tests/interaction-testing)
- [Vitest 애드온](https://storybook.js.org/docs/10.5/writing-tests/integrations/vitest-addon)
- [Accessibility tests](https://storybook.js.org/docs/10.5/writing-tests/accessibility-testing)
- [Visual tests](https://storybook.js.org/docs/10.5/writing-tests/visual-testing)
- [Toolbars & globals](https://storybook.js.org/docs/10.5/essentials/toolbars-and-globals)
- [Storybook 배포](https://storybook.js.org/docs/10.5/sharing/publish-storybook)
- [GitHub Actions에서 Node.js 빌드와 테스트](https://docs.github.com/en/actions/tutorials/build-and-test-code/nodejs)
- [GitHub Pages 사용자 지정 워크플로](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [AWS S3 정적 웹사이트 호스팅](https://docs.aws.amazon.com/AmazonS3/latest/userguide/HostingWebsiteOnS3Setup.html)
- [GitHub Actions에서 AWS OIDC 설정](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws)
- [WCAG 개요](https://www.w3.org/WAI/standards-guidelines/wcag/)
