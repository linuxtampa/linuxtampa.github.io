---
layout: blog-post.njk
title: "The TUIs Are Coming!"
date: 2026-06-07
description: "The terminal programs that replaced half my browser tabs and my GUI AI tools: btop, lazygit, lazydocker, k9s, Claude Code, Aider, and more — and why the terminal renaissance is real."
published: false
templateEngineOverride: md
tags:
  - blog
  - tools
  - terminal
  - devops
  - kubernetes
  - docker
  - git
---

## Before We Start: The Superpower You Should Acquire

> **[PLACEHOLDER: Personal section — Tim to write in own voice]**
>
> **[PHOTO: Take a selfie in the vim shirt!]**
>
> *Suggested beats to hit:*
> - *The lineage: `vi` (1976, Bill Joy, ADM-3A terminal) → `vim` (Vi Improved, 1991) → `gvim` (graphical vim) → `neovim` (2014, modern rewrite with Lua, LSP, async)*
> - *The muscle memory argument: modal editing is a skill that transfers everywhere. Once it's in your fingers, you're faster in every environment that supports it — and most do.*
> - *Where you use vim bindings today: neovim as primary editor on all cluster nodes (installed via Ansible), VS Code/Cursor vim extension, JetBrains IDEs (IdeaVim plugin), Obsidian (vim mode), the shell (set -o vi in zsh), tmux copy mode, k9s, lazygit — the list is long.*
> - *Obsidian specifically: note-taking with vim keybindings, Zettelkasten workflow, why it's a natural fit for someone already living in the terminal.*
> - *The "always available" argument for vi/vim: SSH into any Linux box on the planet, even a minimal Alpine container, and `vi` is there. It's the universal editor. You don't get stranded.*
> - *neovim's modern plugin ecosystem: LSP integration (autocomplete, go-to-definition, inline errors), Treesitter (semantic syntax highlighting), telescope.nvim (fuzzy finder), lazy.nvim (plugin manager). It's a full IDE if you want it to be.*
> - *IDE vim plugins worth naming: VSCodeVim / VSCode Neovim (VS Code + Cursor), IdeaVim (all JetBrains IDEs), vim-mode-plus (Pulsar/Atom legacy), Sublime Text vintage mode.*
> - *The honest admission: there's a learning curve and it's steep. Worth it. No compunctions about using it everywhere.*

---

## The Terminal Didn't Die. It Got a Glow-Up.

For the past decade or so, the conventional wisdom was that GUIs had won. Every tool worth using had a web dashboard. Monitoring? CloudWatch. Git? GitHub's web editor. Kubernetes? The dashboard. Docker? Docker Desktop.

And then something interesting happened. A new generation of terminal UI (TUI) programs started appearing — and they were *good*. Not "good for a terminal app" good. Just good. Faster than web dashboards, lower cognitive overhead, keyboard-driven, and composable in ways that point-and-click tools never are.

I now spend most of my working day inside these. Let me show you why.

---

## What Is a TUI?

A TUI (Text User Interface) is a program that runs in a terminal but renders a full interactive UI using character graphics — boxes, colors, mouse support, panels that scroll independently. It's not a CLI (you're not typing commands) and it's not a GUI (there's no window manager involved). It's the middle path.

The appeal for ops engineers:

- **Lives where you already are.** SSH'd into a remote host? Your TUI is right there. No port-forwarding, no web browser, no VPN to the dashboard.
- **Low latency.** Character rendering over SSH is nearly instant. Loading a JavaScript-heavy web dashboard over VPN is not.
- **Keyboard-driven.** Once you learn the keys, operations take seconds. Mouse-driven dashboards require navigation, scrolling, clicking.
- **Composable.** A TUI is just a process. You can run it in a tmux pane alongside your editor, your logs, and your shell.

---

## btop: The System Monitor That Doesn't Insult Your Intelligence

> **[SCREENSHOT: btop running on the PowerEdge — full-screen view showing CPU graph, memory bars, disk I/O, network, and process list]**

[btop](https://github.com/aristocratsoftware/btop) is a resource monitor. You know `top`. You may know `htop`. btop is what happens when someone sits down and asks "what would a great resource monitor actually look like?"

The answer: a paneled layout with live graphs for CPU (per-core), memory, disk I/O, and network — all updating in real time, all in one screen. The process list is sortable, filterable, and lets you send signals without leaving the program.

**What it does better than htop:**

- CPU graph shows *history*, not just current value. You can see the spike from three seconds ago.
- Memory breakdown distinguishes used/cached/available properly — no more arguing with yourself about what "free" means.
- Disk and network I/O are first-class panels, not buried in a menu.
- Looks incredible. This matters more than you'd think when you're staring at it all day.

**How I use it:**

btop is installed on every node in the homelab cluster via Ansible (`install_utils.yml`). When a Longhorn replication job is hammering disk I/O or a CI runner is saturating a CPU core, btop tells me which node, which process, and how long it's been going on — without SSHing into each node one by one. I keep a tmux window on the PowerEdge with btop running full-screen as a persistent "vitals" view.

```bash
# Install
sudo apt install btop          # Ubuntu 22.04+
sudo pacman -S btop            # Arch
brew install btop              # macOS

# Run
btop
```

**Key bindings worth knowing:**

| Key | Action |
|-----|--------|
| `m` | Cycle memory display mode |
| `f` | Filter process list |
| `e` | Toggle tree view (shows process hierarchy) |
| `k` | Kill selected process |
| `q` | Quit |

---

## lazygit: Git the Way It Should Feel

> **[SCREENSHOT: lazygit showing staged/unstaged diff, branch list, and commit log side by side]**

[lazygit](https://github.com/jesseduffield/lazygit) is a TUI for git. It shows you everything you care about at once: unstaged changes, staged changes, branches, stash, and recent log — all in panels you can navigate with arrow keys or vim-style `hjkl`.

The killer feature is **interactive staging**. In plain git, staging specific hunks requires `git add -p`, which is a clunky back-and-forth prompt. In lazygit, you navigate to the file, press `space` to stage the whole file, or press `enter` to open the diff view and stage individual hunks with `space`. It's the same semantic operation but the feedback loop is immediate and visual.

**What it replaces:**

- `git status` — the whole left panel is a live status view
- `git add -p` — interactive hunk staging is a first-class operation
- `git log --oneline --graph` — the log panel shows this with branch visualization
- `git stash` / `git stash pop` — stash panel, `s` to stash, `g` to pop
- `git rebase -i` — interactive rebase is built in (press `r` on a commit)
- `git diff` — inline diff rendering with syntax highlighting

**How I use it:**

For the homelab IaC work, where I'm making changes across Ansible playbooks and Kubernetes manifests in the same commit, lazygit's hunk-level staging means I can craft clean, focused commits even when I've been working messily. It's also excellent for reviewing what you're about to commit — the diff panel catches things you'd miss running `git diff` and scrolling.

```bash
# Install
sudo apt install lazygit       # Ubuntu (may need PPA for latest)
brew install lazygit           # macOS
sudo pacman -S lazygit         # Arch

# Or via go:
go install github.com/jesseduffield/lazygit@latest

# Run (from inside a git repo)
lazygit
```

**Key bindings worth knowing:**

| Key | Action |
|-----|--------|
| `space` | Stage/unstage file or hunk |
| `c` | Commit |
| `p` | Push |
| `P` | Pull |
| `b` | Branch panel |
| `r` | Interactive rebase |
| `s` | Stash |
| `?` | Show all keybindings |

---

## lazydocker: Docker Without the Pain

> **[SCREENSHOT: lazydocker showing container list, real-time logs panel, and container stats]**

[lazydocker](https://github.com/jesseduffield/lazydocker) — same author as lazygit — does for Docker what lazygit does for git. Left panel: containers, images, volumes, networks. Right panels: stats, logs, config. Navigate with arrow keys. Everything updates live.

The thing that lazydocker solves that no other tool does as well: **log tailing across multiple containers simultaneously**. In plain Docker, watching logs from three containers means three terminal windows running `docker logs -f`. In lazydocker, you scroll through the container list and the log panel updates in real time as you move. You can `enter` any container to get a full-screen log view, or stay in the overview and watch things unfold.

**What it replaces:**

- `docker ps` — container list panel, auto-refreshing
- `docker logs -f` — log panel, live, for whatever container you're looking at
- `docker stats` — CPU/memory stats panel per container
- `docker rm`, `docker stop`, `docker restart` — all accessible via keybindings from the container panel
- `docker exec -it <name> sh` — press `e` to shell into a container

**How I use it:**

On the homelab nodes that run Docker directly (not via Kubernetes), lazydocker is what I reach for when something is misbehaving. The combination of live logs and live stats in the same view makes it much faster to diagnose an OOMKilled container or a volume permission error than cycling through separate `docker` commands.

```bash
# Install
brew install lazydocker        # macOS
go install github.com/jesseduffield/lazydocker@latest  # any platform

# Run
lazydocker
```

**Key bindings worth knowing:**

| Key | Action |
|-----|--------|
| `enter` | Expand to full-screen panel |
| `[` / `]` | Cycle through panel tabs (logs, stats, config, top) |
| `r` | Restart container |
| `s` | Stop container |
| `d` | Remove container |
| `e` | Exec shell into container |

---

## k9s: Kubernetes Without the kubectl Archaeology

> **[SCREENSHOT: k9s showing pod list for all namespaces with CPU/memory columns, one pod selected]**

> **[SCREENSHOT: k9s log view for a selected pod — full screen streaming logs]**

[k9s](https://k9scli.io) is the TUI for Kubernetes. It's in a category of its own because there's nothing else like it. The Kubernetes dashboard is a web app that requires port-forwarding and doesn't update in real time. `kubectl` is a command-line tool that requires you to remember the right incantations. k9s is neither — it's a live, navigable view of your entire cluster.

The default view: a table of pods across all namespaces, auto-refreshing, with CPU and memory columns. Press `/` to filter. Press `l` to tail logs. Press `d` to describe. Press `e` to edit the live YAML. Press `enter` to drill into a pod's containers. Press `ctrl-k` to delete. All without leaving the terminal or typing a single `kubectl` command.

**The `:` command interface** is what makes k9s truly powerful. Like vim, you switch "views" by typing a resource type:

```
:pods          → pod list (default)
:deployments   → deployment list
:services      → service list
:pvc           → PersistentVolumeClaims
:nodes         → node list with resource pressure indicators
:events        → cluster events (this one is invaluable for debugging)
:secrets       → secrets (values are hidden by default)
:ing           → ingresses
:cm            → configmaps
```

Any Kubernetes resource type works. If you can `kubectl get` it, you can navigate to it in k9s.

**How I use it:**

k9s is open in a tmux pane almost any time I'm working on the homelab cluster. For the work described in the k3s Journey series — iterating on Longhorn disk paths, debugging act_runner StatefulSet issues, watching Open WebUI crashloop until I got the memory limit right — k9s was the primary interface. The `:events` view in particular is invaluable: it shows you the cluster's "why did that happen?" history in real time.

```bash
# Install
brew install k9s               # macOS
sudo snap install k9s          # Ubuntu
sudo pacman -S k9s             # Arch

# Or via binary release:
# https://github.com/derailed/k9s/releases

# Run
k9s                            # uses current kubeconfig context
k9s --namespace forgejo        # start in a specific namespace
```

**Key bindings worth knowing:**

| Key | Action |
|-----|--------|
| `/` | Filter current view |
| `l` | Tail logs for selected pod |
| `d` | Describe resource |
| `e` | Edit resource YAML live |
| `enter` | Drill into resource |
| `ctrl-k` | Delete resource |
| `y` | View YAML |
| `u` | View used resources (namespace resource quotas) |
| `?` | Full keybinding help |
| `esc` | Go back / exit current view |
| `:q` | Quit |

---

## AI in the Terminal

The most interesting recent development in the TUI space is AI coding assistants that live entirely in the terminal. Cursor and VS Code with Copilot are excellent tools — but they're GUI applications. If you live in the terminal, or you're SSHed into a remote machine, or you just don't want another Electron app eating RAM, there are now compelling alternatives.

### Claude Code

> **[SCREENSHOT: Claude Code session in the terminal — conversational interface with file edits applied inline]**

[Claude Code](https://claude.ai/code) is Anthropic's official CLI for Claude. It's the tool I'm using to write this post and build this website. It's not a traditional TUI with panels — it's a conversational coding assistant that runs in your terminal, reads and edits your files, runs commands, and maintains context across a full coding session.

What makes it different from just using the Claude web interface:

- **It has your codebase.** It reads files, searches with grep and glob, runs your tests, checks git history. The context isn't what you paste in — it's your actual project.
- **It acts.** It doesn't just suggest changes — it makes them, with your approval. Edit a file, run a build, fix the error, commit.
- **It stays in the terminal.** Same window as your shell, your editor, your logs. No context switching.

The workflow shift is real. Work that used to mean Google → Stack Overflow → docs → manual edits now looks like: describe what you want, review the diff, approve. This entire blog series was drafted in Claude Code sessions against the homelab-seed repo's git history and IaC files.

```bash
# Install
npm install -g @anthropic-ai/claude-code

# Run (from your project root)
claude
```

### Aider

> **[SCREENSHOT: Aider session showing a code change being applied with a diff view and git commit]**

[Aider](https://aider.chat) is an open-source AI pair programmer for the terminal. It predates Claude Code and takes a slightly different approach: rather than a conversational session, you add files to the context explicitly (`/add src/foo.py`), make requests, and Aider applies changes and auto-commits them to git.

Aider's strengths:

- **Multi-model.** Works with Claude, GPT-4o, Gemini, local Ollama models. You can point it at the `llama3.2` model running on your homelab's Ollama instance for fully local, fully private AI coding assistance.
- **Explicit file context.** You control exactly which files are in context, which matters for large codebases where you don't want to burn tokens on irrelevant files.
- **Automatic git commits.** Every change gets committed with a generated message. Your git history becomes a log of AI-assisted changes.
- **Diff-first UI.** Every proposed change shows as a diff before being applied.

```bash
pip install aider-chat

# With Claude
aider --model claude-opus-4-5

# With your local Ollama (free, private)
aider --model ollama/llama3.2:3b
```

### `llm` — A Swiss Army Knife for Language Models

[`llm`](https://llm.datasette.io) by Simon Willison is a CLI tool that lets you query any LLM from your terminal with a single command. It's not a coding assistant — it's a general-purpose AI interface for shell pipelines.

```bash
# Install
pip install llm

# Install provider plugins
llm install llm-claude-3
llm install llm-ollama  # for local Ollama models

# Use it
cat error.log | llm "what is causing this error?"
git diff | llm "write a commit message for these changes"
llm "explain this kubectl output: $(kubectl get events -n forgejo)"
```

That last pattern — piping command output directly into an LLM — is where `llm` earns its place. You can pipe log output, command results, file contents, and get back a concise explanation or next step. It integrates with shell history, supports conversations with `-c` (continue the last conversation), and logs everything locally.

It also works with local Ollama models via the `llm-ollama` plugin, which means fully private AI queries with no API cost.

### `mods` — AI for the Shell, with Style

[`mods`](https://github.com/charmbracelet/mods) is by [Charm](https://charm.sh) — the team behind Bubble Tea (the TUI framework that powers many of the programs in this post). It does similar things to `llm` but renders output with syntax highlighting, markdown formatting, and their characteristic visual polish.

```bash
brew install charmbracelet/tap/mods

# Summarize a file
mods "what does this do?" < ansible/install_k3s.yml

# Pipe kubectl output
kubectl describe pod -n forgejo act-runner-0 | mods "why is this pod not starting?"
```

The experience is noticeably nicer than raw `llm` output when you want readable, formatted responses rather than plain text for further piping.

### A Note on Cursor

Cursor is a GUI IDE — a fork of VS Code with deep AI integration. It's excellent at what it does, and if you prefer a graphical editor, it's worth using. But it's not a TUI and it doesn't belong in this list. There's no terminal-only mode, no SSH-compatible headless version, no tmux pane you can drop it into.

The terminal AI tools above — Claude Code and Aider especially — cover the use cases where Cursor can't go: remote servers, SSH sessions, scripted workflows, pipelines. They're complements, not replacements.

---

## The Setup

All four tools live on my Mac and on the cluster nodes where relevant. The Ansible `install_utils.yml` playbook handles the cluster nodes:

```yaml
- name: Install utility tools
  apt:
    name:
      - btop
      - lazygit
    state: present
  when: ansible_facts['os_family'] == "Debian"
```

k9s and lazydocker run on the Mac only — k9s talks to the cluster via kubeconfig, and lazydocker is only useful where Docker runs directly (not in k3s, which uses containerd).

For the Mac, everything goes through Homebrew:

```bash
brew install btop lazygit lazydocker k9s
brew install charmbracelet/tap/mods
npm install -g @anthropic-ai/claude-code
pip install aider-chat llm
```

I also keep btop running on each cluster node via a persistent tmux session — useful when SSHed in for maintenance to have a live resource view without launching a separate session.

---

## Why This Matters

There's a broader point here beyond "these are good tools."

Cloud platforms have trained a generation of engineers to reach for the web console first. The AWS dashboard, the GCP Cloud Console, the Azure Portal — they're capable, but they're also slow, they require internet access, they're not composable, and they log you out at the worst possible moment.

The TUI renaissance is, in part, a correction. When you're SSHed into a node at 2am chasing an incident, a terminal that shows you everything at once — resource utilization, process list, container logs, cluster events — is worth more than any number of browser tabs. These tools don't replace the cloud console. But they replace most of what I used to use it for on a daily basis.

The terminal didn't die. It just took a few years off.

---

*If you're working on a similar homelab setup, these tools slot right in alongside the stack described in the [k3s Journey series](/tags/series:k3s-journey).*
