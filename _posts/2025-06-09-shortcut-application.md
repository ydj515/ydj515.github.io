---
title: shortcut cheat sheet 만들기
description: vercel 배포까지
author: ydj515
date: 2025-06-09 11:33:00 +0800
categories: [shortcut]
tags: [shrotcut, vercel, react]
pin: true
math: true
mermaid: true
image:
  path: /assets/img/shortcut/logo.jpg
  lqip: data:image/webp;base64,UklGRpoAAABXRUJQVlA4WAoAAAAQAAAADwAABwAAQUxQSDIAAAARL0AmbZurmr57yyIiqE8oiG0bejIYEQTgqiDA9vqnsUSI6H+oAERp2HZ65qP/VIAWAFZQOCBCAAAA8AEAnQEqEAAIAAVAfCWkAALp8sF8rgRgAP7o9FDvMCkMde9PK7euH5M1m6VWoDXf2FkP3BqV0ZYbO6NA/VFIAAAA
  alt: shortcut
---

## shortcut cheat sheet

개발팀에 새로 합류한 동료가 "IntelliJ에서 자동완성 단축키가 뭐예요?"라고 물어본 적이 있었습니다.
또한 블록 단위의 주석을 일일이 한 줄씩 작성하는 모습을 보며, 생각보다 많은 사람들이 단축키를 잘 모른다는 것을 느꼈습니다.

저 역시 PowerPoint나 한글로 개발 산출물을 작성할 때마다 단축키를 자꾸 잊어버려, 매번 검색하곤 했습니다.
그런 경험을 떠올리며, **자주 사용하는 프로그램들의 단축키를 한곳에서 검색할 수 있는 웹사이트가 있으면 좋겠다**라는 생각이 들었고, 그래서 이 프로젝트를 시작하게 되었습니다.

배포된 앱은 [링크](https://shortcut-cheatsheet.vercel.app/) 에서 확인 가능합니다.


## 목적

- 온보딩을 빠르게: 새로 합류한 팀원이 툴에 익숙해지도록 돕기
- 협업 생산성 향상: 단축키를 잘 활용하면 업무 속도도 빨라지니까!
- 여러 툴 통합: 한 웹에서 IntelliJ, Figma, PowerPoint 등 다양한 툴의 단축키를 확인

## 구현하면서 고민한 것들

단축키 검색 사이트를 최대한 간단하게, 그리고 무료로 만들기 위해서 serverless로 react만 사용하여 vercel에 배포해보기로 했습니다. 이런 과정에서 기술 스택 선택부터 어떤걸 고민했는지 설명합니다.

### 기술 스택 선택 과정

- React 19 + Vite + TypeScript : 최신 React 기능을 사용하며, 빌드 속도와 DX 개선을 위해 Vite를 선택했습니다.
- Tailwind CSS 4 : 빠르게 UI를 구성하기 좋고, 반응형 레이아웃도 쉽게 만들 수 있어 선택했습니다.
- Vitest : 간단한 단위 테스트 작성용으로 도입했습니다.
- vercel : 간단한 react로 빌드된 앱을 github링크를 연동하면 무료로 배포 가능합니다.

### 검색 방식
> 단순 텍스트 검색 외에 functionkey(f1~f12), ⌘ + N, Ctrl + Shift + V 같은 키 조합으로도 검색 가능하록.

이를 위해 검색어를 normalize하고, 키 입력도 단어처럼 처리하는 로직을 추가하였습니다.

```tsx
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const key = e.key;
    
    // Handle function keys (F1-F12)
    if (key.startsWith('F') && /^F[1-9]|F1[0-2]$/.test(key)) {
      e.preventDefault();
      onValueChange(key);
      performSearch(key);
      return;
    }

    if (isModifierKey(key)) {
      pressedKeys.current.add(key);
      return;
    }
    if (pressedKeys.current.size > 0 && key.length === 1) {
      e.preventDefault();
      pressedKeys.current.add(key);
      const combo = formatKeyCombo(pressedKeys.current);
      onValueChange(combo);
      performSearch(combo);
    }
  };

export const formatKeyCombo = (keys: Set<string>): string => {
  return Array.from(keys)
    .map((k) => keyMap[k as KeyMapKey] || k.toUpperCase())
    .sort((a) => (keyMap[a as KeyMapKey] ? -1 : 1))
    .join(" + ");
};
```

### 다국어 지원 및 멀티 OS 지원
> 자동완성', 'component', 'ctrl', '⌘'처럼 다양한 표현을 한국어 영어로 검색할 수 있어야 사용하기 편합니다. 또한 mac, window 사용 user가 모두 검색할 수 있어야합니다.

그래서 아래와 같이 action에 keywords 배열을 활용해 복수 키워드를 등록하고 검색 시 비교하도록 했습니다.

```json
  {
    category: "vscode",
    action: "파일 탐색기 열기/닫기",
    mac: "⌘ + B",
    win: "ctrl + B",
    keywords: ["sidebar", "explorer", "파일 트리", "file"]
  }
```

또한, OS 별 사용자의 키 매핑을 두어서 OS상관없이 검색이 가능하게 했습니다.

```tsx
export const isMacOS = (): boolean => {
  return /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);
};

export const keyMap = {
  Meta: isMacOS() ? "⌘" : "Win",
  Control: "Ctrl",
  Shift: "⇧",
  Alt: isMacOS() ? "Option" : "Alt"
} as const;

export type KeyMapKey = keyof typeof keyMap;

export const isModifierKey = (key: string): boolean => {
  return ["Meta", "Control", "Shift", "Alt"].includes(key);
};
```

### 확장성과 유지보수
> 단축키 검색을 지원하는 프로그램을 추가할 경우 쉽게 추가할 수 있어야 합니다.

단축키 데이터는 JSON으로 관리되며, 추후 새로운 툴을 쉽게 추가할 수 있도록 했습니다.

```ts
export const allShortcuts: Shortcut[] = [
  ...intellijShortcuts,
  ...vscodeShortcuts,
  ...figmaShortcuts,
  ...excelShortcuts,
  ...powerpointShortcuts,
  ...hangulShortcuts,
  ...wordShortcuts
];
```

또한, UI는 React + Tailwind로 구성해 빠르게 프로토타입 제작 -> 배포까지 진행했습니다.


## 회고 및 개선 아이디어

- 단축키를 빠르게 찾을 수 있어 팀원들이 좋아했습니다.
- 현재는 단축키를 직접 입력해야 검색되지만, 자동완성 기능을 추가하면 더 편리할 듯합니다.
- 크롬 확장 프로그램으로도 제작해볼까 고민 중입니다.
