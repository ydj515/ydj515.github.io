---
title: "master에서 main 브랜치로 옮겨가기"
description: (feat. gitlab)
author: ydj515
date: 2025-12-05 10:00:00 +0800
categories: [git, gitlab]
tags: [git, gitlab]
pin: true
math: true
mermaid: true
image:
  path: /assets/img/gitlab/logo.png
  lqip: data:image/webp;base64,UklGRpoAAABXRUJQVlA4WAoAAAAQAAAADwAABwAAQUxQSDIAAAARL0AmbZurmr57yyIiqE8oiG0bejIYEQTgqiDA9vqnsUSI6H+oAERp2HZ65qP/VIAWAFZQOCBCAAAA8AEAnQEqEAAIAAVAfCWkAALp8sF8rgRgAP7o9FDvMCkMde9PK7euH5M1m6VWoDXf2FkP3BqV0ZYbO6NA/VFIAAAA
  alt: gitlab
---


## master에서 main으로의 이동

최근 GitHub를 시작으로 많은 플랫폼이 기본 브랜치 이름을 'master'에서 'main'으로 변경하고 있습니다. 이 흐름에 맞춰, 저도 사내 GitLab 저장소들의 기본 브랜치를 'master'에서 'main'으로 변경하기로 했습니다.

물론, 브랜치 이름을 바꾸는 것 자체는 몇 줄의 명령어로 끝나는 단순한 일입니다. 하지만 동시에, 이는 수많은 함정을 가진 엄청나게 위험한 일이기도 합니다.

> 왜 위험하죠?

git push 한 번으로 수십 개의 CI/CD 파이프라인이 연쇄적으로 실패할 수 있습니다.

모든 팀원의 로컬 환경이 원격 저장소와 연결이 끊어지는 혼란을 겪게 됩니다.

'master'에만 적용되던 브랜치 보호(Protected Branch) 설정이 사라져, 누군가 실수로 main에 강제 푸시(force push)를 할 수도 있습니다.

무엇보다... 관리하는 저장소가 한두 개가 아닌 수십, 수백 개이기에 때문에 위험도가 높은 작업입니다.

단순한 클릭과 git 명령어로 해결할 수 없는 이 '대규모 변경' 작업을 위해, 저는 GitLab API를 이용한 자동화를 시도했습니다.


## 단일 레포지토리에서 master -> main

단일 저장소라면 아래와 같이 몇 가지 명령어로 간단히 처리할 수 있습니다.

```sh
# 1. 로컬에서 이름 변경
git branch -m master main

# 2. 원격에 main 브랜치 push (업스트림 설정)
git push -u origin main

# 3. GitLab 웹사이트에서 'Default Branch'를 main으로 변경

# 4. 원격 master 브랜치 삭제
git push origin --delete master
```

## 다수의 레포지토리에서 master -> main

위처럼 단일 레포지토리 작업을 수십 개의 저장소에 대해 반복하는 것은 비효율적이고 실수를 유발하기 쉽습니다. 특히 3번 '기본 브랜치 변경'은 웹 UI를 클릭해야 하므로 자동화가 절실했습니다.

### GitLab API 사용하기로 결정

> 전체 sehll script는 [github-sample](https://github.com/ydj515/sample-repository-example/blob/main/git-master-to-main/update_branches.sh)를 참조해주세요.

수십개의 repository에 대해서 동일한 작업을 하기위해 gitlab api를 사용하려고 찾아보았으며, curl과 jq를 이용한 간단한 셸 스크립트로 이 과정을 자동화하기로 했습니다.

먼저 Gitlab 와 프로젝트 ID를 통해 쉽게 작업을 할 수 있을 것으로 보여졌습니다. 사용하려면 아래 두단계를 선행할 필요가 있습니다.

> 1. Gitlab api를 사용하려면 우선 access token을 발급받아야합니다. 더 많은 api는 [여기](https://docs.gitlab.com/api/protected_branches/)를 참고해주세요.

![alt text](/assets/img/gitlab/access-token.png)

> 2. 전체 Project id를 조회하기위해 Group id 가져오려면 아래 사진에서 처럼 ...을 누르면 볼 수 있습니다. (project들은 하나의 group에 속합니다.)

![alt text](/assets/img/gitlab/group-id.png)

그 다음  쉘 스크립트에 대한 내용을 정리한 후 작성했습니다.

1. 특정 그룹(Group)에 속한 모든 프로젝트 ID 목록을 가져온다.
2. 각 프로젝트 ID를 순회하며 다음 API를 호출한다.  
   1) master 브랜치를 기반으로 main 브랜치를 생성한다. (/repository/branches)  
   2) 프로젝트의 기본 브랜치를 main으로 변경한다. (/projects/:id)  
   3) master 브랜치를 삭제한다. (/repository/branches/:branch_name)

핵심 로직은 다음과 같았습니다.

```sh
# ... (프로젝트 ID 목록 가져오기) ...

for PROJECT_ID in $PROJECT_IDS
do
  # 1) main 브랜치 생성
  curl --request POST --header "PRIVATE-TOKEN: $TOKEN" \
       "$GITLAB_URL/api/v4/projects/$PROJECT_ID/repository/branches?branch=main&ref=master"

  # 2) 기본 브랜치를 main으로 변경 (가장 중요)
  curl --request PUT --header "PRIVATE-TOKEN: $TOKEN" \
       --data "default_branch=main" \
       "$GITLAB_URL/api/v4/projects/$PROJECT_ID"
  
  # 3) master 브랜치 삭제
  curl --request DELETE --header "PRIVATE-TOKEN: $TOKEN" \
       "$GITLAB_URL/api/v4/projects/$PROJECT_ID/repository/branches/master"
done
```

### 예상치 못한 오류: "403 Forbidden" 혹은 "jq error"

당연히 잘 동작할 것이라 생각했던 스크립트는 메인브랜치 변경에서 막혔습니다. `401 Unauthorized`의 메시지를 보내고 있었습니다.

토큰의 권한은 문제가 없었지만 확인해보니 제 계정은 해당 프로젝트들에서 Developer 권한을 가지고 있었고, 브랜치를 생성하고 삭제할 권한도 있었습니다. '기본 브랜치 변경'에서 실패했습니다.

### 401 Unauthorized 이유

문제의 핵심은 GitLab의 권한 모델에 있었습니다.

- Developer의 권한 범위
  - 코드 push, pull
  - 브랜치 생성 및 삭제 (보호되지 않은 브랜치 대상)
  - 머지 리퀘스트(MR) 생성, 병합
  - 이슈 관리
  - 
- Maintainer의 권한 범위
  - Developer의 모든 권한
  - 프로젝트 설정 변경 (O)
  - 기본 브랜치(Default Branch) 변경 (O)
  - 보호 브랜치(Protected Branch) 설정 및 해제 (O)
  - 멤버 관리 및 CI/CD 변수 설정

GitLab의 관점에서 **'기본 브랜치'는 프로젝트의 핵심 설정(Setting)**입니다. 기본 브랜치가 변경되면 MR의 기본 대상이 바뀌고, CI/CD 파이프라인의 트리거(e.g., only: [master])에 영향을 주며, 저장소의 근간이 되는 브랜치가 바뀌는 중대한 변경입니다.

따라서 이 작업은 코드 기여자인 Developer의 권한을 넘어서며, 프로젝트 관리자인 Maintainer 이상의 권한을 요구합니다. 스크립트가 실패한 이유는 제 API 토큰에 Maintainer 권한이 없었기 때문입니다.

표로 정리하자만 다음과 같습니다.

| 작업               | API (스크립트 단계)                           | 최소 필요 권한 |
| :----------------- | :-------------------------------------------- | :------------- |
| 프로젝트 목록 조회 | `GET /groups/.../projects` (1단계)            | **Reporter**   |
| 브랜치 생성/삭제   | `POST/DELETE /repository/branches` (2, 3단계) | **Developer**  |
| 기본 브랜치 변경   | `PUT /projects/:id` (2단계)                   | **Maintainer** |

### 해결책

가장 간단한 해결책은 해당 그룹/프로젝트의 Owner에게 요청하여 제 계정 권한을 Maintainer로 상향 조정하는 것입니다. 또는, Maintainer 권한을 가진 동료에게 스크립트 실행을 요청하거나 그 권한으로 생성된 API 토큰을 받아 사용하는 것입니다.

권한 문제를 해결하자 스크립트의 `PUT /projects/:id` (기본 브랜치 변경) API가 정상적으로 동작했습니다.

### 후속 조치

브랜치 이름 변경은 끝이 아닙니다. 자동화 스크립트가 성공적으로 실행된 후에도 다음과 같은 후속 조치가 필요합니다.

1. 보호 브랜치 설정: 기존 master에 적용되던 보호 브랜치(Protected Branch) 규칙을 main에도 동일하게 적용해야 합니다. api로 자동화하였습니다.

2. CI/CD 파이프라인 수정: .gitlab-ci.yml 파일 내부에 master를 명시적으로 타겟팅하는 규칙(e.g., only: [master], rules:)이 있다면 모두 main으로 변경해야 합니다.

3. 팀원 전파: 모든 팀원에게 이 변경사항을 알리고, 로컬 저장소를 업데이트하는 가이드를 공유해야 합니다. slack api를 활용하였습니다.

> 완성된 shell script는 [github-sample](https://github.com/ydj515/sample-repository-example/tree/main/git-master-to-main)를 참조해주세요.
{:.prompt-info}

## 결론

이번 경험을 통해, 미루고 미뤘던 master -> main으로 브랜치 이름을 변경해보았습니다. 매우 위험하지만 재미있는 경험이였습니다.

먼저 gitlab의 권한 체계를 다시 한번 생각해보게되었으며, branch명이 바뀌게 되면 미칠 영향도 계산, 기존 파이프라인 수정, 작업 내용에 대한 공유등을 어떻게 할지에 대해 많은 고민을 해볼 수 있었던 경험이였습니다.

현재는 일회성이라고 판단하여 간단하게 shell script로 작성해보았지만 추후에는 예외 처리, 페이징 처리, 복잡한 로직 관리가 훨씬 용이한 python-gitlab과 같은 공식 SDK를 사용해볼 수도 있을 것 같습니다.