---
title: "중국 AI모델 테스트(feat.간트차트)"
date: 2026-08-31 00:00:00 +0900
description: "같은 대시보드 이미지와 짧은 요청을 6개 LLM에 전달하고, 생성 시간과 비용부터 화면 재현도, 실제 동작, 코드 가독성까지 직접 비교한 POC 기록입니다."
author: ydj515
categories: [AI, llm]
tags: [llm, coding-agent, image-to-code, frontend, poc, dashboard]
image:
  path: /assets/img/llm/0.%20sample-input-image/full_staffing_dashboard_mockup.png
  alt: "LLM 대시보드 POC에 사용한 인력 배치 대시보드 목업"
---

요즘 중국계 LLM이 성능과 비용 효율 모두 좋아졌다는 이야기를 자주 접해서 간단하게 이미지 한 장으로 어느정도의 UI를 만들 수 있는지 궁금해 간단한 POC를 진행했습니다.

중국계 LLM 5종(Kimi, GLM, MiniMax, Qwen, MiMo)과 비교를 위해 GPT-5.6 Luna로 간트차트 대시보드 이미지와 프롬프트 한줄로 동작되는 HTML을 만들게 했습니다. 모델별로 약 3회 실행해보았고 그 결과입니다.

## 진행방식

### 프롬프트

저는 이미지 한장과 아래 프롬프트 한줄로 비교하였습니다.

> "샘플 이미지를 보고 인력 배치 간트차트 식 ui만들어줘. 실제로 어느정도 동작하는 html파일 2개 만들어줘."

아래 항목을 기준으로 여러 모델을 비교하였습니다.

1. 기준 이미지의 정보 구조를 이해하고 화면으로 재현하는 능력
2. 인력 배치 간트 UI의 완성도
3. 필터, 상세 패널, 등록 모달, 내보내기 등 실제 인터랙션 구현 범위
4. 결과를 만들기까지 걸린 시간, 사용 토큰, 비용
5. 모델이 작업을 나누고 검증하는 방식
6. 샘플 화면이 없는 `교체 이력`과 `인력 운영` 메뉴를 업무 화면으로 확장하는 방식

![평가 기준이 된 풀 스태핑 대시보드 목업](/assets/img/llm/0.%20sample-input-image/full_staffing_dashboard_mockup.png)

### 왜 이 이미지를 골랐나

이번 POC에서는 화면을 얼마나 예쁘게 그리는지만 보지 않았습니다. 인력 배치 대시보드는 여러 종류의 정보를 한 화면에서 연결해야 합니다. 모델이 이 관계를 이해하는지 보려면 구조가 복잡한 입력 이미지가 필요했고, 간트차트가 딱이라고 생각했습니다.

- 전체 현황을 빠르게 파악하는 KPI 카드
- 데이터를 좁혀 가는 다중 필터
- 프로젝트 기간과 인력 투입 기간을 함께 보여 주는 간트차트
- 인력 교체 시점과 전후 담당자의 연결 관계
- 선택한 이벤트를 설명하는 우측 상세 패널
- 여러 업무 메뉴를 연결하는 좌측 내비게이션

### 체크포인트

#### 1. 정보 우선순위

화면을 처음 열었을 때 진행 사업 수, 투입 인력, 교체 예정, 종료 예정 같은 핵심 지표를 바로 확인할 수 있는지 살펴봤습니다. KPI와 필터, 차트, 상세 정보가 한 화면에서 잘 구분되는지도 함께 확인했습니다.

#### 2. 시간축과 데이터 관계

간트차트는 색상 막대를 늘어놓는 UI가 아니라 날짜 관계를 보여 주는 차트입니다. 아래 항목이 있는지 점검했습니다.

- 월·주·일 눈금과 실제 날짜의 정렬
- 프로젝트 전체 기간과 개별 인력 투입 기간의 포함 관계
- 한 프로젝트에 여러 인력이 순차 또는 동시 투입되는 표현
- 인력 교체 날짜와 이전·후속 담당자의 연결
- 오늘 날짜 표시와 현재 투입 상태

#### 3. 차트 가독성과 정보 밀도

사업명, 발주처, PM, 인력명, 기간, 역할을 한 화면에 담았을 때 막대와 라벨이 겹치지 않는지 확인했습니다. 고정 열, 가로 스크롤, 행 높이, 범례, 색상 구분도 살펴보며 데이터가 늘어나도 내용을 알아보기 쉬운지 비교했습니다.

#### 4. 요약에서 상세로 이어지는 흐름

KPI 카드나 간트 막대를 눌렀을 때 해당 프로젝트의 상세 정보가 표시되는지도 확인했습니다. 담당자 변경 내역과 교체 사유, 인수인계 상태처럼 차트만으로는 알기 어려운 정보가 상세 패널에 담겼는지도 비교했습니다.

#### 5. 실제 동작

아래 기능은 버튼 모양만 있는지, 실제 데이터와 연결돼 있는지를 구분했습니다.

- 발주처·PM·인력·검색 필터
- 프로젝트·교체 이력·인력 운영 탭
- 현재 투입만 보기와 기간 이동
- 배치 또는 사업 등록·수정
- CSV 내보내기와 인쇄
- 간트 막대 선택, 드래그, 크기 조절

토스트만 띄우는 동작과 데이터나 화면 상태를 바꾸는 동작은 같은 점수를 주지 않았습니다.

#### 6. 샘플이 없는 메뉴의 해석

사용한 이미지에는 `교체 이력`과 `인력 운영` 메뉴가 보이지만, 두 메뉴를 눌렀을 때 나타날 별도 화면 이미지는 제공하지 않았습니다. 이 부분에서는 모델이 메뉴명과 대시보드 문맥만으로 회사에서 사용할 만한 후속 화면을 스스로 구성하는지 궁금했습니다.

- `교체 이력`: 프로젝트, 교체일, 이전·후속 담당자, 교체 사유, 인수인계 상태를 연결한 목록이나 상세 화면을 만드는가
- `인력 운영`: 인력별 현재 투입, 예정 프로젝트, 가동률, 가용 시점, 중복 배치를 확인할 화면을 만드는가

평가할 때는 세 수준을 구분했습니다.

1. 샘플 데이터와 필터·상세 조회가 연결된 별도 화면을 구성한 경우
2. 정적인 테이블이나 카드만 제공한 목업인 경우
3. 메뉴 선택 표시나 토스트만 바뀌고 실제 콘텐츠는 없는 경우

이 항목에서는 원본과 얼마나 똑같이 만들었는지보다, 메뉴 이름만 보고 필요한 화면과 기능을 얼마나 구체적으로 만들어 냈는지를 봤습니다.

#### 7. 업무용 화면으로서의 확장성

샘플 데이터가 적을 때만 보기 좋은 화면인지, 프로젝트와 인력이 많아져도 내용을 확인하기 편한지 봤습니다. 화면 크기에 맞게 배치가 바뀌는지, 스크롤과 고정 헤더·열이 제대로 동작하는지, 검색 결과가 없을 때 안내가 나오는지, 한 사람에게 일이 과하게 배정됐을 때 경고하는지도 함께 확인했습니다.

## 어떤 기준으로 봤나

### 코드 품질 평가 원칙

동작하는 HTML파일을 만들어 달라고 프롬프트를 넣었기에 한 파일 안에 `<style>`과 `<script>`를 둔 것 자체는 감점하지 않았습니다.

감점한 부분은 아래와 같습니다.

- `style=""` 속성과 `onclick=""` 같은 인라인 핸들러의 과도한 사용
- 수백~수천 자를 한 줄에 넣은 압축 코드
- 상태, 데이터, 렌더링, 이벤트 로직의 분리 여부
- 함수명과 주석을 통해 의도를 파악할 수 있는지
- 디자인 간 중복 코드와 데이터 필드 계약의 일관성
- 문법 검사를 넘어 실제 런타임 오류가 없는지
- 버튼이 실제 상태를 바꾸는지, 토스트만 표시하는지

### 코드 품질 평가

코드 품질은 아래 항목을 기준으로 평가했습니다.

- 구조와 역할 분리: 데이터, 상태, 렌더링, 이벤트 등이 함수와 영역으로 구분되는가
- 포맷과 직접 가독성: 줄바꿈, 들여쓰기, 한 줄에 너무 긴 코드인지
- 결합도와 변경 용이성: 인라인 이벤트·스타일, 중복 코드 등 강결합이 적은가
- 정확성과 일관성: 런타임 오류가 없고 데이터 필드 계약, 함수 인자, 이벤트 대상이 일관적인가
- 이름과 문서화: 함수·변수명이 역할을 설명하고 복잡한 계산이나 영역에 필요한 주석이 있는가

## 전체 결과

### 비용·시간·토큰

| 모델          | 추론 설정 |        시간 |  토큰 |      비용 | 관측 비용/1K 토큰 | 기능 화면 | 정상 실행 |
| ------------- | --------- | ----------: | ----: | --------: | ----------------: | --------: | --------- |
| MiniMax-M3    | Thinking  | **4분 9초** | 35.2K |     $0.05 |           $0.0014 |       2개 | ○         |
| GPT-5.6 Luna  | Xhigh     |    8분 13초 | 88.0K |     $0.11 |           $0.0013 |       3개 | ○         |
| Qwen 3.8      | Max       |    9분 44초 | 44.8K |     $0.33 |           $0.0074 |       2개 | ○         |
| MiMo V2.5 Pro | 기본 기록 |        10분 | 50.6K | **$0.04** |       **$0.0008** |       3개 | △         |
| GLM-5.3       | Max       |   11분 38초 |   47K |     $0.32 |           $0.0068 |       3개 | △         |
| Kimi K3       | Max       |   23분 54초 | 84.7K |     $1.29 |           $0.0152 |       2개 | ○         |

#### 순위

- 속도는 MiniMax가 가장 빨랐으며, Luna, Qwen, MiMo, GLM, Kimi 순입니다.

- 비용은 MiMo가 가장 저렴했으며, MiniMax, Luna, GLM, Qwen, Kimi 순입니다. 다만 MiMo는 런타임 실패율이 높아 최저 비용만으로 평가하면 안 됩니다.

- 토큰 사용량은 MiniMax가 가장 적었으며 Qwen, GLM, MiMo, Kimi, Luna 순입니다. Luna는 토큰을 가장 많이 사용했지만 Kimi보다 비용은 크게 낮았습니다.

## 모델별 결과

### Kimi K3 Max

#### 실제 렌더링

모든 이미지는 모델이 만든 HTML을 수정하지 않고 1280×720 브라우저의 첫 화면에서 캡처했습니다. 사업명, 발주처, 인명, PM 이름 등 민감정보에는 캡처 단계에서만 블러를 적용했으며, 메뉴명·상태·날짜·수치처럼 평가에 필요한 정보는 그대로 두었습니다.

`gantt-design-a.html`

![Kimi K3 Max 디자인 A 실제 렌더링](/assets/img/llm/screenshots/test-kimik3/gantt-design-a.png)

`gantt-design-b.html`

![Kimi K3 Max 디자인 B 실제 렌더링](/assets/img/llm/screenshots/test-kimik3/gantt-design-b.png)

<details markdown="1">
<summary>상세 분석 보기</summary>

#### 생성 과정

1. 입력 폴더 및 이미지 확인
2. 이미지 확인 후 약 9분 20초간 진행 정체, 사용자 재개 요청 후 약 3분 14초 추가 검토를 통한 구현 방향 확정
3. 디자인 A 우선 완성 후 동일 데이터 및 구조 기반 디자인 B 제작
4. 두 HTML 파일의 JavaScript 문법 검사
5. Chrome 헤드리스 모드를 통한 실제 화면 렌더링 및 스크린샷 확인
6. 오늘 표시선의 막대 라벨 가림 현상 확인 후 레이어 순서 및 클릭 방해 문제 수정
7. 수정 사항 반영 후 JavaScript 문법 및 화면 렌더링 재검사

#### 구현 범위

- 프로젝트 간트, 사업 기간, 인력 투입 바, 교체 마커, 오늘 표시선
- 발주처·PM·인력·검색 필터
- 프로젝트·교체 이력·인력 운영 3개 탭
- 인력 바와 교체 마커를 선택하는 우측 상세 패널
- KPI 실시간 계산
- 디자인 A의 새 사업 등록, CSV 내보내기, 현재 투입 토글, 필터 초기화
- 5개 사업과 14명 규모의 샘플 데이터

#### 평가

원본의 정보 구조와 레이아웃을 전반적으로 잘 재현했습니다. 특히 전체 대시보드의 사이드바, KPI, 필터, 간트 차트, 상세 패널 등 주요 구성 요소가 원본과 유사하게 구현되었습니다.

또한 실제 브라우저에서 렌더링 상태를 확인하고, 발견된 화면상의 문제를 수정하는 과정을 거쳐 완성도를 높였습니다. 최종 브라우저 검사 결과 두 파일 모두 콘솔 오류 없이 정상적으로 로드되었으며, 디자인 A의 신규 사업 등록 모달도 정상적으로 작동하는 것을 확인했습니다.

#### 실제 동작 범위

두 결과 모두 주요 기능을 직접 사용할 수 있는 프로토타입으로 구현되었습니다. 디자인 A는 필터, 탭 전환, 상세 패널, KPI 재계산, 사업 등록, CSV 내보내기 기능이 실제 데이터와 연동되어 동작합니다.

#### 코드 품질

- 두 파일 모두 하나의 HTML 파일 안에 `<style>`과 `<script>`를 포함하는 방식으로 작성되었습니다.
- 데이터 처리, 필터링, KPI 계산, 간트 렌더링, 상세 정보 표시, 탭 전환, 내보내기 기능이 각각 별도의 함수로 구분되어 있습니다.
- HTML 속성에 직접 이벤트를 작성하지 않고 JavaScript에서 이벤트를 연결해 마크업과 동작 로직을 분리했습니다.
- 두 파일에 총 63개의 주석이 있어 각 코드 영역의 역할을 파악하기 쉽습니다.
- 두 파일의 `style=""` 속성은 총 45개로 다소 많은 편이지만, 대부분 간트 위치나 색상처럼 데이터에 따라 동적으로 결정되는 값을 표현하는 데 사용되었습니다.

코드 가독성: **★★★★☆**. 함수 분리와 주석은 좋지만 단일 파일 크기가 크고 템플릿 문자열 안의 HTML·스타일 계산이 복잡합니다.

#### HTML·CSS 구현 예시

Kimi의 디자인 A는 사이드바와 메인 영역을 먼저 나누고, 메인 안에서 KPI·탭·필터·간트·상세 패널을 순서대로 배치해 화면의 정보 구조가 잘 드러납니다.

```html
<aside class="sidebar"><!-- 세부 내용 생략 --></aside>
<main class="main">
  <div class="topbar"><!-- 세부 내용 생략 --></div>
  <section class="kpis" id="kpis"></section>
  <nav class="tabs" id="tabs"><!-- 세부 내용 생략 --></nav>
  <section class="filters"><!-- 세부 내용 생략 --></section>
  <div id="view-projects">
    <div class="content">
      <section class="gantt-card"><!-- 세부 내용 생략 --></section>
      <aside class="detail" id="detail"></aside>
    </div>
  </div>
</main>
```

CSS에서는 주요 색상과 배경값을 변수로 관리하고, Flexbox를 이용해 전체 화면과 간트·상세 패널의 배치를 구성하여 색상이나 사이드바 너비를 변경할 때 관련 값을 한곳에서 수정할 수 있어 관리가 편리한 구조로 작성되었습니다.

```css
:root {
  --bg: #f3f5fa;
  --card: #fff;
  --border: #e7eaf2;
  --blue: #2f6bff;
  --sidebar: #202a4d;
}
.sidebar { width:236px; display:flex; flex-direction:column; }
.main { flex:1; min-width:0; padding:26px 32px 60px; }
.content { display:flex; gap:20px; align-items:flex-start; }
.gantt-card { flex:1; min-width:0; overflow:hidden; }
```

화면 구조와 동적 렌더링 영역은 JavaScript로 분리하는 등 화면 구조와 데이터 처리 영역이 비교적 명확하게 나뉘어 있습니다.

#### JavaScript 동작 예시: 기능별 함수 분리

`gantt-design-a.html`에서는 교체 이력을 필터링하고 화면에 표시하는 과정을 별도의 함수로 구성하였고, 데이터 필터링, 정렬, 화면 생성 순서가 명확해 특정 기능을 수정할 때 관련 코드를 찾기 쉽습니다.

```javascript
function renderHandoffs(){
  const rows = HANDOFFS.filter(h => {
    const p = proj(h.pid);
    if (!projectMatch(p)) return false;
    if (F.person !== 'all' && h.from.name !== F.person && h.to.name !== F.person) return false;
    return true;
  }).sort((a, b) => D(a.date) - D(b.date));

  // 테이블 렌더링 부분 생략
}
```

전반적인 흐름은 이해하기 쉽지만, 하나의 함수 안에서 데이터 처리와 HTML 생성이 함께 이루어지는 부분이 있어 파일 규모가 더 커질 경우 기능별 분리가 덜 되었습니다.

#### 한계

- 전체 비교 대상 가운데 실행 시간과 비용이 가장 높은 편입니다.
- 이미지 분석 과정에서 작업이 장시간 정체되어 사용자 개입 후 작업이 재개되었습니다.
- 단일 HTML 파일의 크기가 각각 약 46KB와 31KB로 비교적 큰 편입니다.

</details>

### GLM-5.3 Max

#### 실제 렌더링

`index.html`

![GLM-5.3 Max 비교 런처 실제 렌더링](/assets/img/llm/screenshots/test-glm53/index.png)

`design-1-toss-light.html`

![GLM-5.3 Max 라이트 모드 화면 실제 렌더링](/assets/img/llm/screenshots/test-glm53/design-1-toss-light.png)

`design-2-dark-pro.html`

![GLM-5.3 Max 다크 모드 화면 실제 렌더링 오류 상태](/assets/img/llm/screenshots/test-glm53/design-2-dark-pro.png)

`design-3-compact-csv.html`

![GLM-5.3 Max 컴팩트 화면 실제 렌더링](/assets/img/llm/screenshots/test-glm53/design-3-compact-csv.png)

> 다크 모드 화면은 실행 중 오류가 발생한 상태를 그대로 캡처했습니다.

<details markdown="1">
<summary>상세 분석 보기</summary>

#### 생성 과정

1. 두 이미지 입력 시도 및 이미지 지원 여부 확인
2. 이미지 직접 확인 불가 판단 후 toss_linear, full_staffing_dashboard_mockup 파일명과 일반적인 인력 배치 간트 구조를 바탕으로 요구사항 재구성
3. 라이트·다크·컴팩트 3개 디자인 방향 및 기능 구성 확정
4. 각 기능 화면 순차 구현 후 비교용 인덱스 페이지 제작
5. HTML 내 JavaScript 추출 후 node --check를 통한 문법 검사

#### 구현 범위

- 인력 중심의 배치 간트
- 간트 막대 드래그 이동 및 오른쪽 가장자리를 이용한 기간 조절
- 배치 추가·수정·삭제 모달과 상세 팝오버
- 검색, 프로젝트 필터, 팀 탭, 줌, 월 이동
- 인력별 할당률 계산 및 100% 초과 경고
- 컴팩트 화면의 CSV 내보내기와 인쇄 기능

#### 평가

모델이 원본 이미지를 직접 확인하지 못하여 input 이미지 파일명을 해석하여 의도되지않은 기능과 세 가지 디자인 방향을 구현했습니다. 테마를 적용하였으며, 특히 라이트 모드 화면은 직접 조작할 수 있는 기능이 많고, 현재 브라우저 검사에서도 등록 모달이 정상적으로 작동했습니다.

다만 원본이 프로젝트 중심의 사업 및 인력 교체 관리 화면인 것과 달리, GLM의 결과물은 사람 중심의 가동률과 인력 배치 관리에 초점이 맞춰져 있습니다

#### 실제 동작 범위

라이트 모드 화면과 컴팩트 화면은 주요 기능이 실제로 동작하지만, 다크 모드 화면은 초기 렌더링 과정에서 오류가 발생합니다.

라이트 모드 화면에서는 검색, 필터, 줌, 배치 등록·수정·삭제, 간트 막대 이동과 기간 조절 기능이 데이터와 연결되어 있습니다. 컴팩트 화면에서는 프로젝트 강조, 기간 변경, CSV 다운로드, 인쇄 기능을 사용할 수 있습니다.

#### 코드 품질

- 세 기능 화면 모두 `<style>`과 `<script>`를 하나의 HTML에 포함하고 있으며, 전체적인 줄바꿈은 비교적 일정하게 유지되어 있습니다.
- 렌더링, 모달, 팝오버, 범례, 툴팁 등을 각각 함수로 구분했습니다.
- HTML 속성에 작성한 인라인 이벤트 핸들러가 총 13개 있으며, JavaScript에서 이벤트를 연결하는 방식과 함께 사용되고 있습니다.
- 코드 설명을 위한 주석이 없어 날짜 계산, 드래그 상태 관리, 할당률 계산의 의도를 처음부터 파악하기 어렵습니다.
- JavaScript 문법 검사만 수행했기 때문에 실제 실행 과정에서 발생한 `m` 변수 오류를 사전에 발견하지 못했습니다.

코드 가독성은 **★★★☆☆**. 기본적인 함수 분리는 이루어져 있지만 주석이 없고 이벤트 연결 방식이 혼재되어 있으며, 실제 실행 오류까지 발생해 코드의 신뢰도는  떨어집니다.

#### HTML·CSS 구현 예시

GLM의 라이트 모드 화면은 전체 앱을 사이드바와 메인 영역으로 나누고, 메인 영역 안에 상단 도구 모음과 간트를 배치하였습니다.

```html
<div class="app">
  <aside class="sb"><!-- 세부 내용 생략 --></aside>
  <div class="main">
    <header class="top">
      <input id="q" type="text" placeholder="이름 · 역할 · 팀 검색">
      <div class="seg" id="zoomSeg"><!-- 세부 내용 생략 --></div>
      <button class="btn pri" id="addBtn">+ 새 배치</button>
    </header>
    <div class="legend" id="legend"><!-- 세부 내용 생략 --></div>
    <div class="gantt" id="gantt"></div>
  </div>
</div>
<div class="mask" id="mask"><!-- 세부 내용 생략 --></div>
```

CSS는 짧은 클래스명을 사용하고 각 규칙을 비교적 간결하게 작성했지만, `sb`, `f`, `pop`과 같은 축약형 클래스명을 사용했습니다.

```css
.app{display:flex;height:100vh;overflow:hidden}
.sb{width:216px;background:#fff;border-right:1px solid #EBEDF2;
  display:flex;flex-direction:column;padding:14px 10px;flex-shrink:0}
.main{flex:1;display:flex;flex-direction:column;min-width:0}
.top{display:flex;align-items:center;gap:10px;padding:12px 20px;
  background:#fff;border-bottom:1px solid #EBEDF2;flex-wrap:wrap}
```

또한 라이트 모드 화면에서는 버튼 ID를 기준으로 이벤트를 연결하는 방식과 HTML 속성에 직접 이벤트를 넣는 방식을 함께 사용합니다.

#### JavaScript 동작 예시: 문법 검사에서 발견되지 않은 변수 오류

`design-2-dark-pro.html`의 `maxUtilRange` 함수는 인자로 `mId`를 받지만, 내부에서는 정의되지 않은 `m.id`를 사용하고 있습니다.

```javascript
const maxUtilRange = mId => {
  let mx = 0;
  for (let i = 0; i < NDAYs; i++) {
    const u = utilOn(m.id, at(i));
    if (u > mx) mx = u;
  }
  return mx;
};
```

여기서는 `m.id`가 아니라 `mId`를 사용해야 합니다. 문법 자체에는 문제가 없기 때문에 `node --check` 검사에는 통과하지만, 브라우저에서 실제로 실행하면 `ReferenceError`가 발생합니다.

#### 한계

- 다크 모드 화면은 `maxUtilRange` 함수에서 정의되지 않은 `m`을 참조해 실행 중 `ReferenceError`가 발생합니다.
- `node --check`는 문법 오류만 검사하기 때문에 이러한 실행 단계의 오류는 확인하지 못했습니다.
- 원본 이미지를 직접 확인하지 못해 프로젝트 그룹 구조, 교체 상세 화면, 전체적인 시각 비율 등을 충분히 반영하지 못했습니다.
- Qwen과 비용 차이가 크지 않은 반면, 실행 속도와 원본 재현도 측면에서는 뚜렷한 우위를 보이지 못했습니다.

</details>

### MiniMax-M3 Thinking

#### 실제 렌더링

`design1_full_dashboard.html`

![MiniMax-M3 Thinking 풀 대시보드 실제 렌더링](/assets/img/llm/screenshots/test-minimax/design1_full_dashboard.png)

`design2_toss_linear.html`

![MiniMax-M3 Thinking 미니멀 화면 실제 렌더링](/assets/img/llm/screenshots/test-minimax/design2_toss_linear.png)

<details markdown="1">
<summary>상세 분석 보기</summary>

#### 생성 과정

1. 입력 폴더 및 두 이미지 확인
2. 약 14.7초간 이미지 검토 후 두 가지 디자인 방향 및 작업 항목 확정
3. 풀 대시보드 우선 구현 후 Toss 스타일 화면 제작
4. 두 HTML 파일의 인라인 JavaScript 추출 및 문법 검사
5. 로컬 브라우저를 통한 두 파일 실행 확인
6. 별도 스크린샷 비교 및 브라우저 콘솔 오류 검사 미실시

#### 구현 범위

- 원본과 유사한 사이드바, KPI, 탭, 필터, 간트, 상세 패널
- 간트 막대 툴팁 및 프로젝트 선택
- 교체선, 교체 라벨, 오늘 표시선
- 현재 투입 인력 표시 전환 및 필터 초기화
- 토스트 알림

#### 평가

4분 9초, $0.05로 비교 대상 중 빠르고 비용이 낮습니다. 두 화면 모두 현재 브라우저에서 콘솔 오류 없이 정상적으로 로드됐으며, 시각적으로도 원본의 주요 구조를 잘 반영했습니다. 짧은 시간 안에 여러 디자인 시안을 만들어 비교하는 용도로는 특히 효율적입니다.

다만 화면에 표시된 기능 중 실제 데이터와 연결되지 않은 요소가 많아, 완성된 업무용 프로토타입보다는 디자인 검토용 목업에 가깝습니다.

#### 실제 동작 범위

간트 데이터 표시, 막대 툴팁, 프로젝트 선택, 상세 패널 갱신 등 기본적인 화면 상호작용은 정상적으로 동작합니다.

반면 내보내기와 새 사업 등록 버튼은 실제 기능을 실행하지 않고 토스트 메시지만 표시하며, 탭 역시 선택된 항목의 스타일과 안내 메시지만 바뀌며, 실제로 다른 데이터 화면으로 전환되지는 않습니다. 일부 필터도 실제 데이터 조건과 연결되지 않고 화면 요소로만 구성되어 있습니다.

따라서 화면 구성과 사용 흐름을 검토하기에는 충분하지만, 실제 업무 기능까지 검증하는 프로토타입으로써는 적합하지 않습니다.

#### 코드 품질

- CSS와 JavaScript를 하나의 HTML 파일에 포함했지만 전체적인 줄바꿈과 코드 영역 구분은 잘 유지되어 있습니다.
- 두 파일에 총 49개의 주석이 있으며 렌더링, 상세 정보, 툴팁, 탭, 토스트 기능도 각각 함수로 구분되어 있습니다.
- HTML 인라인 이벤트 핸들러는 총 5개로 비교적 적습니다.
- 실제 기능이 없는 버튼도 함수명과 토스트 메시지만 보면 기능이 구현된 것처럼 보일 수 있어, 코드를 검토할 때 실제 데이터 변경 여부를 별도로 확인해야 합니다.

코드 가독성은 **★★★☆☆**. 코드 형식과 주석은 양호하지만, 실제 기능과 화면 연출용 동작이 코드상에서 명확하게 구분되지 않고 일부 긴 템플릿 코드가 존재합니다.

#### HTML·CSS 구현 예시

MiniMax는 일반적인 데스크톱 대시보드 구조를 사용했습니다. KPI 카드는 HTML에 직접 작성하고, 간트와 상세 패널의 일부 데이터만 JavaScript를 이용해 채우는 방식입니다.

```html
<div class="app">
  <aside class="sidebar"><!-- 세부 내용 생략 --></aside>
  <main class="main">
    <div class="top"><!-- 세부 내용 생략 --></div>
    <section class="kpis"><!-- 세부 내용 생략 --></section>
    <section class="filters"><!-- 세부 내용 생략 --></section>
    <div class="gantt-wrap">
      <section class="gantt"><!-- 세부 내용 생략 --></section>
      <aside class="detail" id="detailPanel"><!-- 세부 내용 생략 --></aside>
    </div>
  </main>
</div>
```

CSS는 디자인 변수, 전체 레이아웃, 개별 컴포넌트 순으로 비교적 잘 정리되어 있으며 Grid를 적극적으로 사용합니다. 선택자와 속성 사이의 공백도 일정하게 유지되어 MiMo나 Luna보다 코드를 읽기 편합니다.

```css
:root {
  --bg: #f4f6fb;
  --panel: #ffffff;
  --side: #0f1c2e;
  --primary: #2b6cff;
  --shadow: 0 1px 2px rgba(15,28,46,0.04),
            0 4px 12px rgba(15,28,46,0.05);
}
.app { display:grid; grid-template-columns:240px 1fr; min-height:100vh; }
.kpis { display:grid; grid-template-columns:repeat(4,1fr); gap:16px; }
.gantt-wrap { display:grid; grid-template-columns:1fr 300px; gap:16px; }
```

화면 구성 자체는 잘 정리되어 있지만, 내보내기와 등록 버튼은 실제 처리 기능 없이 토스트 메시지만 호출합니다. 화면 완성도는 높으나 실제 기능 구현은 안되어있습니다.

#### JavaScript 동작 예시: 실제 기능 대신 표시되는 토스트

`design1_full_dashboard.html`의 내보내기와 등록 버튼은 실제 기능을 실행하지 않고 안내 메시지만 표시합니다.

```html
<button class="btn" onclick="showToast('CSV 내보내기를 시작합니다')">
  내보내기
</button>
<button class="btn primary" onclick="showToast('새 사업 등록 화면으로 이동합니다')">
  + 새 사업 등록
</button>
```

필터 초기화도 같은 방식입니다.

```javascript
function resetFilters() {
  showToast('필터가 초기화되었습니다');
}
```

#### 한계

- 내보내기와 새 사업 등록은 실제 기능 없이 안내 메시지만 표시합니다.
- 탭은 선택 상태만 변경되며 교체 이력이나 인력 운영 화면으로 실제 전환되지 않습니다.
- 대부분의 필터가 화면 요소로만 구현되어 실제 데이터 필터링 기능은 제한적입니다.
- 풀 대시보드의 샘플 데이터에 `범계처`, `범조문` 등의 오탈자가 있습니다.
- 화면 디자인의 완성도는 높은 편이지만 실제 업무 기능은 Kimi, Luna, Qwen보다 적습니다.

</details>

### Qwen 3.8 Max

#### 실제 렌더링

`design_a_full_dashboard.html`

![Qwen 3.8 Max 풀 대시보드 실제 렌더링](/assets/img/llm/screenshots/test-qwen38/design_a_full_dashboard.png)

`design_b_linear.html`

![Qwen 3.8 Max Linear 화면 실제 렌더링](/assets/img/llm/screenshots/test-qwen38/design_b_linear.png)

<details markdown="1">
<summary>상세 분석 보기</summary>

#### 생성 과정

1. 입력 폴더 및 두 이미지 확인
2. 약 3분 27초간 이미지 분석 후 두 가지 디자인 방향 확정
3. 기능 중심의 디자인 A 우선 구현 후 동일 데이터 기반 디자인 B 제작
4. 두 HTML 파일의 JavaScript 추출
5. node --check를 통한 JavaScript 문법 검사

#### 구현 범위

- 발주처, PM, 인력, 검색, 현재 투입 여부 필터
- 프로젝트 간트 및 인력 교체 마커
- 우측 교체 상세 패널
- 프로젝트, 교체 이력, 인력 운영 탭
- 디자인 A의 CSV 내보내기 및 새 사업 등록 모달
- 데이터 기반 KPI 계산

#### 평가

두 파일 모두 현재 브라우저에서 콘솔 오류 없이 정상적으로 로드됐습니다. 디자인 A의 새 사업 등록 모달 역시 정상적으로 작동했습니다.

원본의 주요 정보 구조를 유지하면서 필터링, KPI 재계산, 탭 전환, 데이터 추가, CSV 내보내기까지 실제 기능으로 구현해 화면 재현도와 기능 완성도의 균형이 좋습니다.

#### 실제 동작 범위

두 결과 모두 단순한 화면 목업이 아니라 주요 기능을 직접 사용할 수 있는 프로토타입으로 구현되었습니다.

디자인 A에서는 필터링, KPI 재계산, 탭별 콘텐츠 전환, 교체 상세 표시, CSV 생성, 새 사업 등록 모달, 신규 프로젝트 데이터 추가 기능이 실제 데이터와 연결되어 있습니다. 디자인 B에서도 필터, 탭 전환, 교체 상세 기능은 정상적으로 사용할 수 있지만 사업 등록과 CSV 내보내기 기능은 포함되어 있지 않습니다.

#### 코드 품질

- 두 파일 모두 데이터 처리, 필터링, 렌더링, 상세 정보 표시, 탭 초기화 등을 각각 별도의 함수로 구분했습니다.
- HTML 속성에 직접 이벤트를 작성하지 않고 JavaScript에서 일관되게 이벤트를 연결했습니다.
- 설명용 주석은 없지만 함수명과 상태 객체 이름이 비교적 명확해 코드 흐름을 파악하기 어렵지 않습니다.
- 하나의 HTML 파일 안에 UI, 상태 관리, 샘플 데이터가 모두 포함되어 있어 프로젝트 규모가 커질 경우 역할별 파일 분리가 필요합니다.

코드 가독성은 **★★★★☆**. 주석은 부족하지만 함수 분리, 이벤트 연결 방식, 코드 형식이 일관되고 현재 확인된 실행 오류도 없습니다.

#### HTML·CSS 구현 예시

Qwen의 디자인 A는 화면 구조와 동적 영역(`stats`, `groups`, `detail`)을 나누었습니다.

```html
<div class="app">
  <aside class="sidebar"><!-- 세부 내용 생략 --></aside>
  <main class="main">
    <div class="topbar"><!-- 세부 내용 생략 --></div>
    <section class="stats" id="stats"></section>
    <nav class="tabs"><!-- 세부 내용 생략 --></nav>
    <section id="tab-project">
      <div class="filters"><!-- 세부 내용 생략 --></div>
      <div class="content-row">
        <div class="gantt-card"><div id="groups"></div></div>
        <aside class="detail" id="detail"></aside>
      </div>
    </section>
    <section id="tab-handoff" hidden></section>
    <section id="tab-people" hidden></section>
  </main>
</div>
```

CSS는 변수와 의미를 알기 쉬운 클래스명을 사용하고, Flexbox와 Grid를 용도에 맞게 나누어 적용했습니다. 간트 영역과 상세 패널의 배치 관계도 코드에서 쉽게 확인할 수 있습니다.

```css
:root {
  --bg:#f2f4f9;
  --card:#ffffff;
  --line:#e5e9f2;
  --blue:#2f6fed;
  --radius:14px;
}
.app { display:flex; min-height:100vh; padding:16px; }
.sidebar { width:230px; flex:none; position:sticky; top:16px; }
.content-row { display:flex; gap:18px; align-items:flex-start; }
.gantt-card { flex:1; min-width:0; overflow-x:auto; }
```

`onclick`을 사용하지않고 ID와 `data-tab` 속성을 기준으로 js 이벤트를 연결했습니다.

#### JavaScript 동작 예시: 상태 변경과 기능 연결

`design_a_full_dashboard.html`에서는 필터 값이 변경되면 상태를 갱신하고 간트를 다시 렌더링합니다. 신규 사업 등록 기능 역시 실제 프로젝트 데이터 배열에 연결되어 있습니다.

```javascript
['fClient','fPm','fPerson'].forEach(id => {
  $(id).onchange = e => {
    state[id === 'fClient' ? 'client' : id === 'fPm' ? 'pm' : 'person'] = e.target.value;
    renderGantt();
  };
});

$('nSave').onclick = () => {
  const client = $('nClient').value.trim();
  const name = $('nName').value.trim();
  if (!client || !name) {
    alert('발주처와 사업명은 필수입니다.');
    return;
  }

  const p = {
    client,
    name,
    status: '진행중',
    start: $('nStart').value,
    end: $('nEnd').value,
    pm: $('nPm').value || '미지정',
    // members 세부 매핑 생략
    handoffs: []
  };
  PROJECTS.push(p);
  initFilters();
  renderStats();
  renderGantt();
  $('modal').close();
};
```

#### 한계

- 9분 44초, $0.33으로 MiniMax와 Luna보다 실행 시간이 길고 비용도 높습니다.
- 최초 생성 과정에서는 JavaScript 문법 검사만 수행해 실제 브라우저 렌더링 문제까지 확인하지는 않았습니다.
- 1280px 화면에서는 상세 패널과 간트를 한 화면에 함께 배치하면서 타임라인 일부가 가로 스크롤 영역 안쪽에 위치합니다. 전체 내용을 보려면 더 넓은 화면이나 가로 스크롤이 필요합니다.
- 원본 이미지와 일부 인명 및 수치가 다르기 때문에 실제 데이터 정확성은 별도의 확인이 필요합니다.

</details>

### MiMo V2.5 Pro

#### 실제 렌더링

`01_linear_style.html`

![MiMo V2.5 Pro 라이트 모드 화면 실제 렌더링](/assets/img/llm/screenshots/test-mimo25pro/01_linear_style.png)

`02_full_dashboard.html`

![MiMo V2.5 Pro 풀 대시보드 실제 렌더링 오류 상태](/assets/img/llm/screenshots/test-mimo25pro/02_full_dashboard.png)

`03_dark_theme.html`

![MiMo V2.5 Pro 다크 모드 화면 실제 렌더링 오류 상태](/assets/img/llm/screenshots/test-mimo25pro/03_dark_theme.png)

두 오류 화면은 날짜 필드 처리 중 예외가 발생해 간트 렌더링이 중단된 상태를 그대로 캡처했습니다.

<details markdown="1">
<summary>상세 분석 보기</summary>

#### 생성 과정

1. 파일 목록 확인 및 이미지 입력 시도
2. 이미지 직접 확인 불가 판단 후 파일명 기반으로 Linear·Full Dashboard·Dark 3개 디자인 방향 확정
3. 첫 번째 HTML 파일 일반 방식으로 작성
4. 두 번째 파일 작성 중 JSON 파싱 오류 발생 후 셸 here-document 방식으로 작성 방식 변경
5. 동일 방식으로 나머지 기능 화면 제작
6. 생성 파일 목록 및 파일 크기 확인
7. JavaScript 문법 검사·브라우저 렌더링·콘솔 오류 검사 미실시

#### 구현 범위

- 현재 날짜를 기준으로 한 주간, 2주, 월간 간트
- 프로젝트별 색상 막대와 툴팁
- 이름 및 프로젝트 검색, 팀·상태 필터
- 날짜 이동과 오늘 버튼
- 휴가 및 부재 표시
- 풀 대시보드의 KPI와 요약 패널

#### 평가

$0.04로 비교 대상 가운데 가장 저렴하며 세 가지 시안을 제공했으며, 첫 번째 라이트 모드 화면면은 현재 브라우저에서도 정상적으로 로드되어 일반적인 인력 스케줄러 형태로 사용할 수 있습니다.

풀 대시보드와 다크 모드 화면은 초기 렌더링 과정에서 오류가 발생해 정상적으로 사용할 수 없습니다.

#### 실제 동작 범위

라이트 모드 화면은 일부 기능(검색, 팀 필터, 기간 이동, 툴팁)을 사용할 수 있었으며, 새 배치 버튼 등 일부 기능은 동작하지 않았습니다.

풀 대시보드와 다크 모드 화면은 날짜 필드 오류로 초기 렌더링이 중단되며, 화면의 외곽 구조만 표시되고 간트 본문은 정상적으로 생성되지 않습니다.

#### 코드 품질

- 세 기능 화면에서 HTML 속성에 직접 작성한 인라인 이벤트 핸들러가 총 42개로 비교 대상 중 가장 많습니다.
- `onclick="setTeam(...)"`과 같은 방식을 사용하여 기능 변경이나 테스트가 상대적으로 어렵습니다.
- 최대 한 줄 길이는 1,647자로, 사람 및 배치 데이터와 HTML 문자열을 긴 한 줄에 작성한 부분이 많습니다.
- 세 디자인에서 날짜 처리, 필터링, 렌더링 코드가 중복 코드가 많습니다.
- 데이터에서는 날짜 필드명을 `s`, `e`로 사용하지만 렌더링 코드에서는 `start`, `end`를 참조하는 등의 오류가 잇습니다.
- 일부 주석은 존재하지만 중복된 코드 구조나 데이터 필드 관계를 이해하는 데 충분하지 않습니다.

코드 가독성은 **★★☆☆☆**. 인라인 이벤트 사용, 긴 코드 줄, 중복 구현, 데이터 필드 불일치가 동시에 존재해 이후 수정과 유지보수에 부담이 큽니다.

#### HTML·CSS 구현 예시

MiMo의 라이트 모드 화면은 별도의 사이드바 없이 최대 1,440px 너비의 단일 콘텐츠 영역을 사용합니다. 헤더, 통계, 필터, 간트가 위에서 아래로 이어지는 단순한 구조로 되어 있지만 원본의 풀 대시보드 구조와는 차이가 있습니다.

```html
<div class="app">
  <div class="header"><!-- 세부 내용 생략 --></div>
  <div class="stats"><!-- 세부 내용 생략 --></div>
  <div class="toolbar">
    <input id="searchInput" oninput="filterRows()">
    <div class="chip active" onclick="toggleChip(this,'all')">전체</div>
    <div class="chip" onclick="toggleChip(this,'dev')">개발</div>
  </div>
  <div class="timeline-header"><!-- 세부 내용 생략 --></div>
  <div class="gantt-container"><!-- 세부 내용 생략 --></div>
</div>
```

CSS는 변수와 섹션 주석을 사용하지만 여러 속성을 한 줄에 작성했습니다.

```css
:root{
  --bg:#f8f9fc;--card:#fff;--border:#e8ecf1;
  --text:#1a1d26;--text2:#6b7280;--accent:#4f6ef7;
  --bar-h:36px;--row-h:52px;--radius:10px;
}
.app{max-width:1440px;margin:0 auto;padding:32px 40px}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:28px}
.gantt-table{border-collapse:collapse;width:100%;min-width:1100px}
```

검색과 필터 이벤트를 HTML 속성에 직접 작성하고 있으며, 세 디자인을 각각 별도 파일로 복제하면서 동일한 코드와 동일한 오류또한 복제되었습니다.

#### JavaScript 동작 예시: 데이터 필드명 불일치

`02_full_dashboard.html`의 배치 데이터에서는 날짜를 `s`, `e` 필드에 저장합니다.

```javascript
const ASG = [
  { pid: 1, pr: 'a', s: dO(-5), e: dO(12) },
  { pid: 1, pr: 'd', s: dO(14), e: dO(25) }
];
```

하지만 실제 렌더링 코드에서는 `start`, `end`라는 다른 필드명을 사용합니다.

```javascript
ASG
  .filter(a => a.pid === person.id && same(a.start, day))
  .forEach(a => {
    const span = Math.round((a.end - a.start) / 864e5) + 1;
  });
```

이 때문에 `same()` 함수에 `undefined`가 전달되면서 초기 렌더링이 중단됩니다. 동일한 코드를 여러 디자인에 복사하는 과정에서 이 오류 역시 함께 반복되었습니다.

#### 한계

- 배치 데이터에서는 날짜를 `s`, `e`로 저장하지만 렌더링 코드에서는 `start`, `end`를 참조합니다.
- 이 필드명 불일치로 `same(a.start, day)` 실행 시 `undefined.getFullYear()` 오류가 발생하며, 02와 03 화면의 간트 본문이 표시되지 않습니다.
- 세 기능 화면 중 두 화면이 정상 실행되지 않아 현재 상태 그대로 사용하기 어렵습니다.
- 원본의 사업별 그룹, 인력 교체 이벤트, 우측 상세 패널보다 일반적인 직원 일정 관리 화면에 가깝습니다.
- 이미지 내용을 확인하지 못한 상태에서 실제 렌더링 검증도 하지 않아 낮은 비용이 결과 품질 저하로 이어졌습니다.

</details>

### GPT-5.6 Luna Xhigh

#### 실제 렌더링

`index.html`

![GPT-5.6 Luna Xhigh 비교 런처 실제 렌더링](/assets/img/llm/screenshots/test-luna-xhigh/index.png)

`01-command-center.html`

![GPT-5.6 Luna Xhigh Command Center 실제 렌더링](/assets/img/llm/screenshots/test-luna-xhigh/01-command-center.png)

`02-resource-ops.html`

![GPT-5.6 Luna Xhigh Resource Ops 실제 렌더링](/assets/img/llm/screenshots/test-luna-xhigh/02-resource-ops.png)

`03-capacity-planner.html`

![GPT-5.6 Luna Xhigh Capacity Planner 실제 렌더링](/assets/img/llm/screenshots/test-luna-xhigh/03-capacity-planner.png)

<details markdown="1">
<summary>상세 분석 보기</summary>

#### 생성 과정

1. 두 참고 이미지 및 프로젝트 구조 확인
2. 원본 재현형·다크 관제형·용량 계획형의 3개 업무 시나리오 확정
3. 비교용 인덱스 페이지 우선 제작 후 세 기능 화면 순차 구현
4. 인라인 JavaScript 파싱, 필수 DOM ID, 주요 인터랙션 요소 및 git diff --check 검사
5. 클래스명 불일치 및 상세 패널 연결 문제 확인 후 수정
6. 로컬 HTTP 서버를 통한 네 파일 응답 여부 및 필수 컨트롤 재검사

#### 구현 범위

- 인력 배치 간트 및 사업별 타임라인
- 검색, 팀·PM·발주처 필터
- 배치 상세 패널과 등록·수정 모달
- 기간 이동과 줌
- CSV 내보내기 및 인쇄
- 드래그를 이용한 배치 이동
- KPI, 팀 가동률, 위험 요소, 가용 슬롯 분석
- 모바일 화면을 고려한 반응형 레이아웃

#### 평가

세 기능 화면 모두 현재 브라우저에서 콘솔 오류 없이 정상적으로 로드됐으며, 라이트 모드 화면의 배치 등록 모달도 정상적으로 작동했습니다.

원본 구조를 따르는 화면, 운영 관제에 초점을 둔 화면, 인력 용량 계획에 초점을 둔 화면을 각각 제시해 실제 회사에서 활용할 수 있는 업무 시나리오를 가장 잘 구현했습니다.

8분 13초, $0.11로 MiniMax보다 다소 느리지만 Kimi보다는 빠르고 비용도 낮습니다. 구현된 기능 수와 결과물 수를 고려하면 효율은 높은 편입니다. 다만 코드가 지나치게 압축되어 있어 이후 직접 수정하거나 기능을 확장하는 용도로는 Qwen보다 아쉽습니다.

#### 실제 동작 범위

세 화면 모두 주요 기능이 실제 데이터와 연결되어 있습니다. 검색과 필터, 상세 패널, 등록·수정 모달, CSV 내보내기를 직접 사용할 수 있습니다.

다크 모드 화면에는 기간 이동과 줌 기능이 추가되어 있으며, 용량 계획 화면에서는 간트 막대를 드래그해 배치를 이동하거나 화면을 인쇄하는 기능까지 지원합니다.

#### 코드 품질

- 상태 관리, 필터링, 화면 렌더링, 상세 정보 표시, 모달 기능 등이 각각 함수로 구분되어 있으며 HTML 인라인 이벤트 핸들러도 사용하지 않았습니다.
- 반면 파일이 지나치게 압축되어 `02-resource-ops.html` 파일은 56줄, `03-capacity-planner.html` 파일은 39줄 안에 전체 HTML, CSS, JavaScript가 포함되어 있습니다.
- 평균 한 줄 길이는 `02-resource-ops.html`가 약 440자, `03-capacity-planner.html`이 약 785자이며 최대 한 줄 길이는 8,324자에 달합니다.
- 500자를 넘는 줄이 세 기능 화면에 총 44개 있으며 코드 설명을 위한 주석도 없습니다.
- 일부 파일은 `<style>`과 `<script>` 블록이 여러 차례 추가되어 최종 코드 구조가 충분히 정리되지 않은 흔적이 있습니다.
- 세 기능 화면의 `style=""` 속성은 총 45개이며 동적 위치 계산뿐 아니라 일부 고정 스타일에도 사용되고 있습니다.

코드 가독성은 **★★☆☆☆**. 실제 기능은 풍부하지만 긴 코드 줄과 주석이 없습니다.

#### HTML·CSS 구현 예시

Luna의 라이트 모드 화면은 사이드바, 상단 영역, 탭, 필터, 간트, 상세 패널을 모두 갖춘 구조입니다. HTML 요소의 역할은 비교적 명확하지만 일부 구간은 여러 단계의 태그가 한 줄에 이어져 있어 전체 계층을 빠르게 파악하기 어렵습니다.

```html
<div class="app">
  <aside class="sidebar"><!-- 세부 내용 생략 --></aside>
  <main class="main">
    <header class="topbar"><!-- 세부 내용 생략 --></header>
    <section class="stats" id="stats"></section>
    <nav class="tabs"><!-- 세부 내용 생략 --></nav>
    <section id="projectTab">
      <div class="filters"><!-- 세부 내용 생략 --></div>
      <div class="content">
        <div class="gantt-card"><!-- 세부 내용 생략 --></div>
        <aside class="detail" id="detail"></aside>
      </div>
    </section>
  </main>
</div>
```

라이트 모드 화면의 CSS는 아래처럼 영역별 역할을 구분할 수 있지만, 다크 모드 화면과 용량 계획 화면에서는 같은 수준의 스타일 선언이 매우 긴 한 줄로 압축되어 있습니다.

```css
:root { --bg:#f5f7fb; --paper:#fff; --ink:#192235;
  --muted:#768196; --line:#e5eaf2; --blue:#356ff4; }
.app { display:flex; min-height:100vh; padding:16px; gap:24px; }
.sidebar { position:sticky; width:210px; height:calc(100vh - 32px); }
.stats { display:grid; grid-template-columns:repeat(4,minmax(150px,1fr)); gap:12px; }
.content { display:grid; grid-template-columns:minmax(0,1fr) 285px; gap:16px; }
```

HTML 속성에 직접 이벤트를 작성하지 않고 ID와 `data-tab`을 이용해 하였지만, 코드가 지나치게 압축되어 있어 구조적으로 잘 나눈 장점이 없습니다.

#### JavaScript 동작 예시: 지나치게 압축된 코드

`03-capacity-planner.html`의 8번째 줄은 8,324자로 작성되어 있습니다. 아래는 해당 줄의 일부입니다.

```css
:root{--bg:#f0ede6;--paper:#fffdf9;--ink:#252d3a;--muted:#8a8e8c;--line:#dedbd3;--blue:#477dce;--blue-soft:#e8f0ff;--coral:#e57c59;--yellow:#d2a83d;--sage:#62a27e;--shadow:0 12px 28px #4b453b0d}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:Inter,-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Noto Sans KR",sans-serif;font-size:13px}button,input,select{font:inherit}button{cursor:pointer}.app{display:flex;min-height:100vh;padding:18px;gap:18px}/* 이하 생략 */
```

브라우저 실행에는 문제가 없지만 특정 선택자나 스타일만 수정하기 어렵고, 변경 사항을 코드 리뷰에서 비교하기도 쉽지 않습니다. 기능 점수와 코드 가독성 점수의 차이가 크게 나타난 이유입니다.

#### 한계

- 총 88.0K 토큰을 사용해 비교 대상 가운데 토큰 사용량이 가장 많았습니다.
- 생성 과정에서는 실제 브라우저 픽셀 단위의 화면 비교를 수행하지 못했고, JavaScript 문법, DOM 구성, HTTP 응답 여부를 중심으로 검증했습니다.
- 라이트 모드 화면에서 선택된 인력이 교체 이후 투입된 인력인 경우 상세 카드에서 이전 인력과 현재 인력이 동일한 이름으로 표시되는 문제가 있습니다. 현재 `h.to`를 양쪽에 사용하고 있어 이전 인력은 `h.from`을 사용하도록 수정해야 합니다.
- 일부 화면은 실제 업무 시스템 구현보다는 다양한 디자인 방향과 활용 시나리오를 제시하는 데 더 초점이 맞춰져 있습니다.

</details>

---


### 종합 비교

#### 결과물과 코드 비교

| 모델                | 정상 실행 | 코드 가독성 | 결과 성격           | 주의할 점                           |
| ------------------- | :-------: | :---------: | ------------------- | ----------------------------------- |
| Kimi K3 Max         |     ○     |    ★★★★☆    | 실제 동작형         | 외부 폰트 CDN 사용                  |
| GLM-5.3 Max         |     △     |    ★★★☆☆    | 부분 성공 동작형    | 변수 오류로 다크 화면 실행 실패     |
| MiniMax-M3 Thinking |     ○     |    ★★★☆☆    | 인터랙티브 목업     | 등록·내보내기는 토스트만 표시       |
| Qwen 3.8 Max        |     ○     |    ★★★★☆    | 실제 동작형         | 간트 뒷부분 확인에 가로 스크롤 필요 |
| MiMo V2.5 Pro       |     △     |    ★★☆☆☆    | 부분 동작·실패 혼합 | 날짜 필드 오류로 두 화면 실행 실패  |
| GPT-5.6 Luna Xhigh  |     ○     |    ★★☆☆☆    | 실제 동작형         | 긴 단일 행으로 코드 수정이 어려움   |

#### 입력과 검증 비교

| 모델                | 이미지 입력 | 원본과의 유사도 | 기능 구현 정도 | 모델이 확인한 항목             | 브라우저 테스트 결과 |
| ------------------- | ----------- | --------------- | -------------- | ------------------------------ | -------------------- |
| Kimi K3 Max         | 지원        | 매우 높음       | 높음           | 문법 검사, 실제 화면 확인·수정 | 정상                 |
| GLM-5.3 Max         | 미지원      | 낮음            | 높음           | 문법 검사                      | 일부 오류            |
| MiniMax-M3 Thinking | 지원        | 높음            | 낮음~중간      | 문법 검사, 브라우저 실행       | 정상                 |
| Qwen 3.8 Max        | 지원        | 높음            | 높음           | 문법 검사                      | 정상                 |
| MiMo V2.5 Pro       | 미지원      | 낮음            | 설계상 중간    | 파일 생성 여부                 | 2개 화면 오류        |
| GPT-5.6 Luna Xhigh  | 지원        | 높음            | 매우 높음      | 문법, DOM, HTTP 응답 확인      | 정상                 |

#### 추천하는 모델은?

- **Qwen 3.8 Max**: 실제 기능을 구현하고 후속 개발까지 이어 갈 업무 프로토타입에 적합합니다.
- **Kimi K3 Max**: 비용보다 원본과 비슷한 화면을 만드는 일이 중요한 목업에 적합합니다.
- **MiniMax-M3 Thinking**: 빠르고 저렴하게 여러 시안을 확인하는 작업에 적합합니다.

## 정리

중국 AI 모델을 한번 써보면서 실제로 "저렴한 토큰 비용"을 실감했습니다.

물론 실제 프로덕션 환경에서의 개발은 아니지만 목업용 화면을 뽑아내기에는 충분히 저렴하게 뽑을 수 있다는 생각이 들었습니다.

이번 결과에서 추천할 만한 모델은 Qwen 3.8 Max, Kimi K3 Max, MiniMax-M3 Thinking 세 가지로 꼽을  수  있습니다.

- **비용, 시간 코드가 가장 균형 잡힌건 Qwen 3.8 Max**
- **실행 시간과 비용은 제일 크만 원본을 가장 잘 재현한 재현 중심의 목업은 Kimi K3 Max**
- **저렴하면서 빨랐던 MiniMax-M3 Thinking**
