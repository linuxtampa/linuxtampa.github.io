---
layout: blog-post.njk
title: "k3s at Home, Part 2: Replicated Block Storage with Longhorn"
date: 2026-04-05
description: Why k3s's default local-path storage doesn't cut it for real workloads, how Longhorn solves it, and the three things that went wrong before it worked correctly on heterogeneous hardware.
published: false
templateEngineOverride: md
tags:
  - blog
  - k3s
  - homelab
  - kubernetes
  - longhorn
  - storage
  - devops
  - series:k3s-journey
---

*This is Part 2 of the [k3s Journey](/tags/series:k3s-journey) series. [Part 1](/blog/2026-04-05-k3s-journey-01-bootstrap/) covered hardware and cluster bootstrap.*

---

## The Problem With local-path

k3s ships with a default StorageClass called `local-path`. It provisions PersistentVolumes by creating directories on the node's local filesystem. Simple, fast, zero configuration.

Also: completely useless for real workloads.

If a pod using a `local-path` PVC gets rescheduled to a different node — because the original node went down, or you drained it for maintenance — the data doesn't follow it. The PVC is bound to the node where it was first created. The pod will either fail to mount the volume or silently start with an empty directory.

For a homelab that's meant to run actual services (Forgejo, PostgreSQL, Odoo), this is a dealbreaker. You need storage that's decoupled from specific nodes.

---

## What Longhorn Does

[Longhorn](https://longhorn.io) is a CNCF-incubating distributed block storage system designed for Kubernetes. It was built by Rancher (now SUSE), so it integrates naturally with k3s.

The key properties:

- **Replicated volumes:** each PVC is replicated across multiple nodes (configurable — we use 3). If a node goes down, the volume is still accessible from the replicas on other nodes.
- **Scheduled as a Kubernetes workload:** Longhorn itself runs as pods in `longhorn-system`. No separate storage infrastructure to manage.
- **Per-node disk configuration:** each node contributes a specific disk path to the storage pool. This is critical for heterogeneous hardware where disk layout varies per machine.
- **Web UI:** a full dashboard for volume status, replica health, backup configuration.

**Cloud equivalents:**

| | Longhorn | AWS EBS | GCP Persistent Disk | Azure Disk | OpenShift ODF |
|--|---------|---------|---------------------|------------|--------------|
| Access mode | RWO | RWO | RWO | RWO | RWO + RWX |
| Replication | 2–5 replicas (user-defined) | AZ-level | Zone-level | Zone-level | 3 replicas |
| Cross-node failover | Yes | No (AZ-scoped) | No (Zone-scoped) | No | Yes |
| Cost | $0 (disk you own) | $0.10/GB/mo | $0.04/GB/mo | $0.06/GB/mo | Operator cost |
| Management overhead | Low | None | None | None | High |

The tradeoff vs. cloud block storage: you own the failure domain. If two of your four nodes go down simultaneously, a 3-replica volume with replicas on those two nodes is degraded (though still accessible from the third). Cloud providers handle this through zone redundancy — you're responsible for it here.

---

## Prerequisites: open-iscsi and NFS

Longhorn uses iSCSI to attach replicated volumes to pods. Before installing Longhorn, every node needs `open-iscsi` and the iSCSI daemon running.

```yaml
# From ansible/install_longhorn.yml
- name: Install open-iscsi and NFS utils (Debian/Ubuntu)
  apt:
    name:
      - open-iscsi
      - nfs-common
    state: present

- name: Ensure iSCSI initiator name exists
  copy:
    content: "InitiatorName=iqn.2005-03.org.open-iscsi:{{ ansible_facts['hostname'] }}\n"
    dest: /etc/iscsi/initiatorname.iscsi
    mode: "0644"

- name: Ensure iscsi service is started and enabled
  service:
    name: open-iscsi
    state: started
    enabled: true
```

The `initiatorname.iscsi` file is required but often missing on fresh Ubuntu installs. If it's absent, `iscsid` starts but can't identify itself to the iSCSI target, and Longhorn volume attachments fail silently.

---

## Installation

Longhorn installs via a single manifest — but wait for it to fully stabilize before applying anything that depends on it:

```yaml
- name: Apply Longhorn manifest
  command:
    cmd: "kubectl apply -f https://raw.githubusercontent.com/longhorn/longhorn/v1.6.0/deploy/longhorn.yaml"

- name: Wait for Longhorn manager to be ready
  command:
    cmd: "kubectl wait --for=condition=available --timeout=300s deployment/longhorn-manager -n longhorn-system"
```

After install, Longhorn is the default StorageClass. Any PVC that doesn't specify a storage class will use Longhorn and get 3 replicas.

> **[SCREENSHOT: Longhorn UI — volumes list showing replicated PVCs with green replica status]**

> **[SCREENSHOT: Longhorn UI — node view showing disk usage per node]**

---

## The Hard Part: Per-Node Disk Paths

This is where heterogeneous hardware gets painful. Each node in the cluster has a different disk layout:

| Node | Longhorn path | Notes |
|------|--------------|-------|
| poweredge | `/hgst4tb/longhorn` | Dedicated 4TB HGST drive |
| tim-xps15 | `/home/longhorn` | Largest partition on this laptop |
| kudu | `/data2/longhorn` | Secondary drive |
| samsung-17 | `/var/lib/longhorn` (via symlink) | See below |

Each node's path is set in the Ansible inventory as `longhorn_data_path`. The Ansible playbook creates the directory and then patches the Longhorn Node CRD to point to it:

```yaml
- name: Create Longhorn data directory
  file:
    path: "{{ longhorn_data_path }}"
    state: directory
    mode: "0755"

- name: Set disk path for Longhorn node
  command:
    cmd: >
      kubectl patch nodes.longhorn.io {{ longhorn_k8s_node_name }}
      -n longhorn-system --type merge
      -p '{"spec":{"disks":{"default-disk":{"path":"{{ longhorn_data_path }}","allowScheduling":true}}}}'
  vars:
    longhorn_k8s_node_name: "{{ hostvars[item]['longhorn_k8s_node_name'] | default(hostvars[item]['k3s_alt_hostname']) }}"
    longhorn_data_path: "{{ hostvars[item]['longhorn_data_path'] }}"
  loop: "{{ groups['k3s_cluster'] }}"
```

Note the `longhorn_k8s_node_name` fallback: if the inventory doesn't specify it, we use `k3s_alt_hostname`. But if the OS hostname and the k3s node name don't match the inventory hostname, the patch fails silently (it's patching the wrong Longhorn Node CR). This is why `tim-xps15` and `samsung-17` have explicit `longhorn_k8s_node_name` overrides — their OS hostnames include hyphens that the Ansible inventory couldn't use.

---

## The Namespace Ordering Problem

Early on, applying all manifests at once with `kubectl apply -f k8s-manifest/` would sometimes fail because Kubernetes processes files alphabetically, and the `Deployment` or `PVC` in a subdirectory might be applied before the `Namespace` it depends on.

The fix: prefix all namespace manifest files with `00-`:

```
k8s-manifest/
  longhorn/
    00-namespace.yaml      ← applied first
    default-replica-count-setting.yaml
    ingress.yaml
    middleware.yaml
    ...
```

This is a simple, durable convention. Namespaces always exist before their dependents.

---

## Problems & Lessons Learned

**"fix longhorn disk paths, add ping/health check"**

On the first install, I had the disk paths wrong in two places: the inventory and the Longhorn Node CR patch. Longhorn didn't fail — it just ignored the specified path and used its default (`/var/lib/longhorn`). The disks appeared to be "working" but were writing to the wrong location. I only discovered this when I ran out of space on the wrong partition.

Lesson: always verify Longhorn's actual disk paths via the UI after install. Don't assume the patch worked.

**"Fix samsung-17 Longhorn disk: symlink /home/longhorn → /var/lib/longhorn"**

The samsung17 laptop's `/home` partition was a separate mount on a smaller drive than I expected. Rather than repartition the disk mid-deployment, I created a symlink: `/home/longhorn → /var/lib/longhorn`. Longhorn follows the symlink and writes to `/var/lib/longhorn` on the larger root partition.

This is pragmatic, not elegant. If you're setting up from scratch, make sure your Longhorn data path is on a partition with actual space.

**"Label all nodes with enablelb so svclb pods run everywhere"**

Covered in Part 1, but it affects Longhorn too: without the `enablelb` label, some nodes won't have the `svclb` DaemonSet pods running, and traffic to LoadBalancer services (including the Longhorn UI) will be silently dropped for clients hitting those nodes via DNS round-robin.

---

## Verifying Longhorn

```bash
# All Longhorn pods should be Running
kubectl get pods -n longhorn-system

# Longhorn should be the default StorageClass
kubectl get storageclass
# NAME                 PROVISIONER          RECLAIMPOLICY   VOLUMEBINDINGMODE   ALLOWVOLUMEEXPANSION
# longhorn (default)   driver.longhorn.io   Delete          Immediate           true
# local-path           rancher.io/local-path Delete         WaitForFirstConsumer false

# Test PVC
kubectl apply -f - <<EOF
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: test-pvc
spec:
  accessModes: [ReadWriteOnce]
  resources:
    requests:
      storage: 1Gi
EOF
kubectl get pvc test-pvc
# NAME       STATUS   VOLUME   CAPACITY   ACCESS MODES   STORAGECLASS   AGE
# test-pvc   Bound    ...      1Gi        RWO            longhorn       30s
```

If the PVC binds, Longhorn is working. Delete it after verification.

---

*Next up: [Part 3 — TLS Everywhere with cert-manager and Traefik](/blog/2026-04-05-k3s-journey-03-tls/), where we get wildcard HTTPS certificates for all cluster services via Let's Encrypt DNS-01 challenges.*
