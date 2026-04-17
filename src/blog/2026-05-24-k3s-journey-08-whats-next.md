---
layout: blog-post.njk
title: "k3s at Home, Part 8: What's Next — Authentication, Monitoring, Backups, and Drift Detection"
date: 2026-05-24
description: "The cluster is running 12 services. Here's what it still needs to be genuinely production-grade: SSO for unauthenticated admin UIs, a proper observability stack, automated backups, and a working infrastructure drift detector."
published: false
templateEngineOverride: md
tags:
  - blog
  - k3s
  - homelab
  - kubernetes
  - authelia
  - prometheus
  - observability
  - devops
  - series:k3s-journey
---

*This is Part 8 of the [k3s Journey](/tags/series:k3s-journey) series and the final installment of the current cluster build. [Part 7](/blog/2026-05-17-k3s-journey-07-applications/) covered the application layer.*

---

## Current State

After seven articles, the cluster is running:

| Service | URL | Auth |
|---------|-----|------|
| Forgejo | https://forgejo.linuxtampa.com | Built-in |
| Longhorn UI | https://longhorn.linuxtampa.com | **None** |
| Docker Registry | https://registry.linuxtampa.com | **None** |
| pgweb | https://pgweb.linuxtampa.com | **None** |
| Open WebUI | https://ai.linuxtampa.com | Built-in |
| Ollama API | https://ollama.linuxtampa.com | **None** |
| Qdrant | https://qdrant.linuxtampa.com/dashboard | **None** |
| apt-cacher-ng | http://apt-cache.linuxtampa.com:3142 | None (HTTP only) |
| PostgreSQL | Internal only | Password |
| Odoo ERP | https://odoo.linuxtampa.com | Built-in |
| WireGuard | https://wireguard.linuxtampa.com | Built-in |
| Home Assistant | https://homeassistant.linuxtampa.com | Built-in |

The services marked **None** are unauthenticated — anyone who can reach the LAN IP can access the Longhorn storage UI, the Docker registry, the database browser, and the vector database admin. This is acceptable on a private home LAN, but it's not something I'd accept in a production context, and it's not the posture I want for a homelab that runs real business tools.

---

## Priority 1: Cluster-Wide Authentication (Authelia)

[Authelia](https://www.authelia.com) is an open-source authentication and authorization server. It integrates with Traefik as a ForwardAuth middleware — Traefik checks with Authelia before forwarding any request to a protected service. If the user isn't authenticated, Authelia redirects them to a login page.

This is the right architecture for a homelab:

```
Browser → Traefik → Authelia (ForwardAuth check) → Service
                  ↕
              Session store (Redis)
              User store (LDAP or flat file)
```

**What this enables:**
- Single sign-on: log in once at `auth.linuxtampa.com`, access all protected services without re-authenticating
- 2FA/MFA: Authelia supports TOTP and WebAuthn
- Centralized audit log: all authentication events in one place
- Fine-grained ACLs: different access policies per service or user group

**Implementation plan:**

1. Deploy Authelia in the `authelia` namespace with Redis session storage and a YAML-based user database (simple for a single-user homelab)
2. Create a cluster-wide ForwardAuth middleware in the `traefik` namespace:

```yaml
# k8s-manifest/traefik-middlewares/authelia.yaml
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata:
  name: authelia
  namespace: traefik
spec:
  forwardAuth:
    address: http://authelia.authelia.svc.cluster.local:9091/api/verify?rd=https://auth.linuxtampa.com
    trustForwardHeader: true
    authResponseHeaders:
      - Remote-User
      - Remote-Groups
      - Remote-Name
      - Remote-Email
```

3. Add `traefik-authelia@kubernetescrd` to the middleware list on Longhorn, pgweb, Registry, and Qdrant ingresses
4. This also provides a good opportunity to consolidate the HTTPS redirect middleware (currently duplicated in every namespace) to a single shared `traefik-redirect-https@kubernetescrd`

**Alternatives:**

| | Authelia | Authentik | OAuth2 Proxy | Pomerium |
|--|---------|-----------|--------------|---------|
| Complexity | Low–Medium | Medium–High | Low | Medium |
| SSO support | Yes | Yes | Partial | Yes |
| LDAP integration | Yes | Yes | Via provider | Yes |
| Self-hosted | Yes | Yes | Yes | Yes |
| Built-in UI | Yes | Yes | No | Yes |

Authelia is the right choice here: simpler than Authentik, more capable than OAuth2 Proxy, and well-documented for Traefik integration.

**Cloud equivalents:** AWS Cognito, GCP Identity-Aware Proxy, Azure AD B2C, Okta, OpenShift OAuth. All managed, all involve per-user costs or complex configuration. Authelia costs nothing and runs in your cluster.

---

## Priority 2: Observability (Prometheus + Grafana + Loki)

Right now, I know the cluster is healthy because I can see pods running and services responding. I don't have:
- Historical resource utilization graphs (how much memory does Odoo actually use over 30 days?)
- Alerting (notification when a pod is crashlooping at 3am)
- Log aggregation (searching across all pods' logs from one place)

The standard self-hosted observability stack:

- **Prometheus** — time-series metrics collection. Scrapes metrics endpoints from all pods and cluster components.
- **Grafana** — dashboards and alerting. Queries Prometheus and Loki; provides the UI.
- **Loki** — log aggregation. Think Elasticsearch, but log-only and cheaper to run.
- **Alertmanager** — alert routing. Sends Slack/email/PagerDuty notifications when alert rules fire.

```bash
# Install via kube-prometheus-stack Helm chart (the standard approach)
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm install kube-prometheus-stack prometheus-community/kube-prometheus-stack \
  --namespace monitoring --create-namespace \
  --set grafana.ingress.enabled=true \
  --set grafana.ingress.hosts[0]=grafana.linuxtampa.com
```

**What I want from this:**
- Node-level dashboards: CPU, memory, disk I/O per node
- Longhorn volume metrics: replica status, IOPS, latency
- PostgreSQL dashboards: connections, query latency, lock waits
- Alert rule: any pod crashlooping → Slack notification

**Cloud equivalents:** CloudWatch (AWS), Cloud Monitoring (GCP), Azure Monitor. All included with their respective clouds. Self-hosted gives you the same visibility without vendor lock-in or data egress costs.

---

## Priority 3: Backup Automation

Currently, backups are manual. This is fine until it isn't.

**What needs to be backed up:**

| Data | Current state | Target |
|------|--------------|--------|
| PostgreSQL databases | Manual pg_dump | Nightly CronJob → GCS bucket |
| Longhorn volumes | Longhorn UI snapshot | Automated Longhorn backup to S3-compatible storage |
| Forgejo repositories | Manual tar of PVC | Nightly Forgejo backup playbook |
| Home Assistant config | Manual | Nightly ConfigMap sync + PVC backup |

**Longhorn backup target:**

Longhorn supports S3-compatible backup targets. MinIO (a self-hosted S3-compatible object store) is an option, but that adds another service to maintain. More pragmatic: use a GCS bucket with HMAC credentials (GCS supports the S3 API protocol).

```yaml
# Longhorn backup target configuration
apiVersion: longhorn.io/v1beta2
kind: Setting
metadata:
  name: backup-target
  namespace: longhorn-system
data:
  value: "s3://homelab-longhorn-backups@us-east-1/"
```

**PostgreSQL backup CronJob:**

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: postgres-backup
  namespace: postgres
spec:
  schedule: "0 2 * * *"  # 2am daily
  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - name: backup
              image: postgres:17
              command:
                - sh
                - -c
                - |
                  pg_dumpall -U postgres | gzip | \
                  gsutil cp - gs://homelab-backups/postgres/$(date +%Y%m%d).sql.gz
```

---

## Priority 4: OpenTofu Drift Detection

The `tofu-drift.yml` workflow has been broken since it was written. This is the workflow that runs weekly, checks whether the actual GCP Cloud DNS and infrastructure state matches the OpenTofu (Terraform) state, and posts results to Slack.

The blockers:

1. **`actions/checkout` incompatibility** — partially worked around with `git clone` + API token, but the token rotation process isn't automated
2. **Custom runner image not pushed** — the workflow assumes a runner image with `tofu`, `gcloud`, and `kubectl` pre-installed. `build-runner-image.yml` was written but never successfully run
3. **GCP credentials** — the workflow needs a GCP service account key as a Forgejo secret, with permissions to read Cloud DNS and Terraform state from GCS

When this is working, the weekly drift check gives you confidence that no one (including yourself, forgetting to commit a `terraform apply`) has made manual changes to infrastructure that aren't reflected in code.

This is the infrastructure equivalent of keeping tests green. It's important, and it's #1 on the backlog.

---

## The Hardware Upgrade That Would Help Most

Before any of the above software work, there's one hardware change with outsized impact: **Ethernet adapters for the three WiFi-connected worker nodes**.

kudu, tim-xps15, and samsung-17 are on WiFi (2.4GHz or 5GHz depending on the node). USB-C gigabit adapters cost $15–30 each. The benefits:

- **Longhorn replication** happens at gigabit speeds instead of WiFi speeds. Volume creation and replica rebuilds are dramatically faster.
- **Image pulls** from the Docker Registry (local, gigabit) stop being bottlenecked by the WiFi link between the node and the router.
- **Cluster stability** improves — WiFi can drop briefly during channel interference, causing Longhorn replicas to degrade and restart.

This is the kind of boring infrastructure investment that doesn't make for an interesting blog post, but matters more than almost anything else on this list.

---

## Reflections on the Build

Starting from a pile of old hardware and ending up with a cluster running 12 services — git, CI/CD, ERP, VPN, home automation, LLM inference, vector database, caching infrastructure — took about six weeks of evenings and weekends.

The things I'd do differently:

1. **Ethernet first.** Buy the USB-C adapters before starting.
2. **Longhorn disk paths in the plan.** Know where you're putting storage on each machine before you run a single playbook.
3. **One namespace per service from the start.** I had some services sharing namespaces early on. Cleaning that up was tedious.
4. **Don't skip the startup probe.** If an app takes more than 30 seconds to start, it needs a `startupProbe`. Default Kubernetes probes are not designed for slow-starting applications.

The things that worked well:

1. **Ansible for everything.** The cluster can be rebuilt from scratch by running one playbook. This is the right posture.
2. **Longhorn.** It mostly just works, and the UI makes it easy to see what's happening.
3. **k3s.** The right level of Kubernetes for a homelab. Full kubeadm would have been overkill.
4. **cert-manager + DNS-01.** Never think about certificates again. This is worth setting up on day one.

---

*That's the full series. The cluster will continue to evolve — authentication, monitoring, and better CI are all coming. Each significant addition will get its own post.*

*If you're building something similar or have questions about any of the choices here, the best place to find me is [LinkedIn](https://linkedin.com/in/timbaileyjones) or [tim@linuxtampa.com](mailto:tim@linuxtampa.com).*
