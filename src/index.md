---
layout: base.njk
title: Home
description: Your Guide to OpenSource Software for Business
---

<img src="{{ site.logo }}" alt="{{ site.businessName }}" class="linuxtampa-logo" />

# Welcome to {{ site.businessName }}

{{ site.tagline }}

## Services

We provide expert consulting services in:

{% for service in site.services %}
- {{ service }}
{% endfor %}

## Get in Touch

Ready to discuss your project? [Schedule a consultation]({{ site.calendly }}) or [contact us](/contact).

