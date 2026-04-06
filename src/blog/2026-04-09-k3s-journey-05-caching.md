---
layout: blog-post.njk
title: "k3s at Home, Part 5: Caching Infrastructure — Docker Registry and apt-cacher-ng"
date: 2026-04-09
description: How a local Docker pull-through cache and an apt package cache dramatically reduce bandwidth consumption, speed up CI builds, and avoid Docker Hub rate limits — with a protocol lesson about why Traefik can't proxy apt requests.
published: false
templateEngineOverride: md
tags:
  - blog
  - k3s
  - homelab
  - kubernetes
  - docker
  - caching
  - devops
  - series:k3s-journey
---

*This is Part 5 of the [k3s Journey](/tags/series:k3s-journey) series. [Part 4](/blog/2026-04-08-k3s-journey-04-dev-platform/) covered the self-hosted dev platform.*

---

## Why Caching Matters in a Homelab

Cloud environments can lean on fast managed registries and CDN-backed package mirrors without much thought. In a homelab, every image pull and package download hits your home internet connection.

The consequences:
- Docker Hub rate-limits unauthenticated pulls to 100/6 hours per IP. CI runners on the same home IP will hit this ceiling.
- `ubuntu:latest` is ~30MB compressed. `catthehacker/ubuntu:act-22.04` (the CI job image) is ~1.5GB. Pulling that fresh on every CI run is slow and wasteful.
- Package installs during CI (`apt install git curl jq`) pull from Ubuntu mirrors. Every run, every package, from the internet.

Two services solve this: a **Docker Registry pull-through cache** and **apt-cacher-ng**.

---

## Docker Registry: Pull-Through Cache

[Docker Registry v2](https://distribution.github.io/distribution/) can operate as a pull-through proxy for Docker Hub. When a container runtime (or DinD daemon) requests an image, the registry checks its local cache first. Cache miss: fetch from Docker Hub and store locally. Cache hit: serve from the Longhorn PVC at local LAN speeds.

**Deployment:**

```yaml
# k8s-manifest/registry/deployment.yaml (excerpt)
spec:
  template:
    spec:
      affinity:
        nodeAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
            nodeSelectorTerms:
              - matchExpressions:
                  - key: kubernetes.io/hostname
                    operator: In
                    values: ["poweredge"]  # wired gigabit for fast upstream pulls
      containers:
        - name: registry
          image: registry:2
          volumeMounts:
            - name: config
              mountPath: /etc/docker/registry
            - name: data
              mountPath: /var/lib/registry  # 50Gi Longhorn PVC
```

The registry config (in a ConfigMap) enables proxy mode:

```yaml
proxy:
  remoteurl: https://registry-1.docker.io
  username: ""
  password: ""
```

**Configuring DinD to use the mirror:**

In the Docker daemon config for each act_runner pod's DinD sidecar:

```json
{
  "registry-mirrors": ["https://registry.linuxtampa.com"],
  "storage-driver": "overlay2",
  "hosts": ["tcp://0.0.0.0:2375", "unix:///var/run/docker.sock"],
  "tls": false
}
```

With `registry-mirrors` set, DinD checks the local registry before hitting Docker Hub. After the first pull of `catthehacker/ubuntu:act-22.04`, every subsequent CI run gets it from the LAN.

> **[SCREENSHOT: curl output of https://registry.linuxtampa.com/v2/_catalog showing cached images]**

**Inspecting the cache:**

```bash
# List all cached repositories
curl -s https://registry.linuxtampa.com/v2/_catalog | jq .

# List tags for a specific image
curl -s https://registry.linuxtampa.com/v2/library/ubuntu/tags/list | jq .
```

**Cloud equivalents:**

| | Docker Registry (self-hosted) | ECR pull-through cache | GCP Artifact Registry | Nexus / Artifactory |
|--|-------------------------------|------------------------|----------------------|---------------------|
| Docker Hub proxy | Yes | Yes | Yes | Yes |
| Cost | $0 (storage only) | $0.10/GB/mo | $0.10/GB/mo | License or self-hosted |
| Rate limit bypass | Yes | Yes | Yes | Yes |
| Multi-format | Docker only | Docker + OCI | Docker + Helm + npm | Many |
| Complexity | Low | Low | Low | High |

---

## apt-cacher-ng: Package Cache

[apt-cacher-ng](https://www.unix-ag.uni-kl.de/~bloch/acng/) is a caching proxy for Debian/Ubuntu package downloads. It sits between your apt clients and Ubuntu mirrors. First download of a package fetches from the internet and stores locally. Subsequent downloads — from any node on your LAN — serve from the local cache.

For a cluster where CI jobs frequently run `apt install`, this is a significant speedup. It also means offline-ish operation: packages you've already downloaded are available even if your internet connection is flaky.

**Deployment:**

```yaml
# k8s-manifest/apt-cache/deployment.yaml (excerpt)
spec:
  template:
    spec:
      affinity:
        nodeAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
            nodeSelectorTerms:
              - matchExpressions:
                  - key: kubernetes.io/hostname
                    operator: In
                    values: ["poweredge"]
      initContainers:
        - name: fix-permissions
          image: busybox
          command: ["sh", "-c", "chown -R 101:65534 /var/cache/apt-cacher-ng"]
          volumeMounts:
            - name: cache
              mountPath: /var/cache/apt-cacher-ng
      containers:
        - name: apt-cacher-ng
          image: sameersbn/apt-cacher-ng:latest
          ports:
            - containerPort: 3142
```

**Configuring nodes to use the cache:**

Each Ubuntu node gets a file `/etc/apt/apt.conf.d/01proxy`:

```
Acquire::http::Proxy "http://apt-cache.linuxtampa.com:3142";
```

This is deployed via Ansible to all cluster nodes:

```yaml
- name: Configure apt proxy on all Ubuntu nodes
  copy:
    content: 'Acquire::http::Proxy "http://apt-cache.linuxtampa.com:3142";\n'
    dest: /etc/apt/apt.conf.d/01proxy
    mode: "0644"
  when: ansible_facts['os_family'] == "Debian"
```

> **[SCREENSHOT: apt-cacher-ng report page at http://apt-cache.linuxtampa.com:3142/acng-report.html showing hit rate and cached packages]**

---

## The LoadBalancer vs. Traefik Protocol Problem

Here's the most interesting architectural lesson from this setup.

My first attempt was to expose apt-cacher-ng through Traefik, like every other service. The result: apt clients couldn't connect through it. The error was obscure — apt would get a 400 or 500 error trying to proxy through Traefik.

The problem is a protocol-level incompatibility. When apt uses a proxy, it sends **absolute-URI requests**:

```
GET http://archive.ubuntu.com/ubuntu/dists/focal/InRelease HTTP/1.1
```

This is HTTP/1.1 proxy syntax. Traefik is a **reverse proxy**, not a **forward proxy**. It expects requests in origin-form:

```
GET /ubuntu/dists/focal/InRelease HTTP/1.1
Host: archive.ubuntu.com
```

Traefik rejects absolute-URI requests with a 400. This isn't a configuration issue — it's by design. Traefik doesn't implement the HTTP CONNECT or absolute-URI forwarding that forward proxies use.

**Fix:** expose apt-cacher-ng via a `LoadBalancer` service instead. k3s's `klipper-lb` binds port 3142 directly on all cluster nodes, bypassing Traefik entirely:

```yaml
# k8s-manifest/apt-cache/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: apt-cache
  namespace: apt-cache
spec:
  type: LoadBalancer
  selector:
    app: apt-cache
  ports:
    - port: 3142
      targetPort: 3142
```

The Traefik `Ingress` is still used for the web UI (`/acng-report.html`), since that's a normal HTTP request. But apt proxy traffic goes through the LoadBalancer directly.

---

## Problems & Lessons Learned

**The init container chown pattern**

Both the Docker Registry and apt-cacher-ng require specific UID ownership on their PVC mount points:
- apt-cacher-ng runs as uid=101, gid=65534 (nobody)
- Registry doesn't require chown, but the pattern is consistent

Without the chown, the container starts and immediately fails with "read-only filesystem" or "permission denied" on first write. The init container solution:

```yaml
initContainers:
  - name: fix-permissions
    image: busybox
    command: ["sh", "-c", "chown -R 101:65534 /var/cache/apt-cacher-ng"]
    volumeMounts:
      - name: cache
        mountPath: /var/cache/apt-cacher-ng
```

This pattern — init container runs as root to fix ownership, then main container starts as its required UID — comes up repeatedly in Kubernetes deployments of Linux services that predate containers.

**DEP-11 icon archive suppression**

apt-cacher-ng by default tries to cache Debian/Ubuntu DEP-11 icon archives. These are large binary files used for desktop GUI package management. On server nodes, they're useless. Add this to the apt-cacher-ng configuration to suppress them:

```
PassThroughPattern: .*AppStream.*|.*DEP-11.*|.*icons.*\.tar\.gz
```

Without this, the cache fills up with icon archives from every Ubuntu release, wasting storage.

**The overlayfs lesson revisited**

The act_runner docker-storage volume was originally a Longhorn PVC. The ext4 journal errors (described in Part 4) came from writing overlayfs layers to a block-backed PVC over iSCSI. Moving to `emptyDir` fixed it, and the registry mirror makes the performance tradeoff acceptable. The rule: don't put overlayfs (DinD, container runtimes) on top of a Longhorn block volume.

---

*Next up: [Part 6 — The AI Stack: Ollama, Open WebUI, and Qdrant](/blog/2026-04-10-k3s-journey-06-ai-stack/), where we run a local LLM inference server and vector database on commodity hardware.*
