---
layout: base.njk
title: "TRC / Perot Systems (1997–1999)"
description: Y2K platform migration for Eagle Asset Management — Informix DBA, Solaris sysadmin, ETL development, and a script archaeology project that let the data speak for itself.
---

# TRC / Perot Systems (1997–1999)

TRC was an OO-focused consulting firm that was acquired by Perot Systems during my time there (which was itself later acquired by Dell). My primary engagement was a Y2K remediation project for **Eagle Asset Management (EAM)** in St. Petersburg, FL.

## What Y2K Actually Was

Nobody fixed old two-digit year fields in legacy code. What Y2K projects actually were, almost universally, was the migration projects that should have happened years earlier — with Y2K compliance as the forcing function. This was no different.

EAM ran their entire investment operations on **Investment Manager (IM)**, an aging platform hosted on a Sequent minicomputer running Informix 5. The replacement was **GIM 2.0 (Global Investment Manager)** on new Solaris servers running Informix 7. My role: Informix DBA, Solaris sysadmin on the new environment, and author of the ETL jobs to migrate all data from the old platform to the new.

## The Script Archaeology Problem

EAM had accumulated a graveyard of `ksh` and Informix-4GL scripts over the years — multiple copies of similar scripts, unclear ownership, no documentation on what was still in active use. Migrating everything blindly would waste weeks. Asking users what they used would produce unreliable answers.

The solution: **instrument everything first.** At the start of the engagement, I prepended a single line to every script:

```bash
umask 000; echo "$0 ran at $(date) by ${USER} from ${PWD}" >> /some/globally/writeable/path.txt
```

Over the following weeks, the log file told the whole story — which scripts were actually running, how frequently, who was running them, and from where. Duplicate scripts surfaced immediately. Dead scripts were identifiable with confidence. The active ones could be prioritized by frequency and owner.

Brute force, but effective. And the only approach that doesn't rely on users accurately recalling their own workflows — which they cannot.

[&larr; Back to Work](/work/)
