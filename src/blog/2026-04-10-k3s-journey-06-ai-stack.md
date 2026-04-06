---
layout: blog-post.njk
title: "k3s at Home, Part 6: The AI Stack — Ollama, Open WebUI, and Qdrant"
date: 2026-04-10
description: Running a local LLM inference server, a ChatGPT-like web interface, and a vector database on a bare-metal k3s cluster — with a GPU upgrade path baked into the manifests and lessons about memory limits and startup probes.
published: false
templateEngineOverride: md
tags:
  - blog
  - k3s
  - homelab
  - kubernetes
  - ollama
  - ai
  - llm
  - devops
  - series:k3s-journey
---

*This is Part 6 of the [k3s Journey](/tags/series:k3s-journey) series. [Part 5](/blog/2026-04-09-k3s-journey-05-caching/) covered caching infrastructure.*

---

## Why Run AI Locally?

Cloud AI APIs are convenient and fast — but they have costs that compound:

- **Privacy.** Queries to OpenAI, Anthropic, and Google leave your network. For anything involving internal data (code, infrastructure docs, customer info), this matters.
- **Cost at scale.** API pricing works great for ad-hoc queries. It gets expensive for high-volume or background tasks.
- **Latency control.** A local inference server on a wired gigabit LAN has no internet round-trip.
- **Offline capability.** The model is on your hardware. It works when your internet doesn't.

The tradeoff: local models on CPU-only hardware are much slower than GPU-backed cloud APIs, and the model quality at equivalent parameter counts is lower than what the major cloud providers offer. For many tasks (code review, summarization, RAG retrieval over private docs), this is fine.

The three components of this setup:
- **Ollama** — LLM inference server; manages model storage and HTTP API
- **Open WebUI** — ChatGPT-like web frontend for Ollama
- **Qdrant** — vector database for RAG (Retrieval-Augmented Generation)

---

## Ollama

[Ollama](https://ollama.ai) is a self-hosted LLM inference server. It handles model downloads, loading models into memory, and serving an HTTP API (`/api/chat`, `/api/embeddings`). Think of it as the "container runtime" for language models.

**Deployment highlights:**

```yaml
# k8s-manifest/ollama/deployment.yaml (excerpt)
spec:
  template:
    spec:
      # Pinned to poweredge: wired gigabit, most RAM in the cluster.
      # When a GPU node joins the cluster, update this selector to the GPU node.
      affinity:
        nodeAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
            nodeSelectorTerms:
              - matchExpressions:
                  - key: kubernetes.io/hostname
                    operator: In
                    values: ["poweredge"]
      containers:
        - name: ollama
          image: ollama/ollama:latest
          env:
            - name: OLLAMA_HOST
              value: "0.0.0.0"
          volumeMounts:
            - name: models
              mountPath: /root/.ollama  # 100Gi Longhorn PVC
          resources:
            requests:
              memory: 2Gi
              cpu: 500m
            limits:
              memory: 8Gi
              cpu: 4000m
            # --- Uncomment when NVIDIA GPU node is in the cluster ---
            # limits:
            #   nvidia.com/gpu: "1"
```

The GPU upgrade path is documented directly in the manifest as commented-out YAML. When a GPU node (likely a System76 Thelio with NVIDIA GPU) joins the cluster:

1. Label the node: `kubectl label node <thelio> gpu=true`
2. Install `nvidia-container-toolkit` on that node via Ansible
3. Uncomment the GPU limits and change the `nodeAffinity` to match `gpu=true`
4. `kubectl rollout restart deployment/ollama -n ollama`

Ollama auto-detects CUDA — no other changes needed.

**Pre-pulled models:**

```bash
# After deployment, pull models into the 100Gi PVC
kubectl exec -n ollama deploy/ollama -- ollama pull llama3.2:3b
kubectl exec -n ollama deploy/ollama -- ollama pull nomic-embed-text
```

`llama3.2:3b` is a capable general-purpose model at 3 billion parameters — runs on CPU in reasonable time. `nomic-embed-text` is an embedding model for generating vector representations (used with Qdrant for RAG).

> **[SCREENSHOT: curl -s https://ollama.linuxtampa.com/api/tags | jq '.models[].name' showing pulled models]**

**Cloud equivalents:**

| | Ollama (self-hosted) | AWS Bedrock | GCP Vertex AI | Azure OpenAI | OpenShift AI (RHOAI) |
|--|---------------------|-------------|---------------|--------------|---------------------|
| Model choice | Open-source (Llama, Mistral, etc.) | AWS-managed + Claude | Google Gemini + open models | OpenAI models | Open-source + partner |
| Cost | $0 (hardware you own) | Per-token pricing | Per-token pricing | Per-token pricing | Red Hat subscription |
| GPU required? | No (slower on CPU) | Managed | Managed | Managed | Yes for production |
| Privacy | Complete | AWS data retention policy | GCP data retention policy | Azure data retention policy | Self-managed |
| API compatibility | OpenAI-compatible (`/v1/chat/completions`) | AWS SDK | Google SDK | OpenAI SDK | REST |

---

## Open WebUI

[Open WebUI](https://openwebui.com) is a self-hosted web interface for Ollama that looks and works much like ChatGPT. It manages conversation history, supports multiple models, and can be extended with tools and plugins.

The key configuration challenge: **memory limits**.

The first deployment used a 512Mi memory limit, which seemed reasonable for a web UI. Within minutes of starting, the pod was OOMKilled. Python ML frameworks have deceptive startup profiles — they import heavy libraries at startup, and those imports consume memory before the application is "ready."

```yaml
resources:
  requests:
    memory: 512Mi
    cpu: 200m
  limits:
    memory: 2Gi  # was 512Mi — OOMKilled on startup
    cpu: 1000m
```

**Startup probe:**

Open WebUI's Python startup is slow — it takes 60–90 seconds before the application is ready to serve requests. Default Kubernetes `readinessProbe` configurations fail before the app is ready, causing the pod to be marked Unready and restarted in a crash loop.

Fix: use a `startupProbe` with a long enough window:

```yaml
startupProbe:
  httpGet:
    path: /
    port: 8080
  failureThreshold: 30    # 30 failures × 10 seconds = 5 minute window
  periodSeconds: 10
readinessProbe:
  httpGet:
    path: /
    port: 8080
  initialDelaySeconds: 0
  periodSeconds: 10
```

The `startupProbe` takes over during startup. Once it succeeds, the `readinessProbe` takes over for ongoing health checking. This is the right pattern for any slow-starting application.

> **[SCREENSHOT: Open WebUI chat interface with model selector]**

---

## Qdrant

[Qdrant](https://qdrant.tech) is a vector database — purpose-built for storing and querying dense vector embeddings. The use case: you generate embeddings for documents (using `nomic-embed-text` via Ollama), store them in Qdrant, and then at query time you embed the question and find the most semantically similar documents. This is the core of RAG (Retrieval-Augmented Generation).

The deployment is straightforward — Qdrant is a well-packaged application with no surprising runtime requirements:

```yaml
resources:
  requests:
    memory: 256Mi
    cpu: 100m
  limits:
    memory: 1Gi
    cpu: 1000m
```

Backed by a 10Gi Longhorn PVC for collection storage.

The planned use: a RAG project over *Project Hail Mary* (Andy Weir's novel) as a learning exercise — ingest the text, build a query interface using Qdrant + Ollama + LlamaIndex. This is a future project; Qdrant is deployed and ready.

> **[SCREENSHOT: Qdrant dashboard at https://qdrant.linuxtampa.com/dashboard]**

**Cloud equivalents:**

| | Qdrant (self-hosted) | Pinecone | AWS OpenSearch (KNN) | GCP Vertex AI Vector Search | Weaviate |
|--|---------------------|----------|---------------------|------------------------------|---------|
| Cost | $0 (self-hosted) | Free tier + $0.096/unit/hr | $0.10/GB/hr | $0.06/GB/hr | Self-hosted or managed |
| Vector dimensions | Up to 65,536 | Up to 20,000 | Up to 16,000 | Up to 2,048 | Up to 65,536 |
| Hybrid search | Yes | Yes | Yes | Yes | Yes |
| Self-hosted | Yes | No | Partial | No | Yes |

---

## Problems & Lessons Learned

**OOMKilled at 512Mi**

Already covered above. The general lesson: Python ML applications should not be given the same memory budgets as Go or Rust web servers. Start with 2Gi and tune down if actual usage is lower.

**Slow startup + readinessProbe crash loops**

The default readiness probe fires too early for Python ML apps. Always add a `startupProbe` with a generous window for any application that takes more than 30 seconds to initialize.

**Node pinning is required for Ollama**

Without pinning Ollama to the PowerEdge, the Kubernetes scheduler may place it on a laptop worker. Laptops have less RAM, slower CPUs, and WiFi connections. Ollama loading a 3B parameter model requires several GB of RAM — WiFi-connected laptops will hit memory pressure and the model load will be slow. Always pin inference workloads to your best node.

---

*Next up: [Part 7 — Data Layer and Applications: PostgreSQL, Odoo, WireGuard, and Home Assistant](/blog/2026-04-11-k3s-journey-07-applications/), where we deploy a shared database, a full ERP system, a VPN, and a smart home controller.*
