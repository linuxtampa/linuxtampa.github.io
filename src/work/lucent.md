---
layout: base.njk
title: "Lucent Technologies (1995–1997)"
description: Designed and built a real-time semiconductor factory control system for Lucent's Orlando chip fab, integrating SECS/GEM equipment controllers into a unified factory-floor view.
---

# Lucent Technologies (1995–1997)

Lucent Technologies was spun off from AT&T in 1995 — carrying with it the Bell Labs lineage and a serious engineering culture. The Orlando, FL facility operated two semiconductor fabrication plants: OR1, a 6" wafer fab already in production, and OR2, an 8" fab under construction during my time there.

## The Problem

Each piece of fab equipment — etching, chemical cleaning, deposition, oxidation, ion implantation, photoresist coating, assembly/test/packaging — only knew about its own role. There was no factory-level view of wafer batches, no automated hand-off between stations, and no unified picture of total factory output.

The goal was to design and build a process control system that provided exactly that: real-time visibility across all equipment, automated batch dispatch to the next station, and the data foundation to track and improve throughput — across both OR2 (greenfield) and OR1 (retrofit).

## Integration

Most equipment communicated via **SECS/GEM** (the semiconductor industry standard protocol of the era), but not all. Some equipment manufacturers required significant cajoling to bridge the gap. Vendor compliance with "standard" protocols was aspirational at best.

## The State Machine

The backend tracked all wafer batch transitions via a **state machine** — only valid transitions were permitted, with all others denied and flagged for investigation. This caught integration bugs early, at the boundary, before bad state could propagate through the system.

Critically, the state labels were data-driven: pulled from the backend at runtime, never hardcoded into the UI. When new states were introduced later, the GUI reflected them automatically — no release required. The same instinct that later drove the Rhino/runtime-configurable approach at Syniverse.

## The GUI

I designed and implemented the operator dashboard in **X11/Motif (C with C++ extensions)** — displaying the factory floor map, batch locations, station status, queue depths, and dispatch controls. Operators could both monitor and actively dispatch batches through the same interface.

If Solaris/X11 had had a capable browser in 1995, this would have been a web dashboard. The architecture was right; the delivery mechanism was just constrained by what existed at the time.

[&larr; Back to Work](/work/)
