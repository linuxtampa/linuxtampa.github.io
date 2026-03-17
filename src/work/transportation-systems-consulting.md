---
layout: base.njk
title: "TSC — Transportation Systems Consulting (1992–1995)"
description: Early career developing cross-platform Unix software for airline maintenance management before the internet era.
---

# TSC — Transportation Systems Consulting (1992–1995)

TSC was one of my first serious programming jobs. The company was founded by George D.S. Andrews, a British aviation enthusiast who built a software suite for the airline industry called **AMIS-2000**.

## What AMIS-2000 Did

AMIS-2000 was an integrated suite of Unix terminal-based software to manage aircraft maintenance — tracking costly downtime and producing compliance documentation for the FAA and UK CAA. The software ran on virtually every Unix variant of the era: Solaris, HP/UX, Apple UX, SCO Unix, UnixWare, Sequent/Dynix, and IBM AIX.

Modules included:
- Aircraft Maintenance Status and Performance
- Planning and Control
- Rotables / Repairables / Tools Management
- Strategic Documents Management
- Material Controls and Inventory Management
- Work Orders and Cost Control
- Purchasing and Repairs Management
- Personnel / Training / Tech Docs Management
- Financial Management
- Aircraft Operations and Management

The UI was terminal-based (curses library, 80x24 character grid on the terminal). "Workstations" were [WYSE WY-60 serial terminals](https://terminals-wiki.org/wiki/index.php/Wyse_WY-60) attached directly to a Sequent minicomputer — no PCs, no laptops. Everyone was logged into the same time-shared system simultaneously. When someone kicked off a compile, everyone felt it.

Software was distributed on quarter-inch QIC tape cartridges in tar format, and physically mailed around the world. Pre-Internet.

## Source Code Control

No git, no Subversion. We used [SCCS](https://en.wikipedia.org/wiki/Source_Code_Control_System) — version history per file, no concept of branches, no renames, no atomic commits. Replication across systems was done with `rcp` or `rsync`. Truly stone knives and bear skins.

## Pre-Internet Communication

Internal chat was via the Unix `talk` program. External email used a shared `uunet` account over `uucp`. Email addresses used the now-extinct [bang-path format](http://www.catb.org/jargon/html/B/bang-path.html) — mine was `...uunet!roscoe!tim`.

## Why This Matters

Working in this environment built a deep instinct for portability, resource efficiency, and writing code that runs on anything. The constraints of shared iron, 80x24 UIs, and pre-internet networking shaped how I think about systems to this day.

[&larr; Back to Work](/work/)
