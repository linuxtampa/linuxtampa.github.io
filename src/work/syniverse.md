---
layout: base.njk
title: "Syniverse Technologies (2001–2016)"
description: Fifteen years across telecom infrastructure, real-time data systems, and DevOps — from C++ systems programming to pioneering CI/CD adoption at a major enterprise.
---

# Syniverse Technologies (2001–2016)

Syniverse was the backbone infrastructure provider for the global cellular industry — handling roaming, number portability, billing clearinghouses, and real-time messaging data for virtually every major carrier. Fifteen years here meant working at massive scale, with real-time systems that could not go down.

---

## Sr. Systems Engineer (2001–2010)

My first decade at Syniverse covered a broad range of telecom products: STARS (Streamliner Terminal Access Reporting System), CNAM-LIDB (Calling Name & Line Information Database), MDR (Mobile Data Roaming), AAA Broker, and the VisWise/PanWise/UniWise data visualization suite.

### In-Memory Carrier Lookup Server (C++)

One of the more satisfying problems I solved in this era was replacing a slow Oracle-backed lookup function in the MDR system. The input was a network node ID; the return value was the carrier record for the company handling that session.

The original implementation made a synchronous SQL query over TCP — expensive not because of network distance (everything was in the datacenter) but because Oracle is Oracle, and round-trips add up at scale.

The replacement was an IPC-based server process that held the entire dataset in memory using `mmap()`. The data file was millions of binary, fixed-length records, pre-sorted on the key field — so rather than parsing anything, the server called `bsearch()` directly on the memory-mapped region. Zero heap allocation, zero parsing, O(log n) lookup.

Hot reloading was handled by a background thread that polled the file's inode timestamp every 60 seconds. When the file changed: a new `mmap()` was established, in-flight threads picked up the new pointer on their next iteration, and the old mapping was released with `munmap()` 60 seconds later. Zero-downtime data refresh.

The result: lookup latency dropped from milliseconds to microseconds.

### High-Volume Oracle Data Loaders (C++)

For the VisWise product family, I wrote most of the high-volume Oracle data loaders. A recurring theme in this work was finding where the system was fighting the database unnecessarily — row-by-row inserts, suboptimal query plans, missed bulk-load APIs — and replacing them with approaches that worked *with* the database engine rather than against it.

### DHCP Load Testing Tool (C)

For a large in-carrier DHCP deployment within MDR, I wrote a load testing tool in plain C that simulated thousands of simultaneous DHCP sessions within a single process. Sometimes the right tool is still C.

### Tandem/Guardian Middleware (C)

For the Streamliner system, I wrote middleware for a Tandem/Guardian mainframe that enabled network access to SQL/MP (the Tandem database). This was one of those projects where the interesting challenge wasn't the algorithm — it was understanding an entirely different computing paradigm and bridging it to the rest of the stack.

---

## Technical Lead, VisProactive (VPA) (~2010–2014)

VisProactive was Syniverse's flagship real-time analytics platform for cellular carrier networks — ingesting and visualizing billions of rows of signaling and messaging data per day.

### 60x Data Loader Performance Improvement

The existing data loader was a shell script invoking Vertica's basic CLI tool once per file. Every invocation paid the full cost of process startup, TCP connection, authentication, and session setup — for every file.

I rewrote it as a persistent Java process using Vertica's streaming bulk loader API directly. Eliminating per-file setup overhead alone yielded a **20x throughput improvement**. Running three independent loader threads — each pulling from a shared work queue with deduplication to ensure no file was processed twice — tripled it further.

The resulting system processed **over one billion rows per day**, with headroom estimated beyond two billion.

### Resilient FTP/SFTP Distribution Client

VisProactive distributed terabytes of cellular messaging data in real-time, 24x7, via a multithreaded Java FTP/SFTP client. I added comprehensive failover logic covering: connection timeouts, connection refused errors, interrupted transfers, and out-of-disk conditions on target servers (detectable via write errors).

Rather than hardcoding thresholds, I implemented the failover conditions as a **Rhino (server-side JavaScript) script** embedded in the JVM. When operations staff wanted to tune thresholds — and they did, constantly — they edited the script themselves. No release cycle required. This was an explicit decision to get out of the business of trivial operational changes.

*(I did also advocate strongly for replacing unauthenticated FTP with SFTP. The response was that it was all internal networking, so "no one will get it." Famous last words.)*

### Frontend Modernization

Led the proof-of-concept work that drove a company-wide migration from legacy Adobe Flex and Oracle ADF applications to AngularJS. Also built **JobMonitorWebServer**, a custom jQuery application that let operators start/stop processing threads, change log levels, and tail log files in real-time — all from the browser.

### Platform & Infrastructure Work

- Led SCM migration from Telelogic Synergy to Subversion — the successful pilot led to adoption across all active Syniverse products
- Introduced Jenkins to Syniverse in 2012, replacing the existing "CI/CD system" — which was literally an Outlook email sent to an address like `build-manager@syniverse.com`, with build logs returned the same way. The bar was low; the resistance was not.
- Developed `vpacommons`, a shared library providing database connection pooling across ~20-25 credentials, with built-in performance logging and self-diagnosis of resource leaks (unclosed connections, statements, result sets)
- Implemented load balancing across Vertica backend databases using Octopus-LB
- Managed Java version migrations (1.6→1.7) and Subversion upgrades (1.6→1.7→1.8)
- Profiled and tuned systems with hundreds of JVMs for memory, GC, and connection efficiency

---

## Technical Lead, Consumer Insights (SCI) (~2014–2016)

SCI was a new business unit enabling non-telecom clients (banks, retailers) to reach their customers via mobile handsets using anonymized behavioral propensity models — delivering targeted offers when customers were physically present in relevant locations.

Key contributions:

- Built the Admin GUI in AngularJS/HTML5 with Node.js backend
- Established automated builds covering the UI (Gulp), backend (Maven), Hadoop/Hive/Impala/Oozie scripts, and — notably — **iOS and Android mobile builds**
- Implemented automated deploys via Ansible across the full stack
- Stood up Syniverse's **first Jenkins-based Mac Mini build server**, enabling automated iOS builds — a first for the company

[&larr; Back to Work](/work/)
