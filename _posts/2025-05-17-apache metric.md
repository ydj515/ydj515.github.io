---
title: Apache metric exporter
description: Apache metric exporter
author: ydj515
date: 2025-05-17 11:33:00 +0800
categories: [apache, metric, apache exporter, opentelemetry]
tags: [apache, metric, apache exporter, opentelemetry]
pin: true
math: true
mermaid: true
image:
  path: /assets/img/apache/logo.png
  lqip: data:image/webp;base64,UklGRpoAAABXRUJQVlA4WAoAAAAQAAAADwAABwAAQUxQSDIAAAARL0AmbZurmr57yyIiqE8oiG0bejIYEQTgqiDA9vqnsUSI6H+oAERp2HZ65qP/VIAWAFZQOCBCAAAA8AEAnQEqEAAIAAVAfCWkAALp8sF8rgRgAP7o9FDvMCkMde9PK7euH5M1m6VWoDXf2FkP3BqV0ZYbO6NA/VFIAAAA
  alt: apache
---

## apache metric 설정

apache exporter를 사용할 수도 있고, opentelemetry 모듈을 apache에 넣어서 확인 가능합니다.

### apache opentelemetry 모듈 다운로드 및 설치

```bash
cd /opt
wget https://github.com/open-telemetry/opentelemetry-cpp-contrib/releases/download/webserver%2Fv1.1.0/opentelemetry-webserver-sdk-x64-linux.tgz
tar -xvzf opentelemetry-webserver-sdk-x64-linux.tgz
./opentelemetry-webserver-sdk/install.sh
```

### apache opentelemetry 모듈 환경 설정

```bash
cd /etc/ld.so.conf.d
cp -R /opt/opentelemetry-webserver-sdk/sdk_lib/lib .
sudo ldconfig
```

### apache conf 파일 수정

```bash
sudo vi /etc/apache2/apache2.conf

# 맨 아래에 내용 추가
Include ./opentelemetry_module.conf
```

### opentelemetry_module.conf 생성

```bash
sudo vi /etc/apache2/opentelemetry_module.conf

# Load OpenTelemetry shared libraries
LoadFile /opt/opentelemetry-webserver-sdk/sdk_lib/lib/libopentelemetry_common.so
LoadFile /opt/opentelemetry-webserver-sdk/sdk_lib/lib/libopentelemetry_resources.so
LoadFile /opt/opentelemetry-webserver-sdk/sdk_lib/lib/libopentelemetry_trace.so
LoadFile /opt/opentelemetry-webserver-sdk/sdk_lib/lib/libopentelemetry_otlp_recordable.so
#LoadFile /opt/opentelemetry-webserver-sdk/sdk_lib/lib/libopentelemetry_exporter_otlp_grpc.so
LoadFile /opt/opentelemetry-webserver-sdk/sdk_lib/lib/libopentelemetry_webserver_sdk.so
LoadFile /opt/opentelemetry-webserver-sdk/sdk_lib/lib/libopentelemetry_exporter_ostream_span.so

# Load Apache module (버전에 맞는 모듈 선택!)
LoadModule otel_apache_module /opt/opentelemetry-webserver-sdk/WebServerModule/Apache/libmod_apache_otel.so
# 또는 Apache 2.2일 경우:
# LoadModule otel_apache_module /opt/opentelemetry-webserver-sdk/WebServerModule/Apache/libmod_apache_otel22.so

ApacheModuleEnabled ON

# otlp
#ApacheModuleOtelSpanExporter otlp
#ApacheModuleOtelExporterEndpoint http://localhost:4317

# log
ApacheModuleOtelSpanExporter ostream

ApacheModuleServiceName apache-service
ApacheModuleServiceNamespace apache
ApacheModuleServiceInstanceId apache-instance-1
```

### mod_status 활성화

```bash
sudo a2enmod status
```

### 000-default.conf 설정파일 수정

```bash
sudo vi /etc/apache2/sites-available/000-default.conf

<Location "/server-status">
    SetHandler server-status
    Require all granted
</Location>
```

### apache 재시작

```bash
sudo systemctl restart apache2
```

## apache exporter
apache exporter로 metric을 뽑는 방식을 설명합니다.

### apache exporter 설치

```bash
wget https://github.com/Lusitaniae/apache_exporter/releases/download/v0.9.0/apache_exporter-0.9.0.linux-amd64.tar.gz
sudo mv apache_exporter-0.11.0.linux-amd64/apache_exporter /usr/local/bin/
```

### apache exporter 서비스 등록
```bash
sudo vi /etc/systemd/system/apache_exporter.service

[Unit]
Description=Prometheus Apache Exporter
After=network.target

[Service]
User=www-data
Group=www-data
Type=simple
ExecStart=/usr/local/bin/apache_exporter \
  --scrape_uri=http://127.0.0.1/server-status?auto

Restart=always

[Install]
WantedBy=multi-user.target
```

### 서비스 데몬 등록 및 시작

```bash
sudo systemctl daemon-reexec
sudo systemctl daemon-reload
sudo systemctl enable apache_exporter
sudo systemctl start apache_exporter
```

### apache exporter로 뽑히는 metric

```bash
curl localhost:9117/metrics
```

```java
apache_accesses_total 746 # 총 요청 수. counter
apache_cpuload 0.0668369 # 워커 전체의 CPU 사용률. gauge
apache_duration_ms_total 692 # 누적 요청 처리 시간 (ms). counter
apache_exporter_build_info{branch="HEAD",goversion="go1.16.5",revision="5f55c8eafd0c5e51237736b361db395b2b2b5e09",version="0.9.0"} 1 # apache_exporter_build_info. gauge
apache_scoreboard{state="closing"} 0 # apache_scoreboard. gauge
apache_scoreboard{state="dns"} 0 # apache_scoreboard. gauge
apache_scoreboard{state="graceful_stop"} 0 # apache_scoreboard. gauge
apache_scoreboard{state="idle"} 48 # apache_scoreboard. gauge
apache_scoreboard{state="idle_cleanup"} 0 # apache_scoreboard. gauge
apache_scoreboard{state="keepalive"} 1 # apache_scoreboard. gauge
apache_scoreboard{state="logging"} 0 # apache_scoreboard. gauge
apache_scoreboard{state="open_slot"} 100 # apache_scoreboard. gauge
apache_scoreboard{state="read"} 0 # apache_scoreboard. gauge
apache_scoreboard{state="reply"} 1 # apache_scoreboard. gauge
apache_scoreboard{state="startup"} 0 
apache_sent_kilobytes_total 1230 # 전송된 총 KB. counter
apache_up 1 # Apache 서버에 접근 가능한지 여부 (1이면 정상). gauge
apache_uptime_seconds_total 4309 # 서버가 실행된 시간(초). counter
apache_version{version="Apache/2.4.58 (Ubuntu) mod_jk/1.2.49"} 2.4 # Apache 서버 버전 정보. counter
apache_workers{state="busy"} 2 # 워커 카운트. gauge
apache_workers{state="idle"} 48 # 워커 카운트. gauge
```

### 추가로 산출할 수 있는 metric
rate(apache_accesses_total[1m]) # 초당 요청 수(rps)
rate(apache_sent_kilobytes_total[1m]) * 1024 # 초당 전송 바이트
rate(apache_duration_ms_total[1m]) / rate(apache_accesses_total[1m]) # 평균 응답 시간

[출처]
- https://github.com/open-telemetry/opentelemetry-cpp-contrib/tree/main/instrumentation/otel-webserver-module
- https://github.com/Lusitaniae/apache_exporter