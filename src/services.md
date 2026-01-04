---
layout: base.njk
title: Services
description: Consulting services offered by LinuxTampa, LLC
---

# Services

{{ site.businessName }} offers comprehensive consulting services to help your business leverage open source software effectively.

## Our Offerings

{% for service in site.services %}
### {{ service }}

[Description of this service - to be customized]
{% endfor %}

## Ready to Get Started?

[Contact us](/contact) to discuss how we can help with your project.

