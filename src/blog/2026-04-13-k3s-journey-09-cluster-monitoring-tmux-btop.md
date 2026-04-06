---
layout: blog-post.njk
title: "k3s at Home, Part 9: Cluster-Wide Monitoring with tmux and btop"
date: 2026-04-13
description: "A 10-line zsh function that opens a tiled tmux session with btop running on all four cluster nodes simultaneously — instant cluster-wide visibility without Prometheus, Grafana, or a web browser."
published: false
templateEngineOverride: md
tags:
  - blog
  - k3s
  - homelab
  - kubernetes
  - tmux
  - btop
  - monitoring
  - devops
  - series:k3s-journey
---

*This is Part 9 of the [k3s Journey](/tags/series:k3s-journey) series. [Part 8](/blog/2026-04-12-k3s-journey-08-whats-next/) covered what the cluster still needs to be production-grade.*

---

## The Gap Between "Something's Wrong" and "Which Node?"

The cluster is running. Services are up. Then something starts behaving badly — a CI job takes forever, a Longhorn replication is crawling, Open WebUI is sluggish. The question is always the same: *which node is having the problem?*

The proper answer is a full observability stack: Prometheus scraping metrics from every node, Grafana dashboards with historical graphs, Alertmanager sending you a Slack notification before you even notice. That's [on the backlog](/blog/2026-04-12-k3s-journey-08-whats-next/).

The *practical* answer, for right now, is ten lines of shell.

---

## The Function

```zsh
# Cluster monitoring — opens 4 tiled tmux panes, btop on each node
cluster-btop() {
  tmux kill-session -t cluster 2>/dev/null
  tmux new-session -d -s cluster "ssh 192.168.4.3 -t 'zsh -i -c btop'"
  tmux split-window -h -t cluster "ssh 192.168.4.4 -t 'zsh -i -c btop'"
  tmux split-window -v -t cluster "ssh 192.168.4.5 -t 'zsh -i -c btop'"
  tmux select-pane -t cluster:0.0
  tmux split-window -v -t cluster "ssh 192.168.4.6 -t 'zsh -i -c btop'"
  tmux select-layout -t cluster tiled
  tmux attach -t cluster
}
```

Type `cluster-btop` from your Mac. Within a couple seconds you're looking at this:

> **[SCREENSHOT: Terminal window showing 2x2 tiled tmux layout, each pane running btop on a different cluster node — poweredge, dellxps15, kudu, samsung17 — with CPU graphs, memory bars, and process lists visible simultaneously]**

Four nodes. Four live resource monitors. One screen. No browser, no dashboard, no port-forwarding.

---

## How It Works

**`tmux new-session -d -s cluster "..."`**

Creates a new tmux session named `cluster` in detached mode (`-d`), with the first pane running an SSH command to the primary node (192.168.4.3 / poweredge). The SSH command uses `-t` to force pseudo-TTY allocation — btop needs a real terminal to render its UI.

`'zsh -i -c btop'` starts an interactive zsh shell (`-i`) and immediately runs btop. The interactive flag matters: it loads your `.zshrc`, which means btop runs in the same environment you'd get if you SSHed in and typed `btop` manually.

**`tmux split-window -h`**

Splits the current pane horizontally (left/right), creating a second pane running btop on the second node (192.168.4.4 / dellxps15).

**`tmux split-window -v`**

Splits the current pane vertically (top/bottom). After the horizontal split, the "current pane" is the new right-side pane, so this creates a third pane in the bottom-right, running btop on 192.168.4.5 (kudu).

**`tmux select-pane -t cluster:0.0`**

Moves focus back to the first pane (top-left). Without this, the next split would happen in the bottom-right pane again.

**`tmux split-window -v` (again)**

Now splits the top-left pane, creating the fourth pane (bottom-left) for 192.168.4.6 (samsung-17).

**`tmux select-layout -t cluster tiled`**

Applies the `tiled` layout, which distributes all panes as evenly as possible across the terminal. On a widescreen display, this gives you a clean 2×2 grid. On a narrower display, it adjusts automatically.

**`tmux attach -t cluster`**

Brings the detached session to the foreground in your current terminal window.

---

## What You're Looking At

> **[SCREENSHOT: Close-up of one btop pane showing the PowerEdge with high CPU usage from a Longhorn replication job in progress — process list shows longhorn-manager at the top]**

Each pane shows the full btop UI for its node:

- **Top-left graph** — CPU utilization per core, with recent history
- **Top-right** — memory breakdown (used / cached / available / swap)
- **Middle** — disk I/O and network throughput, live graphs
- **Bottom** — process list, sortable, with CPU%, MEM%, and command

With four nodes visible simultaneously, patterns jump out immediately:

- A Longhorn replica rebuild shows up as elevated disk I/O on two or three nodes at once
- A misbehaving CI job pins a CPU core on whichever worker it landed on
- A memory leak in a pod shows up as steady memory growth on one node while the others are flat
- Network traffic from an image pull hits the pulling node's network graph

This kind of at-a-glance cross-node visibility is what Grafana dashboards are designed to provide — but Grafana requires setup, storage, and a browser. `cluster-btop` requires ten lines of shell and a working SSH config.

---

## Setup Requirements

**SSH key distribution** — all four nodes must allow passwordless SSH from your Mac as `tim`. This is handled by `ansible/install_k3s.yml` (covered in [Part 1](/blog/2026-04-05-k3s-journey-01-bootstrap/)).

**btop on all nodes** — installed via `ansible/install_utils.yml`:

```yaml
- name: Install utility tools
  apt:
    name: [btop, lazygit, neovim, htop, tig]
    state: present
  when: ansible_facts['os_family'] == "Debian"
```

**tmux on your Mac:**
```bash
brew install tmux
```

**The function in your `.zshrc`:**
```zsh
# ~/.zshrc
cluster-btop() {
  tmux kill-session -t cluster 2>/dev/null
  tmux new-session -d -s cluster "ssh 192.168.4.3 -t 'zsh -i -c btop'"
  tmux split-window -h -t cluster "ssh 192.168.4.4 -t 'zsh -i -c btop'"
  tmux split-window -v -t cluster "ssh 192.168.4.5 -t 'zsh -i -c btop'"
  tmux select-pane -t cluster:0.0
  tmux split-window -v -t cluster "ssh 192.168.4.6 -t 'zsh -i -c btop'"
  tmux select-layout -t cluster tiled
  tmux attach -t cluster
}
```

---

## Detaching Without Killing It

One tmux behavior worth knowing: `ctrl-b d` detaches from the session without killing it. The four btop instances keep running on the nodes. Type `cluster-btop` again to reattach, or `tmux attach -t cluster` from any terminal.

This means you can run `cluster-btop` at the start of a work session, detach, do other work, reattach when you need to check node health, and the views are already there — no SSH connection setup delay.

To kill the session explicitly:
```bash
tmux kill-session -t cluster
```

Or just let the function handle it — the first line (`tmux kill-session -t cluster 2>/dev/null`) kills any existing session before creating a new one, so you can always re-run `cluster-btop` from a clean state.

---

## Navigating Between Panes

Standard tmux pane navigation works normally inside the session:

| Key | Action |
|-----|--------|
| `ctrl-b` + arrow | Move to adjacent pane |
| `ctrl-b z` | Zoom current pane to full screen (toggle) |
| `ctrl-b d` | Detach session |
| `ctrl-b [` | Enter scroll mode (to scroll btop's log view) |

Zooming a single pane (`ctrl-b z`) is useful when one node is the problem and you want full-screen btop on just that node without losing the session layout.

---

## The Hostname-Aware Prompt

> **[SCREENSHOT: SSH terminal showing the custom zsh prompt: green "tim@", cyan "poweredge", yellow "~" — clearly distinguishing which node you're on]**

When you're navigating between panes and they all look the same, it's easy to lose track of which node you're actually looking at — especially when btop is running and the shell prompt isn't visible.

The Ansible `install_utils.yml` playbook sets a hostname-aware zsh prompt on all cluster nodes:

```zsh
# Deployed to each node's ~/.zshrc via Ansible
PROMPT='%F{green}%n@%f%F{cyan}%m%f %F{yellow}%~%f %# '
```

Green username, cyan hostname, yellow path. At a glance: `tim@poweredge ~` vs `tim@kudu ~`. Before we added this, I spent too many minutes debugging the wrong node.

This is why the SSH command in `cluster-btop` uses `zsh -i` (interactive) — it loads `.zshrc`, which sets up the prompt correctly before btop takes over the terminal.

---

## When btop Isn't Enough

`cluster-btop` is excellent for real-time "what is happening right now" questions. It doesn't give you:

- Historical data (what happened at 3am when you were asleep)
- Alerting (notification when a node hits 90% memory)
- Per-pod or per-container resource attribution (you can see a process, but not which Kubernetes pod it belongs to)
- Aggregated views across the cluster (total cluster CPU utilization)

For those, the answer really is Prometheus + Grafana — which remains the top backlog item. But for daily operational awareness and incident triage, `cluster-btop` handles the majority of questions that come up.

---

*The k3s Journey series continues as the cluster evolves. Up next: authentication with Authelia — adding SSO to the unauthenticated admin interfaces (Longhorn, pgweb, the Docker registry).*
