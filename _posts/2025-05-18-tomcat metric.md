---
title: Tomcat metric
description: Tomcat metric
author: ydj515
date: 2025-05-18 11:33:00 +0800
categories: [tomcat, metric, jmx exporter, opentelemetry]
tags: [tomcat, metric, jmx exporter, opentelemetry]
pin: true
math: true
mermaid: true
image:
  path: /assets/img/tomcat/logo.png
  lqip: data:image/webp;base64,UklGRpoAAABXRUJQVlA4WAoAAAAQAAAADwAABwAAQUxQSDIAAAARL0AmbZurmr57yyIiqE8oiG0bejIYEQTgqiDA9vqnsUSI6H+oAERp2HZ65qP/VIAWAFZQOCBCAAAA8AEAnQEqEAAIAAVAfCWkAALp8sF8rgRgAP7o9FDvMCkMde9PK7euH5M1m6VWoDXf2FkP3BqV0ZYbO6NA/VFIAAAA
  alt: tomcat
---

## tomcat metric 설정

`jmx exporter`를 사용할 수도 있고, `opentelemetry-javaagent.jar`를 활용할 수 있습니다.

### opentelemetry-javaagent.jar 다운로드
```bash
mkdir /opt/otel && cd /opt/otel
wget https://github.com/open-telemetry/opentelemetry-java-instrumentation/releases/download/v2.14.0/opentelemetry-javaagent.jar
```

### tomcat catalina.sh 수정
```bash
cd /opt/tomcat9
sudo su
vi bin/catalina.sh

# catalina.sh에 맨 위에 아래 내용 추가

JAVA_OPTS="$JAVA_OPTS -javaagent:/opt/otel/opentelemetry-javaagent.jar \
  -Dotel.service.name=tomcat-service \
  -Dotel.metrics.exporter=prometheus \
  -Dotel.exporter.prometheus.port=9464 \
  -Dotel.exporter.prometheus.host=0.0.0.0 \
  -Dotel.traces.exporter=none \
  -Dotel.logs.exporter=none"
```

### metric 확인

```bash
curl http://localhost:9464/metrics
```

- metric 내용

  ```java
  # HELP jvm_class_count Number of classes currently loaded.
  # TYPE jvm_class_count gauge
  jvm_class_count{otel_scope_name="io.opentelemetry.runtime-telemetry-java8",otel_scope_version="2.14.0-alpha"} 7042.0
  # HELP jvm_class_loaded_total Number of classes loaded since JVM start.
  # TYPE jvm_class_loaded_total counter
  jvm_class_loaded_total{otel_scope_name="io.opentelemetry.runtime-telemetry-java8",otel_scope_version="2.14.0-alpha"} 7041.0
  # HELP jvm_class_unloaded_total Number of classes unloaded since JVM start.
  # TYPE jvm_class_unloaded_total counter
  jvm_class_unloaded_total{otel_scope_name="io.opentelemetry.runtime-telemetry-java8",otel_scope_version="2.14.0-alpha"} 1.0
  # HELP jvm_cpu_count Number of processors available to the Java virtual machine.
  # TYPE jvm_cpu_count gauge
  jvm_cpu_count{otel_scope_name="io.opentelemetry.runtime-telemetry-java8",otel_scope_version="2.14.0-alpha"} 2.0
  # HELP jvm_cpu_recent_utilization_ratio Recent CPU utilization for the process as reported by the JVM.
  # TYPE jvm_cpu_recent_utilization_ratio gauge
  jvm_cpu_recent_utilization_ratio{otel_scope_name="io.opentelemetry.runtime-telemetry-java8",otel_scope_version="2.14.0-alpha"} 0.0
  # HELP jvm_cpu_time_seconds_total CPU time used by the process as reported by the JVM.
  # TYPE jvm_cpu_time_seconds_total counter
  jvm_cpu_time_seconds_total{otel_scope_name="io.opentelemetry.runtime-telemetry-java8",otel_scope_version="2.14.0-alpha"} 10.13
  # HELP jvm_gc_duration_seconds Duration of JVM garbage collection actions.
  # TYPE jvm_gc_duration_seconds histogram
  jvm_gc_duration_seconds_bucket{jvm_gc_action="end of minor GC",jvm_gc_name="G1 Young Generation",otel_scope_name="io.opentelemetry.runtime-telemetry-java8",otel_scope_version="2.14.0-alpha",le="0.01"} 3
  jvm_gc_duration_seconds_bucket{jvm_gc_action="end of minor GC",jvm_gc_name="G1 Young Generation",otel_scope_name="io.opentelemetry.runtime-telemetry-java8",otel_scope_version="2.14.0-alpha",le="0.1"} 3
  jvm_gc_duration_seconds_bucket{jvm_gc_action="end of minor GC",jvm_gc_name="G1 Young Generation",otel_scope_name="io.opentelemetry.runtime-telemetry-java8",otel_scope_version="2.14.0-alpha",le="1.0"} 3
  jvm_gc_duration_seconds_bucket{jvm_gc_action="end of minor GC",jvm_gc_name="G1 Young Generation",otel_scope_name="io.opentelemetry.runtime-telemetry-java8",otel_scope_version="2.14.0-alpha",le="10.0"} 3
  jvm_gc_duration_seconds_bucket{jvm_gc_action="end of minor GC",jvm_gc_name="G1 Young Generation",otel_scope_name="io.opentelemetry.runtime-telemetry-java8",otel_scope_version="2.14.0-alpha",le="+Inf"} 3
  jvm_gc_duration_seconds_count{jvm_gc_action="end of minor GC",jvm_gc_name="G1 Young Generation",otel_scope_name="io.opentelemetry.runtime-telemetry-java8",otel_scope_version="2.14.0-alpha"} 3
  jvm_gc_duration_seconds_sum{jvm_gc_action="end of minor GC",jvm_gc_name="G1 Young Generation",otel_scope_name="io.opentelemetry.runtime-telemetry-java8",otel_scope_version="2.14.0-alpha"} 0.021
  # HELP jvm_memory_committed_bytes Measure of memory committed.
  # TYPE jvm_memory_committed_bytes gauge
  jvm_memory_committed_bytes{jvm_memory_pool_name="CodeHeap 'non-nmethods'",jvm_memory_type="non_heap",otel_scope_name="io.opentelemetry.runtime-telemetry-java8",otel_scope_version="2.14.0-alpha"} 2555904.0
  jvm_memory_committed_bytes{jvm_memory_pool_name="CodeHeap 'non-profiled nmethods'",jvm_memory_type="non_heap",otel_scope_name="io.opentelemetry.runtime-telemetry-java8",otel_scope_version="2.14.0-alpha"} 2555904.0
  jvm_memory_committed_bytes{jvm_memory_pool_name="CodeHeap 'profiled nmethods'",jvm_memory_type="non_heap",otel_scope_name="io.opentelemetry.runtime-telemetry-java8",otel_scope_version="2.14.0-alpha"} 9502720.0
  jvm_memory_committed_bytes{jvm_memory_pool_name="Compressed Class Space",jvm_memory_type="non_heap",otel_scope_name="io.opentelemetry.runtime-telemetry-java8",otel_scope_version="2.14.0-alpha"} 4390912.0
  jvm_memory_committed_bytes{jvm_memory_pool_name="G1 Eden Space",jvm_memory_type="heap",otel_scope_name="io.opentelemetry.runtime-telemetry-java8",otel_scope_version="2.14.0-alpha"} 4.6137344E7
  jvm_memory_committed_bytes{jvm_memory_pool_name="G1 Old Gen",jvm_memory_type="heap",otel_scope_name="io.opentelemetry.runtime-telemetry-java8",otel_scope_version="2.14.0-alpha"} 3.3554432E7
  jvm_memory_committed_bytes{jvm_memory_pool_name="G1 Survivor Space",jvm_memory_type="heap",otel_scope_name="io.opentelemetry.runtime-telemetry-java8",otel_scope_version="2.14.0-alpha"} 5242880.0
  jvm_memory_committed_bytes{jvm_memory_pool_name="Metaspace",jvm_memory_type="non_heap",otel_scope_name="io.opentelemetry.runtime-telemetry-java8",otel_scope_version="2.14.0-alpha"} 3.4537472E7
  # HELP jvm_memory_limit_bytes Measure of max obtainable memory.
  # TYPE jvm_memory_limit_bytes gauge
  jvm_memory_limit_bytes{jvm_memory_pool_name="CodeHeap 'non-nmethods'",jvm_memory_type="non_heap",otel_scope_name="io.opentelemetry.runtime-telemetry-java8",otel_scope_version="2.14.0-alpha"} 5828608.0
  jvm_memory_limit_bytes{jvm_memory_pool_name="CodeHeap 'non-profiled nmethods'",jvm_memory_type="non_heap",otel_scope_name="io.opentelemetry.runtime-telemetry-java8",otel_scope_version="2.14.0-alpha"} 1.22916864E8
  jvm_memory_limit_bytes{jvm_memory_pool_name="CodeHeap 'profiled nmethods'",jvm_memory_type="non_heap",otel_scope_name="io.opentelemetry.runtime-telemetry-java8",otel_scope_version="2.14.0-alpha"} 1.22912768E8
  jvm_memory_limit_bytes{jvm_memory_pool_name="Compressed Class Space",jvm_memory_type="non_heap",otel_scope_name="io.opentelemetry.runtime-telemetry-java8",otel_scope_version="2.14.0-alpha"} 1.073741824E9
  jvm_memory_limit_bytes{jvm_memory_pool_name="G1 Old Gen",jvm_memory_type="heap",otel_scope_name="io.opentelemetry.runtime-telemetry-java8",otel_scope_version="2.14.0-alpha"} 1.02760448E9
  # HELP jvm_memory_used_after_last_gc_bytes Measure of memory used, as measured after the most recent garbage collection event on this pool.
  # TYPE jvm_memory_used_after_last_gc_bytes gauge
  jvm_memory_used_after_last_gc_bytes{jvm_memory_pool_name="G1 Eden Space",jvm_memory_type="heap",otel_scope_name="io.opentelemetry.runtime-telemetry-java8",otel_scope_version="2.14.0-alpha"} 0.0
  jvm_memory_used_after_last_gc_bytes{jvm_memory_pool_name="G1 Old Gen",jvm_memory_type="heap",otel_scope_name="io.opentelemetry.runtime-telemetry-java8",otel_scope_version="2.14.0-alpha"} 1.5864832E7
  jvm_memory_used_after_last_gc_bytes{jvm_memory_pool_name="G1 Survivor Space",jvm_memory_type="heap",otel_scope_name="io.opentelemetry.runtime-telemetry-java8",otel_scope_version="2.14.0-alpha"} 4674464.0
  # HELP jvm_memory_used_bytes Measure of memory used.
  # TYPE jvm_memory_used_bytes gauge
  jvm_memory_used_bytes{jvm_memory_pool_name="CodeHeap 'non-nmethods'",jvm_memory_type="non_heap",otel_scope_name="io.opentelemetry.runtime-telemetry-java8",otel_scope_version="2.14.0-alpha"} 1270784.0
  jvm_memory_used_bytes{jvm_memory_pool_name="CodeHeap 'non-profiled nmethods'",jvm_memory_type="non_heap",otel_scope_name="io.opentelemetry.runtime-telemetry-java8",otel_scope_version="2.14.0-alpha"} 1602176.0
  jvm_memory_used_bytes{jvm_memory_pool_name="CodeHeap 'profiled nmethods'",jvm_memory_type="non_heap",otel_scope_name="io.opentelemetry.runtime-telemetry-java8",otel_scope_version="2.14.0-alpha"} 9275776.0
  jvm_memory_used_bytes{jvm_memory_pool_name="Compressed Class Space",jvm_memory_type="non_heap",otel_scope_name="io.opentelemetry.runtime-telemetry-java8",otel_scope_version="2.14.0-alpha"} 4258128.0
  jvm_memory_used_bytes{jvm_memory_pool_name="G1 Eden Space",jvm_memory_type="heap",otel_scope_name="io.opentelemetry.runtime-telemetry-java8",otel_scope_version="2.14.0-alpha"} 2.8311552E7
  jvm_memory_used_bytes{jvm_memory_pool_name="G1 Old Gen",jvm_memory_type="heap",otel_scope_name="io.opentelemetry.runtime-telemetry-java8",otel_scope_version="2.14.0-alpha"} 1.759744E7
  jvm_memory_used_bytes{jvm_memory_pool_name="G1 Survivor Space",jvm_memory_type="heap",otel_scope_name="io.opentelemetry.runtime-telemetry-java8",otel_scope_version="2.14.0-alpha"} 4674464.0
  jvm_memory_used_bytes{jvm_memory_pool_name="Metaspace",jvm_memory_type="non_heap",otel_scope_name="io.opentelemetry.runtime-telemetry-java8",otel_scope_version="2.14.0-alpha"} 3.42168E7
  # HELP jvm_thread_count Number of executing platform threads.
  # TYPE jvm_thread_count gauge
  jvm_thread_count{jvm_thread_daemon="false",jvm_thread_state="runnable",otel_scope_name="io.opentelemetry.runtime-telemetry-java8",otel_scope_version="2.14.0-alpha"} 1.0
  jvm_thread_count{jvm_thread_daemon="true",jvm_thread_state="runnable",otel_scope_name="io.opentelemetry.runtime-telemetry-java8",otel_scope_version="2.14.0-alpha"} 5.0
  jvm_thread_count{jvm_thread_daemon="true",jvm_thread_state="timed_waiting",otel_scope_name="io.opentelemetry.runtime-telemetry-java8",otel_scope_version="2.14.0-alpha"} 3.0
  jvm_thread_count{jvm_thread_daemon="true",jvm_thread_state="waiting",otel_scope_name="io.opentelemetry.runtime-telemetry-java8",otel_scope_version="2.14.0-alpha"} 4.0
  # TYPE target_info gauge
  target_info{host_arch="amd64",host_name="ip-172-31-27-76",os_description="Linux 6.8.0-1024-aws",os_type="linux",process_command_args="[/usr/lib/jvm/java-17-openjdk-amd64/bin/java, -Djava.util.logging.config.file=/opt/tomcat9/conf/logging.properties, -Djava.util.logging.manager=org.apache.juli.ClassLoaderLogManager, -javaagent:/opt/otel/opentelemetry-javaagent.jar, -Dotel.service.name=tomcat-service, -Dotel.metrics.exporter=prometheus, -Dotel.exporter.prometheus.port=9464, -Dotel.exporter.prometheus.host=0.0.0.0, -Dotel.traces.exporter=none, -Dotel.logs.exporter=none, -Djdk.tls.ephemeralDHKeySize=2048, -Djava.protocol.handler.pkgs=org.apache.catalina.webresources, -Dsun.io.useCanonCaches=false, -Dorg.apache.catalina.security.SecurityListener.UMASK=0027, -Dignore.endorsed.dirs=, -classpath, /opt/tomcat9/bin/bootstrap.jar:/opt/tomcat9/bin/tomcat-juli.jar, -Dcatalina.base=/opt/tomcat9, -Dcatalina.home=/opt/tomcat9, -Djava.io.tmpdir=/opt/tomcat9/temp, org.apache.catalina.startup.Bootstrap, start]",process_executable_path="/usr/lib/jvm/java-17-openjdk-amd64/bin/java",process_pid="19597",process_runtime_description="Ubuntu OpenJDK 64-Bit Server VM 17.0.14+7-Ubuntu-124.04",process_runtime_name="OpenJDK Runtime Environment",process_runtime_version="17.0.14+7-Ubuntu-124.04",service_instance_id="6252459f-d44d-4213-bb04-805c2bb46e04",service_name="tomcat-service",telemetry_distro_name="opentelemetry-java-instrumentation",telemetry_distro_version="2.14.0",telemetry_sdk_language="java",telemetry_sdk_name="opentelemetry",telemetry_sdk_version="1.48.0"} 1
  ```

## springboot에서 opentelemetry-javaagent.jar 활용

### jpa project example

```sh
java -javaagent:./opentelemetry-javaagent.jar \
     -Dotel.service.name=my-service \
     -Dotel.traces.exporter=otlp \
     -Dotel.exporter.otlp.endpoint=http://localhost:4317 \
     -jar build/libs/app.jar
```

### mybatis project example

```sh
java -javaagent:./opentelemetry-javaagent.jar \
     -Dotel.service.name=my-mybatis-service \
     -Dotel.traces.exporter=otlp \
     -Dotel.exporter.otlp.endpoint=http://localhost:4318 \
     -Dotel.instrumentation.jdbc.enabled=true \
     -jar build/libs/mybatis-sample-0.0.1-SNAPSHOT.jar
```

## 번외: jboss 설정

```sh
export PATH="/Library/Java/JavaVirtualMachines/zulu-8.jdk/Contents/Home/bin:$PATH"

JAVA_OPTS="$JAVA_OPTS -javaagent:./opentelemetry-javaagent.jar"
JAVA_OPTS="$JAVA_OPTS -Dotel.service.name=jboss-app"
JAVA_OPTS="$JAVA_OPTS -Dotel.traces.exporter=otlp"
JAVA_OPTS="$JAVA_OPTS -Dotel.exporter.jaeger.endpoint=http://localhost:4318"


[출처]
- https://opentelemetry.io/docs/zero-code/java/agent/getting-started/
- https://prometheus.github.io/jmx_exporter/