---
title: java 성능 시간 측정은 System.nanoTime()
description: 성능 시간은 System.nanoTime()을 사용해야한다.(currentTimeMillis() x)
author: ydj515
date: 2025-02-26 11:33:00 +0800
categories: [java, time]
tags: [java, time]
pin: true
math: true
mermaid: true
image:
  path: /assets/img/java/logo.png
  lqip: data:image/webp;base64,UklGRpoAAABXRUJQVlA4WAoAAAAQAAAADwAABwAAQUxQSDIAAAARL0AmbZurmr57yyIiqE8oiG0bejIYEQTgqiDA9vqnsUSI6H+oAERp2HZ65qP/VIAWAFZQOCBCAAAA8AEAnQEqEAAIAAVAfCWkAALp8sF8rgRgAP7o9FDvMCkMde9PK7euH5M1m6VWoDXf2FkP3BqV0ZYbO6NA/VFIAAAA
  alt: java
---

## Java에서 nanoTime()과 currentTimeMillis()의 차이점

Java에서 시간을 다룰 때 흔히 사용하는 두 가지 메서드가 있습니다.

바로 `System.nanoTime()`과 `System.currentTimeMillis()`인데요, 이 둘은 모두 시간을 측정하는 데 사용되지만, 사용 목적과 동작 방식이 다릅니다.

## System.currentTimeMillis()

- 현재 시간을 Unix Epoch(1970-01-01 00:00:00 UTC) 기준으로 밀리초 단위로 반환
- 시스템 시계(Clock)에서 값을 가져오기 때문에 OS 시간 변경(예: NTP 동기화, 수동 시간 변경)에 영향을 받을 수 있음
- 네트워크나 데이터베이스에서 타임스탬프 기록 시 주로 사용

```java
public class CurrentTimeMillisExample {
    public static void main(String[] args) {
        long timestamp = System.currentTimeMillis();
        // 현재 시간 (ms): 1708881234567
        System.out.println("현재 시간 (ms): " + timestamp);
    }
}
```

> 주의사항!
> - 시스템 시간이 조정되면 값이 급격히 변할 수 있음 (예: NTP 동기화, 수동 조정)
> - millis 단위로 반환되므로 정밀도가 낮음
{:.prompt-danger}

## System.nanoTime()

- JVM 실행 이후의 경과 시간을 나노초(ns) 단위로 반환
- OS 시간 변경 영향을 받지 않음 -> 상대적인 시간 측정에 적합
- 성능 테스트, 코드 실행 시간 측정 등 정밀한 시간 측정이 필요한 경우 사용

```java
public class NanoTimeExample {
    public static void main(String[] args) {
        long startTime = System.nanoTime();

        // .. doSomething

        long endTime = System.nanoTime();
        long elapsedTime = endTime - startTime;

        // 실행 시간 (ns): 123456789
        System.out.println("실행 시간 (ns): " + elapsedTime);
    }
}
```

> 주의사항!
> - nanoTime()은 절대적인 시간 측정에는 부적합 -> Date나 Timestamp로 변환할 수 없음
> - JVM 내부에서 사용하는 고해상도 타이머를 기반으로 하므로, 다른 시스템 간 비교가 불가능함
{:.prompt-danger}

## 결론
- System.currentTimeMillis() -> 현재 시각을 얻을 때 사용 (OS 시간 변경 영향을 받음)
- System.nanoTime() -> 정밀한 시간 측정(실행 시간 등) 시 사용 (OS 시간 변경 영향을 받지 않음)