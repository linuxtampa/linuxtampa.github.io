---
layout: base.njk
title: "McKinsey & Company — Matter Foundations (2021–2024)"
description: Core contributor to McKinsey's internal multi-cloud infrastructure provisioning platform, used in Cloud Transformation engagements worldwide.
---

# McKinsey & Company — Matter Foundations (2021–2024)

My best experience at McKinsey was working on **Matter Foundations (MF)** — a cloud-enablement product that codifies best practices from McKinsey's cloud transformation engagements into repeatable, automated infrastructure.

## The Problem MF Solves

The best analogy is residential construction:

> Before a single house can be built, a developer has to name the subdivision, plan the roads, sewers, utilities, and community facilities, like pool, clubhouse, and choice of gaudy fountain at the entrance. Only *then* can homes be built.

McKinsey cloud engagements have the same requirement. Historically, teams would handcraft cloud foundations from scratch — weeks or months of work before any application development or migrations could start.

Matter Foundations automates that "subdivision build-out" step. It provisions a fully governed, well-architected cloud foundation in a fraction of the time (good for clients), with consistent structure across engagements (good for the consulting delivery teams).

## Multi-Cloud by Design

MF targets all three major clouds — **AWS, GCP, and Azure** — with a common vocabulary and consistent abstractions:

| Cloud | Account-level concept |
|-------|----------------------|
| AWS | Account |
| Azure | Subscription |
| GCP | Project |

Where a cloud provides a native service, MF uses it. Where one cloud lacks something another provides, MF fills the gap with an open-source alternative.

**Example:** AWS has [IPAM](https://docs.aws.amazon.com/vpc/latest/ipam/what-it-is-ipam.html) for IP address management across accounts. Azure and GCP don't — so MF provides an equivalent built on open-source tooling for those platforms.

## My Role

I was a core contributor to Matter Foundations for three years, working on automated end-to-end testing infrastructure that allowed the team to catch regressions across cloud providers as the platform evolved.  I worked on the AWS edition first, and later the GCP edition.

[&larr; Back to Work](/work/)
