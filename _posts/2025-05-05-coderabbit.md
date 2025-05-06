---
title: 코드리뷰를 해주는 자동화 도구(CodeRabbit)
description: CodeRabbit
author: ydj515
date: 2025-05-05 11:33:00 +0800
categories: [CodeRabbit, AI, PR, review]
tags: [CodeRabbit, AI, PR, review]
pin: true
math: true
mermaid: true
image:
  path: /assets/img/coderabbit/logo.png
  lqip: data:image/webp;base64,UklGRpoAAABXRUJQVlA4WAoAAAAQAAAADwAABwAAQUxQSDIAAAARL0AmbZurmr57yyIiqE8oiG0bejIYEQTgqiDA9vqnsUSI6H+oAERp2HZ65qP/VIAWAFZQOCBCAAAA8AEAnQEqEAAIAAVAfCWkAALp8sF8rgRgAP7o9FDvMCkMde9PK7euH5M1m6VWoDXf2FkP3BqV0ZYbO6NA/VFIAAAA
  alt: coderabbit
---

## 코드리뷰를 해주는 자동화 도구(CodeRabbit)

[링크](https://docs.coderabbit.ai/getting-started/quickstart/)를 참조하여 설명합니다.

### 주요 기능
- `코드 변경사항 요약`: 코드 변경사항의 요약해서 보여줌
- `코드 리뷰 및 피드백`: 오탈자, 함수의 인자를 잘못 넘긴 경우, 디벙깅을 위한 코드, 컨벤션 등에 대한 피드백
- `코드 질문 및 이슈 생성`: CodeRabbit 의 코드리뷰에 질문을 하는 방식으로 자유롭게 질문을 할 수 있음
- `Review Instructions`: CodeRabbit 이 코드리뷰를 할 때, 어떤 기준으로 리뷰를 해야 하는지에 대한 가이드라인을 설정할 수 있는 기능
- `report`: Repository 에서 어떠한 작업들이 있었는지를 보고서 형식으로 제공


### 주요 특징

- `다양한 언어 지원`: JavaScript, Python, Java, Go 등 여러 언어를 지원
- `GitHub/GitLab 연동`: 기존의 Git 워크플로에 자연스럽게 통합
- `AI 리뷰어`: 정적 분석 수준을 넘어서 컨텍스트 기반 피드백 제공
- `커스터마이징`: 팀의 코드 컨벤션에 맞춰 리뷰 기준을 세밀하게 설정 가능

### 정적 분석도구와의 차이

`SonarQube`와 같은 정적 분석 도구는 코드 품질, 보안, 버그 가능성 등을 사전에 탐지해 줍니다. 이런 정적 분석 도구는 코드의 맥락을 보는 것이 아니기 때문에 `CodeRabbit`과는 다릅니다.

문법 오류를 넘어선 코드의 문맥에 대한 리뷰 코멘트를 생성한다는 점이 차이가 있습니다.

[출처]
- https://www.coderabbit.ai/
- https://docs.coderabbit.ai/getting-started/quickstart
- https://github.com/coderabbitai
- https://github.com/coderabbitai/ai-pr-reviewer
- https://tech.inflab.com/20250303-introduce-coderabbit/