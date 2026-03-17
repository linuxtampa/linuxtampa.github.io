---
layout: base.njk
title: Home
description: Your Guide to OpenSource Software for Business
---

<div class="carousel" id="homepage-carousel">
  <div class="carousel-track">
    <img src="{{ site.logo }}" alt="{{ site.businessName }}" class="carousel-slide" />
    <img src="/images/tim.jpg" alt="Tim Bailey Jones" class="carousel-slide" />
  </div>
  <button class="carousel-btn prev" onclick="carouselMove(-1)" aria-label="Previous">&#8249;</button>
  <button class="carousel-btn next" onclick="carouselMove(1)" aria-label="Next">&#8250;</button>
  <div class="carousel-dots"></div>
</div>

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

