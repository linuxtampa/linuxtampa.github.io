---
layout: blog-post.njk
title: "k3s at Home, Part 1: Hardware, Ansible, and Bootstrapping a Four-Node Cluster"
date: 2026-04-05
description: How I turned a Dell PowerEdge tower and three old laptops into a production-grade Kubernetes cluster using k3s and Ansible — including the mistakes that made me say things I can't print here.
published: false
templateEngineOverride: md
tags:
  - blog
  - k3s
  - homelab
  - kubernetes
  - ansible
  - devops
  - series:k3s-journey
---

*This is Part 1 of the [k3s Journey](/tags/series:k3s-journey) series, where I walk through building a full-featured homelab Kubernetes cluster from bare metal to running workloads.*

---

## Why Build This?

I've spent most of my career in the cloud. AWS, GCP, Azure — I know how to provision a cluster. Click a button, wait ten minutes, pay $150/month. But somewhere along the way I realized I was cargo-culting. I knew *how* to use managed Kubernetes. I didn't deeply understand what it was actually *doing*.

There's also a practical motivation: I'm a 1099 consultant running my own LLC now. Paying cloud rates for personal infrastructure doesn't make sense when I have decent hardware sitting in a corner. And the learning-to-cost ratio of bare metal is hard to beat.

So: a homelab k3s cluster. Let me show you exactly how I built it.

---

## The Hardware

> **[SCREENSHOT: Photo of the homelab hardware — PowerEdge tower and laptops on a shelf]**

**Primary node — Dell PowerEdge T320**

This is the anchor of the cluster. It's a refurbished server-class tower I picked up for a few hundred dollars. Key specs:
- Lots of RAM (well over what any of the laptops have)
- Multiple spinning disks — the HGST 4TB is dedicated to Longhorn storage
- Wired gigabit ethernet — this matters a lot for Longhorn replication and image pulls

**Worker nodes — three older Linux laptops**

| Hostname | Inventory name | Notes |
|----------|---------------|-------|
| `dellxps15` / `tim-xps15` | `k3s_worker_1` | Dell XPS 15 — solid machine, wired via USB-C dongle |
| `kudu` | `k3s_worker_2` | Kudu (System76) — on WiFi 5GHz |
| `samsung17` / `samsung-17` | `k3s_worker_3` | Samsung 17" — on WiFi |

All workers are running Ubuntu. The PowerEdge is also Ubuntu. (I had an Arch node in an earlier iteration — more on why that added friction.)

**One thing I'd do differently:** Ethernet adapters for all three laptops. WiFi is fine for most things, but Longhorn volume replication and Docker image pulls noticeably slow down when a node is on WiFi. USB-C gigabit adapters are cheap. Buy them upfront.

---

## Why k3s?

Full Kubernetes (`kubeadm`) is the right choice if you need full control, HA etcd, or specific CNI configuration. For a homelab, it's overkill and has a high operational surface area.

k3s is a CNCF-certified Kubernetes distribution that:
- Ships as a single binary
- Replaces etcd with SQLite (or an embedded etcd if you want HA)
- Bundles Traefik as an ingress controller
- Bundles a service load balancer (`klipper-lb`)
- Installs in under two minutes on modest hardware

The tradeoff is reduced configurability at the control plane level — but for a homelab running real workloads, k3s hits the sweet spot.

**Cloud equivalent:** EKS, GKE, AKS all give you a managed control plane. k3s gives you an *owned* control plane for free. You gain visibility and lose the SLA.

| | EKS/GKE/AKS | k3s |
|--|-------------|-----|
| Control plane cost | $70–150/month | $0 |
| Control plane maintenance | Managed | You |
| Time to first node | 10–15 min | 2 min |
| HA | Built-in | Manual (embedded etcd) |
| CNI | Configurable | Flannel (default) |
| Ingress | Bring your own | Traefik (included) |

---

## The Ansible Structure

I automate everything with Ansible. This isn't just for repeatability — it's documentation. If I can't describe a cluster operation as an Ansible play, I don't fully understand it.

**Inventory:**

```ini
# ansible/inventory.ini
[k3s_primary]
primary ansible_host=192.168.4.3 k3s_alt_hostname=poweredge longhorn_data_path=/hgst4tb/longhorn

[k3s_workers]
k3s_worker_1 ansible_host=192.168.4.4 k3s_alt_hostname=dellxps15 longhorn_k8s_node_name=tim-xps15 longhorn_data_path=/home/longhorn
k3s_worker_2 ansible_host=192.168.4.5 k3s_alt_hostname=kudu longhorn_data_path=/data2/longhorn
k3s_worker_3 ansible_host=192.168.4.6 k3s_alt_hostname=samsung17 longhorn_k8s_node_name=samsung-17 longhorn_data_path=/var/lib/longhorn

[k3s_cluster:children]
k3s_primary
k3s_workers
```

A few things worth noting:
- `longhorn_data_path` is per-host because every machine has a different disk layout. The PowerEdge uses a dedicated HGST drive; the laptops use whatever large partition was available.
- `longhorn_k8s_node_name` is only needed for nodes where the Kubernetes node name differs from the Ansible inventory hostname. k3s derives node names from the OS hostname, which isn't always predictable.
- All other shared variables live in `ansible/group_vars/k3s_cluster.yml`: SSH key path, `cluster_user: tim`, become method.

---

## Phase 1: SSH Key Distribution

Before anything else, every node needs to be able to SSH to every other node as `tim`. This is infrastructure — Ansible needs it for `delegate_to`, Longhorn needs it for health checks, and it's just table stakes for a real cluster.

The Ansible play:
1. Generates an RSA key on each node if one doesn't exist
2. Reads each node's public key into a fact
3. Appends every node's key to every other node's `authorized_keys`

```yaml
# From ansible/install_k3s.yml
- name: Gather each node's SSH public key for distribution
  hosts: k3s_cluster
  tasks:
    - name: Create SSH key (rsa, no passphrase) if missing
      command:
        argv: [ssh-keygen, -t, rsa, -N, "", -f, "/home/{{ cluster_user }}/.ssh/id_rsa"]
      args:
        creates: "/home/{{ cluster_user }}/.ssh/id_rsa"
      become_user: "{{ cluster_user }}"

    - name: Read this node's SSH public key
      slurp:
        src: "/home/{{ cluster_user }}/.ssh/id_rsa.pub"
      register: slurped_pubkey

    - name: Set this node's SSH public key fact
      set_fact:
        my_ssh_pubkey: "{{ slurped_pubkey.content | b64decode | trim }}"

- name: Append each node's SSH key to the other nodes' authorized_keys
  hosts: k3s_cluster
  tasks:
    - name: Ensure other nodes' SSH keys are in authorized_keys
      authorized_key:
        user: "{{ cluster_user }}"
        key: "{{ hostvars[item]['my_ssh_pubkey'] }}"
        state: present
      loop: "{{ groups['k3s_cluster'] | difference([inventory_hostname]) }}"
```

---

## Phase 2: /etc/hosts

DNS is handled by GCP Cloud DNS for external hostnames, but internal cluster communication needs to resolve node names without relying on an external DNS server. The playbook adds a managed block to `/etc/hosts` on all nodes:

```yaml
- name: Add k3s cluster block to /etc/hosts
  blockinfile:
    path: /etc/hosts
    marker: "# {mark} ANSIBLE MANAGED - k3s cluster"
    block: |
      {% for h in groups['k3s_cluster'] %}
      {{ hostvars[h]['ansible_host'] }}  {{ hostvars[h]['k3s_alt_hostname'] }}  {{ h }}
      {% endfor %}
```

This gives every node short-name resolution: `ssh poweredge` works, `ping kudu` works.

---

## Phase 3: k3s Install

The install is a two-phase Ansible play — primary first, workers join using the primary's token.

**Primary:**
```yaml
- name: Install k3s server (primary)
  shell: curl -sfL https://get.k3s.io | sh -
  args:
    creates: /usr/local/bin/k3s

- name: Wait for node-token to exist
  wait_for:
    path: /var/lib/rancher/k3s/server/node-token
    state: present

- name: Read node-token from primary
  slurp:
    src: /var/lib/rancher/k3s/server/node-token
  register: node_token_slurp

- name: Set join token fact for workers
  set_fact:
    k3s_join_token: "{{ node_token_slurp.content | b64decode | trim }}"
  run_once: true
```

**Workers:**
```yaml
- name: Install k3s agent (join with token from primary)
  shell: >
    curl -sfL https://get.k3s.io |
    K3S_URL=https://{{ hostvars[groups['k3s_primary'][0]]['ansible_host'] }}:6443
    K3S_TOKEN={{ hostvars[groups['k3s_primary'][0]]['k3s_join_token'] }}
    sh -
  args:
    creates: /usr/local/bin/k3s
```

The `creates:` argument makes this idempotent — re-running the playbook won't reinstall k3s on nodes that already have it.

---

## Phase 4: kubeconfig Distribution

After install, the kubeconfig lives on the primary at `/etc/rancher/k3s/k3s.yaml` with `server: 127.0.0.1`. Before distributing it, we rewrite the address to the primary's actual IP:

```yaml
- name: Store kubeconfig content as fact (rewrite 127.0.0.1 → primary IP)
  set_fact:
    kubeconfig_content: "{{ kubeconfig_slurp.content | b64decode | replace('127.0.0.1', ansible_host) }}"
```

Then it's written to `~/.kube/config` on all cluster nodes *and* on `localhost` (your Mac). After this play, `kubectl get nodes` works from anywhere in the cluster.

> **[SCREENSHOT: kubectl get nodes output showing all 4 nodes in Ready state]**

---

## Phase 5: The enablelb Label

One of those things you won't know to do until it bites you. k3s uses a `klipper-lb` DaemonSet to implement LoadBalancer services. By default, it only schedules `svclb` pods on nodes that have the label `svccontroller.k3s.cattle.io/enablelb=true`.

Without this label, a node won't forward traffic for LoadBalancer services — meaning if DNS round-robins to that node's IP, the connection hangs. The fix is one kubectl command per node:

```yaml
- name: Apply enablelb label to each cluster node
  command: >
    kubectl label node {{ item }} svccontroller.k3s.cattle.io/enablelb=true --overwrite
  loop: "{{ groups['k3s_cluster'] }}"
```

---

## Problems & Lessons Learned

**"get the subnet right, dammit!"**

This was me at 11pm after the workers couldn't reach the primary. The inventory had the right IPs but I'd typed the wrong subnet in a router configuration, so traffic wasn't routing between nodes. The cluster was technically correct; my LAN wasn't. Lesson: verify IP reachability with `ping` before running any Ansible at all.

**The Ansible Python interpreter problem**

Ansible 2.x and 3.x auto-detect the Python interpreter on each target host. On a mixed cluster (Ubuntu + Arch), they may detect different versions, causing task failures when modules behave differently between Python 2 and 3. The fix: set `ansible_python_interpreter: /usr/bin/python3` explicitly in `group_vars/k3s_cluster.yml`. Don't let Ansible guess.

**SSH key distribution comes first**

I initially ran the k3s install play without the SSH distribution play. It worked — until I needed Ansible to `delegate_to` one node from another. Then everything broke. SSH key distribution is cluster infrastructure. It goes first, always.

---

## Verifying the Cluster

```bash
kubectl get nodes
# NAME         STATUS   ROLES                  AGE   VERSION
# poweredge    Ready    control-plane,master   5m    v1.28.x+k3s1
# tim-xps15    Ready    <none>                 4m    v1.28.x+k3s1
# kudu         Ready    <none>                 4m    v1.28.x+k3s1
# samsung-17   Ready    <none>                 4m    v1.28.x+k3s1
```

All four nodes Ready. Control plane on the PowerEdge. Three workers waiting for workloads.

---

*Next up: [Part 2 — Persistent Storage with Longhorn](/blog/2026-04-12-k3s-journey-02-longhorn/), where we tackle replicated block storage across heterogeneous hardware — including one node whose disk layout didn't go as planned.*
