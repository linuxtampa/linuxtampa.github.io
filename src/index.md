---
layout: base.njk
title: Home
description: Your Guide to OpenSource Software for Business
---

<img src="{{ site.logo }}" alt="{{ site.businessName }}" class="linuxtampa-logo" />

# Welcome to {{ site.businessName }}

{{ site.tagline }}

With over 30 years of software development experience, I specialize in helping businesses leverage open source technologies and cloud infrastructure to solve complex challenges. From secure defense-sector environments to high-scale cloud migrations, I bring deep expertise in full-stack development, DevOps automation, and system architecture.

## Services

We provide expert consulting services in:

{% for service in site.services %}
  - {{ service }}
{% endfor %}

## Get in Touch

Ready to discuss your project? [Schedule a consultation]({{ site.calendly }}) or [contact us](/contact).

