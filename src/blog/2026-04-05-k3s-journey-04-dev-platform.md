---
layout: blog-post.njk
title: "k3s at Home, Part 4: Self-Hosted Dev Platform — Forgejo, CI/CD, and the act_runner Saga"
date: 2026-04-05
description: Building a self-hosted git server and GitHub Actions-compatible CI/CD pipeline on k3s — including every mistake I made with act_runner, Docker-in-Docker, and overlayfs on Longhorn volumes.
published: false
templateEngineOverride: md
tags:
  - blog
  - k3s
  - homelab
  - kubernetes
  - forgejo
  - ci-cd
  - docker
  - devops
  - series:k3s-journey
---

*This is Part 4 of the [k3s Journey](/tags/series:k3s-journey) series. [Part 3](/blog/2026-04-05-k3s-journey-03-tls/) covered TLS with cert-manager and Traefik.*

---

## Why Self-Hosted Git?

If you're asking "why not just use GitHub?", the answer is: I do use GitHub, for public projects. But for homelab infrastructure, there are good reasons to self-host:

- **No rate limits.** CI runners pulling private images, running on your own hardware, don't hit GitHub's API limits.
- **Private infra, truly private.** No third party sees your IaC, your secrets, or your CI history.
- **Learning.** Understanding what a git server actually does is valuable when you're consulting on GitLab migrations or GitHub Actions complexity.
- **It runs on your cluster.** That's the point.

[Forgejo](https://forgejo.org) is a community fork of Gitea. It's a lightweight, self-hosted git server with a GitHub-like web UI, SSH access, pull requests, issue tracking, and — critically — **Forgejo Actions**: a GitHub Actions-compatible CI/CD engine.

---

## Forgejo Deployment

Forgejo uses SQLite as its database. That's a deliberate choice for simplicity: no PostgreSQL dependency, no connection pooling, no WAL configuration. For a homelab with one user and tens of repositories, SQLite is fine.

The deployment is pinned to specific nodes (not `poweredge`, which is reserved for heavier workloads like Longhorn manager and Ollama):

```yaml
# k8s-manifest/forgejo/deployment.yaml (excerpt)
spec:
  strategy:
    type: Recreate  # RWO PVC — can't RollingUpdate with ReadWriteOnce
  template:
    spec:
      affinity:
        nodeAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
            nodeSelectorTerms:
              - matchExpressions:
                  - key: kubernetes.io/hostname
                    operator: In
                    values: [tim-xps15, kudu]
      initContainers:
        - name: init-config
          image: busybox
          command:
            - sh
            - -c
            - |
              mkdir -p /data/gitea/conf
              chown -R 1000:1000 /data/gitea
              if [ ! -f /data/gitea/conf/app.ini ]; then
                cp /etc/forgejo-config/app.ini /data/gitea/conf/app.ini
              fi
```

The `Recreate` strategy is required because the PVC is `ReadWriteOnce` — only one pod can mount it at a time. A rolling update would try to start a new pod before terminating the old one, deadlocking on the volume attachment.

The init container copies the config from a ConfigMap on first boot only (the `[ -f ]` check prevents overwriting on restarts, which would wipe the auto-generated secrets Forgejo writes back to `app.ini` after first start).

> **[SCREENSHOT: Forgejo web UI — repository list]**

**Cloud equivalents:**

| | Forgejo | GitHub | GitLab CE | AWS CodeCommit | GCP Cloud Source Repositories |
|--|--------|--------|-----------|----------------|-------------------------------|
| Cost | $0 (self-hosted) | Free tier + paid | $0 (self-hosted) | $1/user/month | $0 (up to 5 users) |
| Actions/CI | Forgejo Actions | GitHub Actions | GitLab CI | CodePipeline | Cloud Build |
| API compatibility | GitHub-like | GitHub | GitLab | AWS | GCP |
| Self-hosted | Yes | No | Yes | No | No |
| SSH git | Yes | Yes | Yes | Yes | No |

---

## Forgejo Actions: GitHub Actions Compatible

Forgejo Actions uses the same YAML syntax as GitHub Actions. This matters: workflows written for GitHub can run on Forgejo with minimal changes. The reverse is also useful — skills you build here transfer directly.

A nightly cluster health check looks like this:

```yaml
# .forgejo/workflows/cluster-health.yml
name: Cluster Health Check
on:
  schedule:
    - cron: '0 6 * * *'  # 6am UTC daily
  workflow_dispatch:

jobs:
  health:
    runs-on: ubuntu-latest
    steps:
      - name: Check all nodes are Ready
        run: |
          kubectl get nodes
          kubectl get nodes | grep -v Ready && exit 1 || true

      - name: Check all pods are Running or Completed
        run: |
          kubectl get pods -A | grep -v -E 'Running|Completed|NAMESPACE'
```

The key difference from GitHub Actions: **`actions/checkout` doesn't work in Forgejo Actions**. That action makes calls to GitHub's API. From inside a Forgejo instance, those calls fail. If you need to clone the repo in a workflow, use `git clone` with a Forgejo API token:

```yaml
- name: Clone repo
  run: |
    git clone http://runner:${FORGEJO_TOKEN}@forgejo.forgejo.svc.cluster.local:3000/tim/homelab-seed.git
  env:
    FORGEJO_TOKEN: ${{ secrets.FORGEJO_API_TOKEN }}
```

---

## act_runner: The Full Story

This is the war story section. act_runner is the component that receives jobs from Forgejo Actions and executes them. Getting it right took several iterations.

### Iteration 1: Deployment — Broken by Design

The first attempt used a standard Kubernetes `Deployment`. It worked until the pod restarted.

Here's the problem: when act_runner starts, it registers itself with Forgejo and writes a `.runner` file containing its registration credentials. On restart, a `Deployment` pod gets a fresh container with an ephemeral filesystem. The `.runner` file is gone. The runner re-registers — but now Forgejo has *two* registrations for the same runner (the old one is still there). Over time, the runner list in Forgejo fills up with orphaned registrations.

**Fix: StatefulSet with a Longhorn PVC per replica.** The `.runner` file persists across restarts.

But there's a subtlety: the runner must write `.runner` to the PVC's mount point, not to the container's working directory. The startup script must `cd /data` before calling `forgejo-runner register`:

```bash
# Startup command in the act-runner container
cd /data  # ← critical: ensures .runner writes to the PVC
if [ ! -f /data/.runner ]; then
  forgejo-runner register \
    --no-interactive \
    --instance http://forgejo.forgejo.svc.cluster.local:3000 \
    --token "${FORGEJO_RUNNER_REGISTRATION_TOKEN}" \
    --name "k3s-runner-${HOSTNAME}" \
    --labels "ubuntu-latest:docker://catthehacker/ubuntu:act-22.04"
fi
exec forgejo-runner daemon --config /config/config.yaml
```

The init container also chowns `/data` to uid=1000 (the runner's UID) before the runner starts — otherwise the runner can't write to the PVC at all.

### Iteration 2: Docker-in-Docker

Forgejo Actions jobs specify `runs-on: ubuntu-latest`. That means the runner needs to spin up a Docker container to execute the job. But k3s nodes use `containerd` as their container runtime, not Docker. There's no Docker daemon available on the host.

**Fix: Docker-in-Docker (DinD) sidecar.** Each runner pod runs a `docker:dind` container alongside the act-runner container. The DinD container provides a Docker daemon on `localhost:2375`. act_runner connects to it via `DOCKER_HOST=tcp://localhost:2375`.

```yaml
containers:
  - name: docker-daemon
    image: docker:dind
    securityContext:
      privileged: true  # required for DinD
    env:
      - name: DOCKER_TLS_CERTDIR
        value: ""  # disable TLS — daemon only reachable on localhost
    volumeMounts:
      - name: docker-storage
        mountPath: /var/lib/docker
      - name: docker-daemon-config
        mountPath: /etc/docker
        readOnly: true

  - name: act-runner
    image: code.forgejo.org/forgejo/runner:6.3.1
    env:
      - name: DOCKER_HOST
        value: tcp://localhost:2375
```

The runner waits for the Docker daemon before registering:
```bash
until nc -z localhost 2375 2>/dev/null; do
  echo "Waiting for Docker daemon..."
  sleep 2
done
```

> **[SCREENSHOT: kubectl get pods -n forgejo showing act-runner pods with 2/2 containers Running]**

### Iteration 3: The overlay2 / ext4 Journal Errors

After getting DinD working, CI jobs would occasionally fail with ext4 journal errors in the DinD container logs. The root cause: DinD was using the `containerd-snapshotter` storage driver for its Docker layer storage, writing to a Longhorn PVC — which is a Longhorn block volume formatted as ext4.

OverlayFS writes on top of an ext4 filesystem on top of a virtual block device (the Longhorn PVC) over iSCSI causes the ext4 journal to log warnings about "overlapping extents" or similar. The filesystem works but logs noise, and under heavy I/O it can cause actual corruption.

**Fix: two changes together.**

1. Switch DinD's storage driver to `overlay2` (explicitly, in the Docker daemon config):

```json
{
  "storage-driver": "overlay2",
  "registry-mirrors": ["https://registry.linuxtampa.com"],
  "hosts": ["tcp://0.0.0.0:2375", "unix:///var/run/docker.sock"],
  "tls": false
}
```

2. Switch the `docker-storage` volume from a Longhorn PVC to `emptyDir`. This means Docker's layer cache doesn't persist across pod restarts — cold starts pull images from scratch (or from the registry mirror). But it eliminates the overlayfs-on-block-volume problem entirely.

```yaml
volumes:
  - name: docker-storage
    emptyDir: {}  # was: persistentVolumeClaim
```

The registry mirror (covered in Part 5) offsets the cold-start cost.

### Iteration 4: "No such image" Errors

After fixing storage, jobs were failing with `Error response from daemon: No such image: catthehacker/ubuntu:act-22.04`. The job container image wasn't being pulled before the job tried to use it.

**Fix: `force_pull: true` in the act_runner config:**

```yaml
# act-runner configmap
runner:
  fetch_timeout: 5
  fetch_interval: 2
  capacity: 2

container:
  network: "bridge"
  force_pull: true  # always pull the job image before creating the container
```

With `force_pull: true`, act_runner pulls the job container image before starting the job. The first pull hits Docker Hub (or the registry mirror). Subsequent pulls are fast from the mirror.

> **[SCREENSHOT: Forgejo Actions run showing green CI workflow]**

---

## The tofu-drift Workflow: Intentionally Broken

There's a weekly OpenTofu drift detection workflow in the repo — `tofu-drift.yml` — that's been broken for a while. It's designed to run `tofu plan` against the GCP infrastructure and report any drift between the Terraform state and actual cloud resources.

The problems are:
1. `actions/checkout` doesn't work (covered above)
2. The custom runner image with `tofu` pre-installed hasn't been pushed yet
3. GCP credentials need to be provisioned as a Forgejo secret

Rather than block everything on fixing this, I left it with a prominent comment: `# KNOWN BROKEN — #1 priority to fix next session`. This is the right call. A broken workflow with a clear comment is better than a missing workflow or a workflow that fails silently. The comment is a promise to fix it, not an apology.

---

## Cloud Comparison

| | Forgejo + act_runner | GitHub Actions | GitLab CE CI | AWS CodePipeline | Jenkins |
|--|---------------------|----------------|--------------|------------------|---------|
| Runner management | Self-hosted pods | Managed (or self-hosted) | Managed or self-hosted | Managed | Self-managed |
| DinD needed? | Yes (k3s/containerd) | No | No | No | Depends |
| Workflow syntax | GitHub Actions YAML | GitHub Actions YAML | GitLab YAML | AWS DSL | Jenkinsfile (Groovy) |
| Cost | $0 | ~$0 free tier | $0 | $1/pipeline/month | $0 |
| API compatibility | GitHub-like | GitHub | GitLab | AWS | None |

---

*Next up: [Part 5 — Caching Infrastructure: Docker Registry and apt-cacher-ng](/blog/2026-04-05-k3s-journey-05-caching/), where we speed up image pulls and package installs with local caching layers.*
