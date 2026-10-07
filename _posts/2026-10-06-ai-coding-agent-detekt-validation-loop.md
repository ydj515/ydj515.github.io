---
title: "AI 코딩 에이전트를 위한 Kotlin 검증 하네스: ktlint, Detekt, Kover, ArchUnit"
date: 2026-10-06 00:00:00 +0900
description: "ktlint, Detekt, Kover를 활용한 AI 검증 루프"
author: ydj515
categories: [ai, kotlin]
tags: [ai-coding-agent, agent-harness, kotlin, spring-boot, ktlint, detekt, kover, ArchUnit, code-coverage, gradle, java, troubleshooting]
mermaid: true
image:
  path: /assets/img/ai-validation/logo.png
  alt: "AI 코드 검증 루프"
---

AI에게 코드 수정을 맡기면서 신경 쓰였던 점은 코드 스타일이 일정하지 않다는 것이었습니다. 프로젝트마다 생성된 코드의 스타일이 달라 읽고 검토하기가 불편했습니다. 예를 들어 `LocalDate`를 import해서 쓸 수 있는데도 본문에 `java.time.LocalDate.now()`처럼 클래스의 전체 이름(FQCN)을 반복해서 쓰거나, import 순서가 제각각인 경우가 있었습니다.

코드 작성 기준을 문서로 정리하고 스킬과 에이전트 지침에 반영해 하네스를 구성했지만, 모든 프로젝트에서 만족스러운 결과가 나오지는 않았습니다. 지침을 보완해도 코드가 기준을 지켰는지는 매번 눈으로 확인해야 했습니다.

그래서 도구로 확인할 수 있는 규칙을 검사하고, 결과에 따라 코드를 수정하도록 하네스를 변경하였습니다. Kotlin + Spring Boot 프로젝트에서는 `ktlint`로 코드 형식을, `Detekt`로 잠재적인 문제와 복잡도를 검사하고, 단위·통합 테스트로 동작을 확인하고, `Kover`는 테스트가 실행한 코드 범위를 확인하고, `ArchUnit`로 계층간 의존성을 검사합니다. 

하네스에는 검사 순서와 실패했을 때의 수정·재검사 절차를 정해 두었습니다. AI가 검사 결과를 보고 코드를 고친 뒤 같은 검사를 다시 실행하도록 했습니다. 검증 도구들를 Gradle에 연결하고 검증 통과를 작업 완료 조건으로 삼는 방법을 정리합니다.

## ktlint란?

ktlint는 Kotlin 코드의 스타일 규칙을 검사하고, 자동으로 고칠 수 있는 형식 문제를 수정하는 린터이자 포매터입니다. 들여쓰기, 줄바꿈, import 순서처럼 코드 형식을 맞추는 데 사용합니다.

예를 들어 import 순서가 뒤섞이거나 사용하지 않는 import가 남아 있으면 `import-ordering`, `no-unused-imports` 규칙으로 검사할 수 있습니다. 자동 수정이 가능한 항목은 포매터로 정리합니다. 코드 본문의 FQCN을 import와 짧은 클래스 이름으로 바꾸는 문제는 이 규칙들과 구분해야 합니다.

기본 규칙을 제공하며 `.editorconfig`로 프로젝트의 코드 스타일을 설정할 수 있습니다. **형식 검사를 ktlint에 맡기고, 코드 구조와 잠재적 문제는 Detekt로 확인합니다.**

## Detekt란?

Detekt는 Kotlin 코드를 실행하지 않고 분석하는 정적 분석 도구입니다. 복잡한 함수, 지나치게 긴 클래스, 잘못된 예외 처리, 위험할 수 있는 코드 패턴, 이름 규칙 위반 등을 찾습니다.

테스트가 "기능이 기대한 대로 동작하는가"를 확인한다면, Detekt는 "코드가 저장소에서 정한 품질 기준을 지키는가"를 확인합니다. 예를 들어 다음 항목을 검사할 수 있습니다.

- 함수의 복잡도가 설정한 값을 넘는지 확인합니다.
- 빈 `catch` 블록이나 지나치게 넓은 예외 처리를 찾습니다.
- 사용하지 않거나 도달할 수 없는 코드를 찾습니다.
- 코루틴을 잘못 사용하는 패턴을 찾습니다.
- 이름, 주석, 코드 스타일 규칙을 검사합니다.

Gradle 플러그인을 적용하면 아래 명령으로 검사를 실행할 수 있습니다.

```bash
./gradlew detekt
```

규칙과 임계값은 주로 `detekt.yml`, 빌드 스크립트에 설정할 수 있습니다. 두 설정 파일을 저장소에서 버전 관리하면 검사 기준의 변경 이력도 확인할 수 있습니다.

Detekt가 비즈니스 요구사항, 트랜잭션 동작을 테스트 하진 않습니다.

### 불필요한 FQCN 사용 검사

도입에서 언급한 FQCN은 다음처럼 패키지명까지 코드 본문에 쓰는 방식입니다.

```kotlin
// 변경 전: 코드 본문에 클래스의 전체 이름을 사용합니다.
fun today(): java.time.LocalDate = java.time.LocalDate.now()
```

이름 충돌이 없다면 import를 추가해 짧게 쓸 수 있습니다.

```kotlin
import java.time.LocalDate

// 변경 후: import한 클래스 이름을 사용합니다.
fun today(): LocalDate = LocalDate.now()
```

Detekt의 [UnnecessaryFullyQualifiedName](https://detekt.dev/docs/next/rules/style/#unnecessaryfullyqualifiedname) 규칙은 이런 불필요한 전체 이름 사용을 찾습니다. 타입 해석이 필요하고 기본으로 활성화되지 않으므로, 지원하는 버전에서 규칙을 켜고 타입 해석 태스크로 검사해야 합니다. 같은 이름의 클래스가 충돌하는 경우에는 FQCN이나 import 별칭이 필요할 수 있습니다.

본문은 **Kotlin 2.4.10과 Detekt 2.0.0-alpha.6**을 기준으로 합니다. 아래 `detekt.yml`에서 FQCN 규칙을 활성화하고, 최종 검증에 `detektMain`과 `detektTest`를 연결합니다. 이전 Kotlin·Detekt 조합은 뒤의 별도 절에서 다룹니다.

## Kover란?

Kover는 JVM에서 실행한 테스트의 코드 커버리지를 측정합니다. 라인, 명령어, 분기 커버리지를 계산할 수 있으며 `koverVerify` 태스크로 설정한 기준을 검사할 수 있습니다.

보고서에서 테스트가 실행하지 않은 코드와 분기를 확인할 수 있습니다. 다만 커버리지는 코드가 실행됐는지를 나타낼 뿐이고, 테스트의 결과를 나타내는건 아닙니다.

### ArchUnit란?

계층 간 의존성을 검사하려면 ArchUnit을 추가할 수 있습니다. 기능이 동작하더라도 클래스 위치나 계층 간 의존성이 프로젝트의 설계 규칙과 맞지 않을 수 있습니다. 이런 문제는 ktlint와 Detekt만으로 막기 어렵습니다.

예를 들어 다음 규칙을 테스트로 만들 수 있습니다.

- domain은 Spring에 의존하지 않습니다.
- Controller는 Repository를 직접 사용하지 않습니다.
- presentation은 application을 통해서만 domain 기능을 사용합니다.
- 패키지 사이에 순환 의존성이 없어야 합니다.

에이전트 지침에는 설계 의도를 적고, ArchUnit 테스트로 의존성 규칙을 어긴 코드를 찾습니다.

## 검사 항목마다 도구를 다르게

각 도구가 검사할 항목은 다음과 같이 나눴습니다.

| 도구             | 맡은 역할                                 | 대표적인 실패                                                    |
| ---------------- | ----------------------------------------- | ---------------------------------------------------------------- |
| ktlint           | 코드 형식과 import 규칙                   | 들여쓰기, 줄바꿈, import 순서                                    |
| Detekt           | 잠재적 버그, 예외 처리, 복잡도, 코드 냄새 | 불필요한 FQCN, 빈 `catch`, 복잡한 함수                           |
| 단위·통합 테스트 | 요구한 동작과 실패 시나리오               | 잘못된 계산, 트랜잭션·연동 오류                                  |
| Kover            | 테스트가 실행한 코드 범위                 | 새 분기나 핵심 로직이 테스트되지 않음                            |
| ArchUnit         | 패키지와 계층 의존성 검사                 | Controller의 Repository 직접 참조, domain의 외부 프레임워크 의존 |

Detekt 2.x의 `ktlint` 규칙 모음(`detekt-rules-ktlint-wrapper`)을 추가하면 ktlint의 형식 규칙을 Detekt에서도 검사할 수 있습니다.

ktlint를 별도로 실행한다면 같은 형식 규칙을 Detekt에서도 다시 켜지 않거나, 두 도구의 버전과 설정을 일치시켜야 합니다. 이번 구성에서는 형식은 ktlint, 코드 품질은 Detekt로 설정하였습니다.

## 어디까지 설정?

처음부터 모든 규칙을 켜면 기존 코드에서 많은 경고가 나올 수 있습니다. 이를 한꺼번에 없애려다 보면 AI가 동작 오류보다 형식 문제를 고치는 데 시간을 더 쏟을 수 있으며, 팀 컨벤션과도 맞지 않을 수 있습니다.

저는 아래의 순서대로 설정을 하였습니다.

1. **컴파일 오류와 테스트 실패**.
2. **잠재적 버그와 예외 처리 규칙**. Detekt의 `potential-bugs`, `exceptions` 설정.
3. **아키텍처 경계**를 검사. Controller가 Repository를 직접 호출하거나 domain이 Spring에 의존하지 못하도록 설정.
4. **함수 복잡도와 크기**를 관리. 긴 함수와 복잡한 조건문은 당장 동작하더라도 이후 수정이 어려움.
5. **형식과 이름 규칙 통일**. 자동으로 고칠 수 있는 네이밍은 AI에게 위임.
6. **최소 테스트 커버리지**. Kover에 최소 라인 + 브랜치 커버리지 설정

## Kover로 테스트가 빠진 경로를 확인한다

`koverHtmlReport`로 커버리지 보고서를 만들고, `koverVerify`로 설정한 최소 기준을 충족하는지 검사합니다.

```bash
./gradlew koverHtmlReport
./gradlew koverVerify
```

Kover 보고서 태스크나 검증 태스크를 실행하면 관련 테스트도 함께 실행됩니다. 따라서 import 하나를 고칠 때마다 Kover를 돌리기보다 최종 검증 단계에 두는 편이 효율적입니다.

커버리지 수치만으로는 테스트가 동작을 충분히 검증하는지 알 수 없습니다. 검증문(assertion)이 없는 테스트도 코드를 실행할 수 있고, 중요한 실패 시나리오를 빼놓은 채 정상 경로만 실행해도 라인 커버리지는 높게 나올 수 있습니다.

Kover를 검증 절차에 넣을 때는 다음 기준을 적용합니다.

- 전체 커버리지 목표를 갑자기 높이기보다 현재 기준이 내려가지 않게 막습니다.
- 상태 전이가 많은 domain과 application 계층은 분기 커버리지도 함께 봅니다.
- 생성 코드와 단순 설정 클래스는 이유가 분명할 때만 보고서에서 제외합니다.
- 커버리지를 맞추기 위해 검증문 없이 코드만 호출하는 테스트는 인정하지 않습니다.
- 임계값과 제외 목록을 바꿔 통과시키지 못하도록 설정 파일을 보호합니다.

Kover 보고서에서는 테스트가 실행하지 않은 코드 경로를 확인합니다. 커버리지가 떨어졌다면 어떤 동작의 테스트가 빠졌는지 살펴본 뒤 필요한 테스트를 추가합니다.

## libs.versions.toml & build.gradle.kts

> 본문 예시는 Kotlin 2.4.10과 Detekt 2.0.0-alpha.6 조합이며, Gradle은 공식 호환성 표의 9.6.1을 기준으로 합니다. 이보다 낮은 Kotlin이나 Detekt 1.x를 사용한다면 [이전 버전의 Kotlin·Detekt 조합을 사용하는 경우](#이전-버전의-kotlindetekt-조합을-사용하는-경우)를 참고합니다.

- libs.versions.toml

```toml
[versions]
kotlin = "2.4.10"
detekt = "2.0.0-alpha.6"
ktlint-plugin = "14.2.0"
ktlint = "1.8.0"
kover = "0.9.9"

[plugins]
kotlin-jvm = { id = "org.jetbrains.kotlin.jvm", version.ref = "kotlin" }
kotlin-spring = { id = "org.jetbrains.kotlin.plugin.spring", version.ref = "kotlin" }
detekt = { id = "dev.detekt", version.ref = "detekt" }
ktlint = { id = "org.jlleitschuh.gradle.ktlint", version.ref = "ktlint-plugin" }
kover = { id = "org.jetbrains.kotlinx.kover", version.ref = "kover" }
```

`ktlint-plugin`은 Gradle 플러그인 버전이고, `ktlint`는 Kotlin 소스를 검사하는 엔진 버전입니다. 두 버전을 구분해서 관리합니다.

> Detekt 2.0.0-alpha.6은 아직 알파 버전입니다. 이후 릴리스에서 설정이나 API가 바뀔 수 있으므로 Kotlin·Gradle 버전과 함께 고정합니다. Java Toolchain은 아래 예시에서 21을 사용합니다.
{:.prompt-warning }

- build.gradle.kts

```kotlin
import dev.detekt.gradle.extensions.FailOnSeverity
import kotlinx.kover.gradle.plugin.dsl.CoverageUnit
import org.gradle.api.tasks.TaskProvider
import org.jlleitschuh.gradle.ktlint.reporter.ReporterType

plugins {
    // 기존 Spring Boot 플러그인 선언은 유지합니다.
    alias(libs.plugins.kotlin.jvm)
    alias(libs.plugins.kotlin.spring)
    alias(libs.plugins.detekt)
    alias(libs.plugins.ktlint)
    alias(libs.plugins.kover)
}

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(21)
    }
}

detekt {
    toolVersion.set(libs.versions.detekt.get())
    config.setFrom(files("$rootDir/config/detekt/detekt.yml"))
    buildUponDefaultConfig.set(true)
    parallel.set(true)
    ignoreFailures.set(false)
    failOnSeverity.set(FailOnSeverity.Warning)
    basePath.set(rootDir)
}

ktlint {
    version.set(libs.versions.ktlint.get())
    ignoreFailures.set(false)
    outputToConsole.set(true)

    reporters {
        reporter(ReporterType.PLAIN)
        reporter(ReporterType.SARIF)
    }

    filter {
        exclude("**/generated/**")
    }
}

kover {
    reports {
        total {
            verify {
                // 우선 보고서를 먼저 생성하고, 핵심 모듈의 테스트 수준과 기존 수치와 현재 개발팀 상황 등을 고려하여 정해야 합니다.
                rule("application line coverage") {
                    minBound(80)
                }

                rule("application branch coverage") {
                    minBound(70, coverageUnits = CoverageUnit.BRANCH)
                }
            }
        }
    }
}

tasks.named("check").configure {
    // 타입 해석이 없는 기본 detekt 태스크를 타입 해석 태스크로 교체합니다.
    setDependsOn(dependsOn.filterNot {
        it is TaskProvider<*> && it.name == "detekt"
    })
    dependsOn("ktlintCheck", "detektMain", "detektTest", "koverVerify")
}
```

- `buildUponDefaultConfig.set(true)`: Detekt 기본 설정을 override
- `ignoreFailures.set(false)`와 `failOnSeverity.set(FailOnSeverity.Warning)`: Warning 이상의 위반이 있으면 빌드가 실패하도록 설정
- 2.x에서는 YAML의 `build.maxIssues` 대신 이 실패 기준을 사용
- `check` 설정은 ktlint, 타입 해석을 사용하는 Detekt, Kover를 묶어 `./gradlew check`으로 실행
- FQCN, 코루틴과 일부 잠재적 버그 규칙은 타입 정보가 필요하므로, 최종 검증에서는 `detektMain`과 `detektTest`로 교체

> Detekt 2.x의 기본 `detekt` 태스크는 타입을 해석하지 않는 light 모드로 실행합니다. `detektMain`과 `detektTest`는 컴파일 클래스패스를 사용하는 full 모드로 실행합니다.
{:.prompt-info }

## detekt.yml은 위험도가 높은 규칙부터 시작

`buildUponDefaultConfig.set(true)`를 사용하므로 `detekt.yml`에 기본 설정 전체를 복사할 필요는 없습니다. 생략한 기본 규칙은 그대로 실행하고, 끄거나 override해서 사용합니다.

> 코드 형식은 ktlint, Detekt는 FQCN 사용, 잠재적 버그, 예외 처리, 코루틴, 복잡도를 검사합니다.
{:.prompt-tip }

<details markdown="1">
<summary>config/detekt/detekt.yml</summary>

```yaml
config:
  validation: true # 설정 파일에 Detekt가 모르는 키가 있으면 오류로 처리
  warningsAsErrors: true # 설정 검증 경고(폐기 예정 키 등)도 오류로 처리

# 주석·KDoc 규칙 세트는 사용하지 않음
comments:
  active: false

# 이름 규칙 세트는 사용하지 않음
naming:
  active: false

# 스타일 규칙 세트를 켜고, 기본 활성 규칙도 함께 실행
style:
  active: true
  # import할 수 있는 타입을 전체 패키지 이름으로 쓴 코드 (타입 해석 필요)
  UnnecessaryFullyQualifiedName:
    active: true
  # ktlint의 미사용 import 검사와 겹치므로 끔
  UnusedImport:
    active: false
  # ktlint의 와일드카드 import 검사와 겹치므로 끔
  WildcardImport:
    active: false

complexity:
  # 중첩과 흐름 끊김을 반영한 인지 복잡도
  CognitiveComplexMethod:
    active: true
    allowedComplexity: 15 # 함수당 허용하는 최대 인지 복잡도
  # 분기 수를 센 순환 복잡도
  CyclomaticComplexMethod:
    active: true
    allowedComplexity: 15 # 함수당 허용하는 최대 순환 복잡도
  # 너무 긴 함수
  LongMethod:
    active: true
    allowedLines: 60 # 함수당 허용하는 최대 줄 수
  # 매개변수가 너무 많은 함수와 생성자
  LongParameterList:
    active: true
    allowedFunctionParameters: 6 # 함수 매개변수 최대 개수
    allowedConstructorParameters: 7 # 생성자 매개변수 최대 개수
    ignoreDefaultParameters: true # 기본값이 있는 매개변수는 개수에서 제외
    ignoreDataClasses: true # data class 생성자는 검사에서 제외
  # 블록이 너무 깊게 중첩된 함수
  NestedBlockDepth:
    active: true
    allowedDepth: 4 # 허용하는 최대 중첩 깊이

empty-blocks:
  # 아무 처리도 하지 않는 catch 블록
  EmptyCatchBlock:
    active: true
    allowedExceptionNameRegex: '_|(ignore|expected).*' # 예외 변수 이름이 맞으면 허용

exceptions:
  # TODO()처럼 구현하지 않은 채 남긴 코드
  NotImplementedDeclaration:
    active: true
    excludes:
      - '**/test/**'
  # printStackTrace()로 예외를 출력하는 코드
  PrintStackTrace:
    active: true
  # 잡은 예외를 버리거나 원인 없이 다른 예외로 바꾸는 코드
  SwallowedException:
    active: true
    ignoredExceptionTypes: # 삼켜도 허용하는 예외 (InterruptedException은 뺌)
      - 'NumberFormatException'
      - 'ParseException'
    allowedExceptionNameRegex: '_|(ignore|expected).*'
  # finally에서 예외를 던져 원래 예외를 가리는 코드
  ThrowingExceptionFromFinally:
    active: true
  # Exception처럼 범위가 넓은 예외를 잡는 코드
  TooGenericExceptionCaught:
    active: true
    excludes:
      - '**/test/**'
    exceptionNames: # 범위가 넓다고 보는 예외 타입
      - 'Error'
      - 'Exception'
      - 'RuntimeException'
      - 'Throwable'
    allowedExceptionNameRegex: '_|(ignore|expected).*'
  # 범위가 넓은 예외를 직접 던지는 코드
  TooGenericExceptionThrown:
    active: true
    exceptionNames:
      - 'Error'
      - 'Exception'
      - 'RuntimeException'
      - 'Throwable'

potential-bugs:
  # String처럼 값으로 비교해야 하는 타입을 ===로 비교
  AvoidReferentialEquality:
    active: true
  # var로 선언한 가변 컬렉션
  DoubleMutabilityForCollection:
    active: true
  # 항상 true나 false를 반환하는 equals
  EqualsAlwaysReturnsTrueOrFalse:
    active: true
  # equals와 hashCode 중 하나만 재정의
  EqualsWithHashCodeExist:
    active: true
  # System.gc()처럼 GC를 직접 호출
  ExplicitGarbageCollectionCall:
    active: true
  # 공개 선언이 Java 플랫폼 타입을 그대로 노출
  HasPlatformType:
    active: true
  # Locale 없이 문자열을 포맷하거나 대소문자를 변환
  ImplicitDefaultLocale:
    active: true
  # 10..1처럼 비어 있는 범위
  InvalidRange:
    active: true
  # null이 아닌 값에 붙인 !!
  UnnecessaryNotNullOperator:
    active: true
  # 앞선 catch가 이미 잡아서 실행되지 않는 catch
  UnreachableCatchBlock:
    active: true
  # return이나 throw 뒤에 있어 실행되지 않는 코드
  UnreachableCode:
    active: true
  # nullable 값에 !!를 사용
  UnsafeCallOnNullableType:
    active: true
  # 성공할 수 없는 타입 캐스트
  UnsafeCast:
    active: true

coroutines:
  # GlobalScope로 수명 주기 밖에서 코루틴 실행
  GlobalCoroutineUsage:
    active: true
  # Dispatcher를 주입받지 않고 코드에 직접 지정
  InjectDispatcher:
    active: true
    dispatcherNames: # 주입받아야 하는 Dispatcher
      - 'IO'
      - 'Default'
      - 'Unconfined'
  # 코루틴 안에서 delay 대신 Thread.sleep 호출
  SleepInsteadOfDelay:
    active: true
  # runCatching 등으로 suspend 호출의 CancellationException을 삼킴
  SuspendFunSwallowedCancellation:
    active: true
  # CoroutineScope를 수신자로 받는 suspend 함수
  SuspendFunWithCoroutineScopeReceiver:
    active: true
```

</details>

- **운영 장애로 이어질 수 있는 문제를 중심으로 규칙을 골랐습니다.**
- `style.active: true`는 FQCN 규칙 외의 기본 활성 스타일 규칙도 실행하므로 프로젝트 기준에 맞는지 확인합니다.
- `SwallowedException`의 제외 목록에서 `InterruptedException`을 뺐습니다. 스레드 중단 신호를 삼키면 실행 종료와 취소 처리를 방해할 수 있습니다.
- `validation`과 `warningsAsErrors`는 Detekt 버전을 올린 뒤 이름이 바뀌거나 사라진 설정을 찾는 데 사용합니다.
- 배치 작업의 최상위 경계처럼 `Exception`을 의도적으로 잡아야 한다면 규칙 전체를 끄지 않습니다. 이유를 남기고 필요한 파일이나 코드만 제외합니다.
- 복잡도 임계값은 `./gradlew detektMain detektTest`로 현재 위반 수를 확인하고 핵심 코드부터 고친 뒤 적용합니다. 위반이 많다는 이유만으로 기준선을 자동 생성하거나 임계값을 크게 올리지 않습니다.
- 코루틴을 사용하지 않으면 `coroutines` 블록은 빼도 됩니다. FQCN·코루틴 규칙과 `HasPlatformType`처럼 타입 정보가 필요한 규칙은 최종 검증에서 `detektMain`과 `detektTest`를 실행해야 동작합니다.

## 멀티모듈 설정 예시

멀티모듈에서는 ktlint와 Detekt를 모듈별로 실행하고, Kover 결과는 루트 프로젝트에서 확인합니다. 예를 들어 `app`, `application`, `domain` 모듈이 있다면 루트 `build.gradle.kts`를 다음처럼 구성할 수 있습니다.

<details markdown="1">
<summary>루트 build.gradle.kts 예시</summary>

```kotlin
import dev.detekt.gradle.extensions.DetektExtension
import dev.detekt.gradle.extensions.FailOnSeverity
import kotlinx.kover.gradle.plugin.dsl.CoverageUnit
import org.gradle.api.tasks.TaskProvider
import org.jlleitschuh.gradle.ktlint.KtlintExtension

plugins {
    alias(libs.plugins.detekt) apply false
    alias(libs.plugins.ktlint) apply false
    alias(libs.plugins.kover)
}

subprojects {
    apply(plugin = "dev.detekt")
    apply(plugin = "org.jlleitschuh.gradle.ktlint")
    apply(plugin = "org.jetbrains.kotlinx.kover")

    configure<DetektExtension> {
        toolVersion.set(libs.versions.detekt.get())
        config.setFrom(rootProject.files("config/detekt/detekt.yml"))
        buildUponDefaultConfig.set(true)
        parallel.set(true)
        ignoreFailures.set(false)
        failOnSeverity.set(FailOnSeverity.Warning)
        basePath.set(rootDir)
    }

    configure<KtlintExtension> {
        version.set(libs.versions.ktlint.get())
        ignoreFailures.set(false)
        outputToConsole.set(true)
    }

    tasks.named("check").configure {
        setDependsOn(dependsOn.filterNot {
            it is TaskProvider<*> && it.name == "detekt"
        })
        dependsOn("ktlintCheck", "detektMain", "detektTest")
    }
}

dependencies {
    kover(project(":app"))
    kover(project(":application"))
    kover(project(":domain"))
}

kover {
    reports {
        total {
            verify {
                rule("merged line coverage") {
                    minBound(80)
                }

                rule("merged branch coverage") {
                    minBound(70, coverageUnits = CoverageUnit.BRANCH)
                }
            }
        }
    }
}

tasks.named("check") {
    dependsOn(subprojects.map { "${it.path}:check" })
    dependsOn("koverVerify")
}
```

</details>

루트의 `kover(project(...))`에는 보고서에 포함할 모듈을 명시합니다. 루트에서 `./gradlew koverHtmlReport`나 `./gradlew koverVerify`를 실행하면 모듈들의 테스트와 커버리지를 합칠 수 있습니다.

> Detekt와 ktlint 설정을 모듈마다 복사해 두면 한 곳만 고쳐져 모듈 간 기준이 어긋나기 쉽습니다. 그래서 위 예제는 루트의 `subprojects` 블록에서 공통 설정을 한 번에 적용했습니다. 모듈이 더 많아지면 이 공통 설정을 컨벤션 플러그인으로 옮기고, 각 모듈에서 그 플러그인을 적용하는 편이 관리하기 쉽습니다.
{:.prompt-tip}

## 이전 버전의 Kotlin·Detekt 조합을 사용하는 경우

Kotlin 버전이 낮다고 Detekt 버전도 임의로 낮추기보다는 [공식 호환성 표](https://detekt.dev/docs/introduction/compatibility/)에서 함께 검증한 조합을 확인합니다.

| Kotlin 버전 | Detekt 버전     | 함께 검증한 Gradle 버전 |
| ----------- | --------------- | ----------------------- |
| `2.4.10`    | `2.0.0-alpha.6` | `9.6.1`                 |
| `2.4.0`     | `2.0.0-alpha.5` | `9.5.1`                 |
| `2.3.21`    | `2.0.0-alpha.3` | `9.3.1`                 |
| `2.3.0`     | `2.0.0-alpha.2` | `9.3.0`                 |
| `2.2.20`    | `2.0.0-alpha.1` | `9.1.0`                 |
| `2.2.10`    | `2.0.0-alpha.0` | `8.13.0`                |
| `2.0.21`    | `1.23.8`        | `8.12.1`                |

### Detekt 1.23.8

Detekt 1.23.8을 사용하는 프로젝트에서는 아래처럼 설정합니다.

- libs.versions.toml

```toml
[versions]
kotlin = "2.0.21"
detekt = "1.23.8"

[plugins]
kotlin-jvm = { id = "org.jetbrains.kotlin.jvm", version.ref = "kotlin" }
kotlin-spring = { id = "org.jetbrains.kotlin.plugin.spring", version.ref = "kotlin" }
detekt = { id = "io.gitlab.arturbosch.detekt", version.ref = "detekt" }
```

단일 모듈의 `detekt` 블록은 1.x API로 작성합니다. `FailOnSeverity` import와 설정은 제거합니다.

- build.gradle.kts

```kotlin
detekt {
    toolVersion = libs.versions.detekt.get()
    config.setFrom(files("$rootDir/config/detekt/detekt.yml"))
    buildUponDefaultConfig = true
    parallel = true
    ignoreFailures = false
    basePath.set(rootDir)
}
```

멀티모듈도 플러그인 ID를 `io.gitlab.arturbosch.detekt`로 바꾸고, `DetektExtension`을 `io.gitlab.arturbosch.detekt.extensions.DetektExtension`에서 import합니다. 확장 설정에는 위 1.x 속성 대입 방식을 사용합니다. `detektMain`·`detektTest`를 최종 검증에 연결하는 구성은 유지합니다.

YAML에서는 다음 블록으로 `style`과 `complexity` 설정을 교체하고 `build` 블록을 추가하며, 나머지 규칙은 [1.23.8 기본 설정](https://github.com/detekt/detekt/blob/v1.23.8/detekt-core/src/main/resources/default-detekt-config.yml)과 비교해서 작성합니다.

- detekt.yml

```yaml
build:
  maxIssues: 0

style:
  active: false

complexity:
  CognitiveComplexMethod:
    active: true
    threshold: 15
  CyclomaticComplexMethod:
    active: true
    threshold: 15
  LongMethod:
    active: true
    threshold: 60
  LongParameterList:
    active: true
    functionThreshold: 6
    constructorThreshold: 7
    ignoreDefaultParameters: true
    ignoreDataClasses: true
  NestedBlockDepth:
    active: true
    threshold: 4
```

> Detekt 1.23.8에는 `UnnecessaryFullyQualifiedName`이 없으므로 FQCN 검사는 제외됩니다.
{:.prompt-warning}

## AGENTS.md에는 검증 절차만

처음에는 `AGENTS.md`에 지켜야 할 코드 스타일과 규칙을 한국어 자연어로 일일이 적어 두었습니다. 예를 들어 "클래스 본문에 FQCN을 쓰지 말고 import를 사용할 것", "어노테이션 작성 시 import나 별칭을 쓸 것" 같은 식입니다.

하지만 프롬프트에 아무리 꼼꼼하게 적어 두어도 AI가 매번 규칙을 지킨다는 보장은 없었습니다. 결국 코드가 기준을 지켰는지 매번 사람이 눈으로 다시 확인해야 했습니다.

그래서 방식을 바꾸었습니다. FQCN 금지나 import 순서, 복잡도 제한 같은 세부 규칙은 앞서 설정한 `detekt.yml`과 `ktlint`, Gradle 빌드 스크립트에 정의합니다. 그리고 `AGENTS.md`에는 코딩 규칙을 길게 나열하는 대신, 품질 게이트를 실행할 도구 명령과 **기본 검증 루프(실행 순서, 실패 시 처리 절차, 가드레일)**만 남겼습니다. 도구가 위반을 잡아 빌드를 실패시키면, AI가 그 피드백을 보고 스스로 코드를 수정하게 만드는 것입니다.

실제 프로젝트의 `AGENTS.md`에는 다음과 같이 품질 게이트 명령과 핵심 지침을 선언해 둘 수 있습니다.

```markdown
Static quality gates: mise run lint runs verifyKotlinQuality (main-code Detekt checks, typed main/test import checks, custom rule tests, and all-module ktlint). mise run format runs formatKotlin. Use imports or alias imports for annotations. Avoid redundant fully qualified types; preserve FQCNs when simple names collide. Keep rule implementation, ServiceLoader metadata, and regression tests together in detekt-rules; never add it to application runtime dependencies.
```

이렇게 세부 규칙 검사를 도구에 위임했다면, 에이전트 지침에는 다음 세 가지 검증 절차를 명확히 정해 두어야 합니다.

### 1. 한 개의 최종 검증 명령

사람과 AI가 서로 다른 명령을 실행하면 결과를 비교하기 어렵습니다. 빠른 피드백을 위해 로컬에서 태스크를 나눠 실행하더라도, 최종 완료 조건은 `./gradlew check`나 `./gradlew qualityGate`처럼 한 명령으로 모으는 편이 좋습니다.

최종 태스크에는 단위·통합 테스트, ktlint, Detekt, Kover 검증, ArchUnit 아키텍처 테스트를 모두 연결합니다. 의존성 취약점 검사처럼 시간이 오래 걸리는 작업만 별도의 CI 단계로 분리합니다.

### 2. 실패 보고와 중단 조건

도구가 위반을 잡더라도 코드 수정만으로 해결되지 않는 문제가 있습니다. 무한 루프에 빠지지 않도록 다음 상황에서는 반복을 멈추고 원인을 보고하도록 정합니다.

- 테스트 기대값과 요구사항이 충돌하는 경우
- 정적 분석 규칙끼리 서로 다른 수정을 요구하는 경우
- 외부 서비스나 테스트 환경이 불안정한 경우
- 검증을 통과하려면 공개 API나 데이터 모델을 바꿔야 하는 경우
- 같은 원인으로 여러 차례 실패해 사람의 추가 판단이 필요한 경우

검사가 실패하면 실행한 명령과 오류가 난 파일·줄, 규칙 이름, 오류 내용을 요약해 남기게 합니다. 콘솔에는 수정에 필요한 핵심 오류를 보여주고, CI에는 Detekt·ktlint 결과와 Kover HTML 보고서를 보관해 검토하는 사람도 같은 결과를 확인할 수 있게 합니다.

### 3. 검증 우회 방지 (가드레일)

AI가 검사를 통과하려고 코드 대신 검사 기준을 낮추는 경우가 있습니다.

- `detekt.yml`의 복잡도 임계값을 임의로 높임
- Detekt나 ktlint의 기준선(baseline)을 다시 생성함
- 넓은 범위에 `@Suppress`를 추가함
- Kover의 최소 커버리지를 낮추거나 핵심 패키지를 보고서에서 제외함
- 검증문(assertion)이 없는 테스트로 실행 줄 수만 늘림

이런 변경을 막으려면 에이전트 지침에 수정 가능한 범위와 금지 조건을 명시해야 합니다.

- 별도 요청 없이 검사 설정과 기준선을 변경하지 않는다.
- 검사 제외는 이유를 설명하고 가장 좁은 범위에만 적용한다.
- 커버리지 기준을 낮추지 않고 빠진 동작의 테스트를 먼저 확인한다.
- 로컬 검증과 원격 CI 결과를 구분해 보고한다.
- 검증을 우회해야만 진행할 수 있다면 임의로 수정하지 말고 판단을 요청한다.


## 보너스: 의존성 보안 검사(OWASP Dependency-Check)

OWASP Dependency-Check 는 프로젝트가 사용하는 라이브러리에서 알려진 취약점을 찾습니다. 처음 실행할 때는 취약점 데이터를 내려받아 시간이 오래 걸릴 수 있으므로 빠른 로컬 검사보다 CI나 정기 작업에 두는 편이 낫습니다.

```kotlin
plugins {
    id("org.owasp.dependencycheck") version "13.0.0"
}
```

```bash
./gradlew dependencyCheckAnalyze
```

## Java 정적 검사 설정

Detekt처럼 여러 영역을 다루는 단일 도구보다 목적별 도구를 조합하는 경우가 많습니다.

| Kotlin 구성               | Java 구성  | 역할                             |
| ------------------------- | ---------- | -------------------------------- |
| ktlint                    | Checkstyle | 형식, import, 이름 규칙          |
| Detekt                    | PMD        | 소스 수준의 코드 냄새와 복잡도   |
| Detekt의 잠재적 버그 규칙 | SpotBugs   | 컴파일된 바이트코드의 버그 패턴  |
| Kover                     | JaCoCo     | 테스트 커버리지 보고와 기준 검사 |
| ArchUnit                  | ArchUnit   | 패키지와 계층 의존성 검사        |

Java Spring Boot 프로젝트에서는 Checkstyle과 PMD를 `check`에 연결하고, 필요한 경우 SpotBugs를 추가하는 구성을 권장합니다. JaCoCo의 커버리지 검증 태스크는 기본적으로 `check`에 자동 연결되지 않으므로 저장소에서 명시적으로 연결하거나 최종 명령에 포함해야 합니다.

```bash
./gradlew check jacocoTestCoverageVerification
```

Java에서도 하네스에 "star import 금지"를 다시 적기보다 `checkstyle.xml`에 `AvoidStarImport`를 선언합니다. PMD 규칙은 PMD ruleset, SpotBugs 필터는 SpotBugs 설정에 둡니다. 에이전트는 정해진 Gradle 태스크를 실행하고 그 결과를 확인합니다.

## 정리

이제는 지침만으로 하네스를 만드는 데 그치지 않고, 코드 스타일과 규칙을 일관되게 맞추는 검증을 도구로 자동화해야 합니다. 세부 규칙 검사를 도구에 맡겨 두어야 AI에게 작업을 맡기더라도 기대하는 코드 품질을 안정적으로 유지할 수 있습니다.

## 참고자료

- [Kotlin 코드 품질 도구](https://kotlinlang.org/docs/jvm-code-analysis.html)
- [ktlint 공식 저장소](https://github.com/ktlint/ktlint)
- [ktlint Gradle Plugin](https://github.com/JLLeitschuh/ktlint-gradle)
- [Detekt Gradle 플러그인](https://detekt.dev/docs/gettingstarted/gradle/)
- [Detekt 버전 호환성 표](https://detekt.dev/docs/introduction/compatibility/)
- [Detekt 2.0 변경 사항과 마이그레이션](https://detekt.dev/changelog-2.0.0/)
- [Detekt 2.0.0-alpha.6 기본 설정](https://github.com/detekt/detekt/blob/v2.0.0-alpha.6/detekt-core/src/main/resources/default-detekt-config.yml)
- [Kover Gradle Plugin](https://kotlin.github.io/kotlinx-kover/gradle-plugin/)
- [Gradle 생명주기 태스크 구성](https://docs.gradle.org/current/userguide/organizing_tasks.html)
- [Gradle Checkstyle 플러그인](https://docs.gradle.org/current/userguide/checkstyle_plugin.html)
- [Gradle PMD 플러그인](https://docs.gradle.org/current/userguide/pmd_plugin.html)
- [SpotBugs Gradle 플러그인](https://spotbugs.readthedocs.io/en/stable/gradle.html)
- [Gradle JaCoCo 플러그인](https://docs.gradle.org/current/userguide/jacoco_plugin.html)
- [ArchUnit User Guide](https://www.archunit.org/userguide/html/000_Index.html)
