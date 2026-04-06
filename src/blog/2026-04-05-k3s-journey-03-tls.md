---
layout: blog-post.njk
title: "k3s at Home, Part 3: TLS Everywhere with cert-manager and Traefik"
date: 2026-04-07
description: How to get automatic wildcard HTTPS certificates for every homelab service using cert-manager, Let's Encrypt DNS-01 challenges, and GCP Cloud DNS — without exposing your cluster to the internet.
published: false
templateEngineOverride: md
tags:
  - blog
  - k3s
  - homelab
  - kubernetes
  - traefik
  - cert-manager
  - tls
  - devops
  - series:k3s-journey
---

*This is Part 3 of the [k3s Journey](/tags/series:k3s-journey) series. [Part 2](/blog/2026-04-05-k3s-journey-02-longhorn/) covered Longhorn persistent storage.*

---

## The Goal: Real TLS, Not Self-Signed Certs

Every service in this cluster gets a real, browser-trusted HTTPS certificate. Not self-signed. Not `mkcert`. Real Let's Encrypt certificates, auto-renewed, with zero manual intervention.

The trick: DNS-01 challenge validation. Let's Encrypt needs to verify you own the domain before issuing a cert. With HTTP-01 challenges (the most common approach), your server needs to be publicly reachable on port 80. My homelab nodes are on a private LAN — they're not reachable from the internet.

DNS-01 challenges work differently: instead of serving a file over HTTP, you create a TXT record in your DNS zone. Let's Encrypt checks the DNS record. Your servers never need to be publicly reachable. This is the right approach for homelab clusters behind a NAT.

Since the cluster's DNS is managed by GCP Cloud DNS, cert-manager uses the GCP Cloud DNS API to create and remove the validation TXT records automatically.

---

## Traefik: Already There

k3s bundles [Traefik](https://traefik.io) as its default ingress controller. You don't install it — it's running from day one in the `kube-system` namespace.

Traefik supports both standard Kubernetes `Ingress` resources and its own CRD-based `IngressRoute`. I use standard `Ingress` objects for simplicity (cert-manager integrates with them directly), plus Traefik `Middleware` CRDs for the HTTPS redirect.

The service load balancer (`klipper-lb`) binds Traefik to ports 80 and 443 on all labeled cluster nodes. Incoming traffic hits any node IP and gets forwarded to Traefik.

**Cloud equivalents:**

| | Traefik (k3s built-in) | AWS ALB/NLB | GCP Cloud Load Balancing | Azure App Gateway | OpenShift Router |
|--|------------------------|-------------|--------------------------|-------------------|-----------------|
| TLS termination | Yes | Yes | Yes | Yes | Yes |
| Automatic cert provisioning | Via cert-manager | Via ACM | Via managed certs | Via Key Vault | Via cert-manager |
| Cost | $0 | $0.008/hr + LCU | $0.025/hr + data | $0.25/hr | $0 (included) |
| Config language | Ingress + CRDs | Annotations | Annotations | ARM/Bicep | Route CRD |

---

## cert-manager Installation

cert-manager v1.14.4 installs from the official manifest:

```yaml
# From ansible/install_cert_manager.yml
- name: Install cert-manager
  command:
    cmd: kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.14.4/cert-manager.yaml

- name: Wait for cert-manager webhook to be ready
  command:
    cmd: kubectl wait --for=condition=available --timeout=120s deployment/cert-manager-webhook -n cert-manager
```

The Ansible playbook also uploads a GCP service account JSON key as a Kubernetes Secret. This is the credential cert-manager uses to create DNS TXT records in GCP Cloud DNS:

```yaml
- name: Create GCP DNS credentials secret
  command:
    cmd: >
      kubectl create secret generic gcp-dns-credentials
      --from-file=credentials.json={{ gcp_dns_sa_key_path }}
      -n cert-manager
      --dry-run=client -o yaml
  register: secret_yaml

- name: Apply GCP DNS credentials secret
  command:
    cmd: kubectl apply -f -
    stdin: "{{ secret_yaml.stdout }}"
```

---

## The ClusterIssuer

The `ClusterIssuer` tells cert-manager which ACME server to use and how to fulfill challenges:

```yaml
# k8s-manifest/cert-manager/cluster-issuer.yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: tim@linuxtampa.com
    privateKeySecretRef:
      name: letsencrypt-prod-key
    solvers:
      - dns01:
          cloudDNS:
            project: timbaileyjones-gcloud-assets
            serviceAccountSecretRef:
              name: gcp-dns-credentials
              key: credentials.json
```

`ClusterIssuer` (vs. `Issuer`) is cluster-scoped — it can issue certificates for any namespace. For a homelab with services spread across many namespaces, this is much simpler than maintaining a per-namespace `Issuer`.

---

## Per-Service: Ingress + Certificate + Middleware

Every service follows the same three-resource pattern. Here's the Longhorn UI as a concrete example:

**Ingress** — tells Traefik how to route traffic and triggers cert-manager to issue a certificate:

```yaml
# k8s-manifest/longhorn/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: longhorn
  namespace: longhorn-system
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    traefik.ingress.kubernetes.io/router.middlewares: longhorn-system-redirect-https@kubernetescrd
spec:
  tls:
    - hosts:
        - longhorn.linuxtampa.com
      secretName: longhorn-tls
  rules:
    - host: longhorn.linuxtampa.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: longhorn-frontend
                port:
                  number: 80
```

The `cert-manager.io/cluster-issuer` annotation is the trigger: when cert-manager sees this annotation, it requests a certificate for `longhorn.linuxtampa.com` and stores it in the `longhorn-tls` Secret. Traefik reads the Secret for TLS termination.

**Middleware** — redirects HTTP to HTTPS:

```yaml
# k8s-manifest/longhorn/middleware.yaml
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata:
  name: redirect-https
  namespace: longhorn-system
spec:
  redirectScheme:
    scheme: https
    permanent: true
```

The Traefik middleware reference in the Ingress annotation uses the format `<namespace>-<name>@kubernetescrd`. So `longhorn-system-redirect-https@kubernetescrd` references the `redirect-https` Middleware in the `longhorn-system` namespace.

> **[SCREENSHOT: kubectl get certificates -A output showing all certs in Ready=True state]**

> **[SCREENSHOT: Browser padlock on https://longhorn.linuxtampa.com]**

---

## The DRY Problem

There's a known smell in this setup: every service has its own copy of the same `redirect-https` middleware. Twelve services, twelve identical middleware files. It works, but it violates DRY and means updating the redirect behavior requires touching twelve files.

The right fix is a shared middleware in the `traefik` namespace:

```yaml
# Future: k8s-manifest/traefik-middlewares/redirect-https.yaml
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata:
  name: redirect-https
  namespace: traefik
spec:
  redirectScheme:
    scheme: https
    permanent: true
```

Then each service references `traefik-redirect-https@kubernetescrd` instead of its own local copy. This is on the backlog — it's low risk, low priority, and a clean refactor when the time comes.

---

## Problems & Lessons Learned

**"Add HTTP→HTTPS redirect for Forgejo ingress"**

When I first deployed Forgejo, I forgot to add the middleware annotation to the Ingress. HTTP requests to `http://forgejo.linuxtampa.com` got a 404 instead of a redirect. Since most services redirect internally (browsers remember HTTPS after the first visit), this was easy to miss. I now include the middleware as part of the template for every new service.

**DNS propagation delays**

Let's Encrypt DNS-01 validation requires the TXT record cert-manager creates to propagate to the public DNS resolvers Let's Encrypt uses. GCP Cloud DNS propagates quickly (usually under 60 seconds), but if a certificate is stuck in `Pending` state longer than expected, check cert-manager's logs:

```bash
kubectl logs -n cert-manager deploy/cert-manager | tail -50
kubectl describe certificaterequest <name> -n <namespace>
```

Usually it's either a credential issue (the service account doesn't have Cloud DNS admin) or the TXT record hasn't propagated yet.

---

## Verifying Certificates

```bash
# All certificates across all namespaces
kubectl get certificates -A
# NAMESPACE         NAME           READY   SECRET         AGE
# longhorn-system   longhorn-tls   True    longhorn-tls   5d
# forgejo           forgejo-tls    True    forgejo-tls    4d
# ...

# Inspect a specific certificate
kubectl describe certificate longhorn-tls -n longhorn-system
```

`READY: True` means the certificate was issued successfully and is stored in the named Secret.

---

*Next up: [Part 4 — Self-Hosted Dev Platform: Forgejo, CI/CD, and the act_runner Saga](/blog/2026-04-05-k3s-journey-04-dev-platform/), where we deploy a self-hosted git server and learn several hard lessons about running CI runners in Kubernetes.*
