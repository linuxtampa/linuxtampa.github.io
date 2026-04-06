---
layout: blog-post.njk
title: "k3s at Home, Part 7: Data Layer and Applications — PostgreSQL, Odoo, WireGuard, and Home Assistant"
date: 2026-04-05
description: Running a shared PostgreSQL instance, an ERP system, a WireGuard VPN, and a smart home controller on k3s — with lessons about proxy mode, dedicated database users, CPU limits for crypto workloads, and hostNetwork for mDNS.
published: false
templateEngineOverride: md
tags:
  - blog
  - k3s
  - homelab
  - kubernetes
  - postgres
  - odoo
  - wireguard
  - home-assistant
  - devops
  - series:k3s-journey
---

*This is Part 7 of the [k3s Journey](/tags/series:k3s-journey) series. [Part 6](/blog/2026-04-05-k3s-journey-06-ai-stack/) covered the AI stack.*

---

## PostgreSQL: The Shared Data Layer

Rather than deploy a separate database for each application, the cluster runs a single PostgreSQL 17 instance that multiple services share. This simplifies operations: one place to back up, one place to apply schema migrations, one place to monitor query performance.

**Deployment:**

```yaml
# k8s-manifest/postgres/deployment.yaml (excerpt)
containers:
  - name: postgres
    image: postgres:17
    env:
      - name: POSTGRES_PASSWORD
        valueFrom:
          secretKeyRef:
            name: postgres-secret
            key: POSTGRES_PASSWORD
      - name: PGDATA
        value: /var/lib/postgresql/data/pgdata  # subdirectory within mount
      - name: POSTGRES_HOST_AUTH_METHOD
        value: scram-sha-256
    livenessProbe:
      exec:
        command: ["pg_isready", "-U", "postgres"]
      initialDelaySeconds: 30
      periodSeconds: 30
```

`PGDATA` is set to a subdirectory within the mounted PVC. This is a PostgreSQL requirement: if you mount a volume directly to `/var/lib/postgresql/data`, the presence of `lost+found` (from the ext4 filesystem) causes PostgreSQL to refuse to initialize, complaining the data directory isn't empty.

**pgweb** provides a browser-based database admin UI at `https://pgweb.linuxtampa.com`. It's a read-write interface, so it's only accessible on the private LAN.

> **[SCREENSHOT: pgweb browser showing database list and table viewer]**

**External access:**

Initially, the PostgreSQL service was `ClusterIP` only — accessible from within the cluster but not from outside. To allow external tools (Odoo connecting from a different namespace, pgweb, direct `psql` from my Mac), it needed either a `NodePort` or a `LoadBalancer` service.

```yaml
# NodePort for external psql access
apiVersion: v1
kind: Service
metadata:
  name: postgres-external
  namespace: postgres
spec:
  type: NodePort
  selector:
    app: postgres
  ports:
    - port: 5432
      targetPort: 5432
      nodePort: 30432
```

From your Mac: `psql -h 192.168.4.3 -p 30432 -U postgres`

**Cloud equivalents:**

| | PostgreSQL on k3s | AWS RDS | GCP Cloud SQL | Azure Database | Aurora |
|--|------------------|---------|----------------|---------------|--------|
| Cost | $0 (your hardware) | $0.02–0.48/hr | $0.01–0.36/hr | $0.02–0.48/hr | $0.10–1.00/hr |
| Managed backups | Manual | Automatic | Automatic | Automatic | Automatic |
| High availability | Manual (replicas) | Multi-AZ | HA replica | Zone-redundant | Built-in |
| Storage scaling | Manual (PVC resize) | Auto | Auto | Auto | Auto |
| Monitoring | Manual (Prometheus) | CloudWatch | Cloud Monitoring | Azure Monitor | CloudWatch |

---

## Odoo: ERP on Kubernetes

[Odoo 17](https://www.odoo.com) is an open-source ERP system with modules for accounting, inventory, CRM, project management, and more. Running it on k3s means the tools I use to run LinuxTampa, LLC live on the same infrastructure as everything else.

**The dedicated database user requirement:**

This burned me. Odoo's documentation says to connect as the `postgres` superuser, and many tutorials do exactly that. But Odoo's runtime code assumes it can create databases dynamically, and the way it checks for existing databases uses queries that fail or produce unexpected results when running as the `postgres` superuser under certain auth configurations.

The correct setup:

```bash
# Create a dedicated Odoo user with CREATEDB privilege
kubectl exec -it -n postgres deploy/postgres -- psql -U postgres -c \
  "CREATE USER odoo WITH PASSWORD 'yourpassword' CREATEDB;"
```

Then configure Odoo to connect as this user via environment variables:

```yaml
env:
  - name: HOST
    value: postgres.postgres.svc.cluster.local
  - name: USER
    value: odoo  # not postgres
  - name: PASSWORD
    valueFrom:
      secretKeyRef:
        name: odoo-secret
        key: POSTGRES_PASSWORD
```

**The `--proxy-mode` requirement:**

This is a gotcha that applies to any application that generates absolute URLs when running behind a reverse proxy.

Traefik terminates TLS. The application (Odoo, running on port 8069 inside the pod) receives plain HTTP from Traefik. Without additional configuration, Odoo generates redirect URLs using the scheme it sees: `http://`. If you log into Odoo over HTTPS and it redirects you to a new page, the redirect goes to `http://odoo.linuxtampa.com`, which your browser treats as insecure and may block.

Fix: pass `--proxy-mode` as a startup argument:

```yaml
containers:
  - name: odoo
    image: odoo:17
    args: ["--proxy-mode"]  # tells Odoo to trust X-Forwarded-Proto headers from Traefik
```

With `--proxy-mode`, Odoo reads the `X-Forwarded-Proto: https` header that Traefik adds, and generates HTTPS URLs. This same pattern applies to any application that generates absolute URLs behind a TLS-terminating reverse proxy.

> **[SCREENSHOT: Odoo ERP dashboard showing modules]**

---

## WireGuard VPN

[wg-easy](https://github.com/wg-easy/wg-easy) provides both a WireGuard VPN server and a web UI for managing clients. The use case: access the cluster's private services from anywhere, as if on the home LAN.

**Why WireGuard instead of OpenVPN:**

WireGuard uses modern cryptography (Curve25519, ChaCha20-Poly1305) and a much smaller codebase than OpenVPN. It's faster, uses less battery on mobile clients, and reconnects faster after network changes.

**Deployment:**

```yaml
spec:
  nodeSelector:
    kubernetes.io/hostname: poweredge  # wired, static IP
  initContainers:
    - name: sysctls
      image: busybox
      command:
        - /bin/sh
        - -c
        - |
          sysctl -w net.ipv4.ip_forward=1
          sysctl -w net.ipv4.conf.all.src_valid_mark=1
      securityContext:
        privileged: true
  containers:
    - name: wireguard
      image: ghcr.io/wg-easy/wg-easy:latest
      env:
        - name: WG_HOST
          value: home.linuxtampa.com  # external DNS record → home IP
        - name: WG_PORT
          value: "51820"
      resources:
        requests:
          cpu: 100m
        limits:
          cpu: 4000m  # WireGuard is CPU-intensive crypto — do not constrain
```

The init container sets kernel parameters for IP forwarding. WireGuard requires these to route traffic through the VPN interface — they can't be set from within a normal (non-privileged) container.

**Split tunneling:**

Rather than routing all traffic through the VPN (which would route my home internet traffic through my home connection and back out — pointless), the WireGuard client is configured for split tunneling: only traffic destined for the `192.168.4.0/24` home LAN subnet routes through the VPN.

```ini
# Client config (generated by wg-easy UI)
[Interface]
Address = 10.8.0.2/24
DNS = 192.168.4.1

[Peer]
Endpoint = home.linuxtampa.com:51820
AllowedIPs = 192.168.4.0/24  # only home LAN traffic through VPN
PersistentKeepalive = 25
```

> **[SCREENSHOT: wg-easy UI showing connected peers]**

**The CPU limit lesson:**

The first WireGuard deployment used a default CPU limit of `100m` (0.1 cores). WireGuard is a crypto-intensive protocol — encrypting and decrypting packets in software requires real CPU cycles. At 100m, VPN throughput was capped at around 2–3 Mbps. Bumping the CPU limit to 4000m (4 cores) raised throughput to the full gigabit capability of the underlying network.

This is a broader Kubernetes lesson: CPU limits on network-intensive or crypto-intensive workloads should be based on actual measured throughput, not guessed from memory consumption patterns.

**Cloud equivalents:**

| | wg-easy (self-hosted) | AWS Client VPN | GCP Cloud VPN | Azure VPN Gateway |
|--|----------------------|----------------|---------------|-------------------|
| Cost | $0 (self-hosted) | $0.10/hr + $0.05/connection/hr | $0.05/hr + data | $0.04–0.45/hr |
| Protocol | WireGuard | OpenVPN / IKEv2 | IPsec | IKEv2 / SSTP |
| Client support | macOS, iOS, Linux, Windows, Android | macOS, Windows, Linux | Any IPsec client | Windows, macOS |
| Speed | Fast (modern crypto) | Moderate | Moderate | Moderate |

---

## Home Assistant

[Home Assistant](https://www.home-assistant.io) is the home automation hub. It integrates with hundreds of devices and services — smart plugs, climate sensors, IP cameras, Alexa, Google Home — and provides a dashboard and automation engine.

**hostNetwork: true**

Home Assistant uses mDNS (multicast DNS, also known as Bonjour/Avahi) to discover LAN devices: Chromecast devices, Tuya local-control devices, HomeKit accessories. mDNS multicast packets don't cross namespace or network namespace boundaries in Kubernetes.

The fix: `hostNetwork: true`. The pod uses the host's network namespace directly, seeing the same broadcast domain as the physical node. This is a significant departure from Kubernetes's default network isolation model, but it's the standard approach for home automation software in containers.

```yaml
spec:
  hostNetwork: true
  dnsPolicy: ClusterFirstWithHostNet  # use cluster DNS for *.cluster.local, host DNS for everything else
  nodeSelector:
    kubernetes.io/hostname: tim-xps15  # pinned so host network is predictable
```

**The Alexa integration:**

Integrating Alexa with Home Assistant requires the Home Assistant Cloud (Nabu Casa subscription) or a custom Alexa skill. I went the custom skill route, which required:
1. A publicly reachable HTTPS endpoint (✓ — Traefik + cert-manager)
2. The correct `hostname` in the Home Assistant configuration

The issue: the Alexa skill configuration requires you to specify the webhook endpoint URL. I initially set up the service at `home-assistant.linuxtampa.com` (with a hyphen). The Alexa skill's OAuth and webhook configuration didn't like the hyphen in the discovery phase. Changing to `homeassistant.linuxtampa.com` (no hyphen) resolved the discovery failure.

This is a good reminder that DNS names are opaque strings to systems that have hardcoded URL-parsing logic. Always test with the exact hostname the integration will use.

> **[SCREENSHOT: Home Assistant dashboard showing devices and automations]**

---

## Problems & Lessons Learned

**PostgreSQL: PGDATA must be a subdirectory**

PostgreSQL refuses to initialize a data directory that contains any files. ext4 volumes always have a `lost+found` directory at the root. Set `PGDATA=/var/lib/postgresql/data/pgdata` (a subdirectory) to avoid this.

**Odoo: dedicated database user, `--proxy-mode`**

Don't use `postgres` superuser for Odoo. Create a dedicated `odoo` user with `CREATEDB`. Always pass `--proxy-mode` when running behind TLS-terminating reverse proxies — this applies to Rails apps, Django apps, Odoo, and any framework that generates absolute URLs.

**WireGuard: CPU limits and crypto throughput**

Don't guess CPU limits for crypto workloads. Measure throughput at a given limit and set limits accordingly. A 100m limit on WireGuard makes it nearly unusable.

**Home Assistant + hostNetwork**

Any container that needs to participate in LAN discovery protocols (mDNS, SSDP, LAN broadcast) needs `hostNetwork: true`. This is a known limitation of Kubernetes's network model. Pin the pod to a specific node so the "host network" is a known, predictable interface.

---

*Next up: [Part 8 — What's Next: Authentication, Monitoring, Backups, and Drift Detection](/blog/2026-04-05-k3s-journey-08-whats-next/), where we look at what the cluster still needs to be truly production-grade.*
