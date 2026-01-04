# LinuxTampa — Site generation prompt

This file will record the business particulars, visual design choices, and generation instructions for an entirely static website for LinuxTampa, LLC. I'll update this file with the answers you provide in chat.

---

## Purpose / Goals

- Purpose: Present 30 years of software development experience as a consultancy (not as an employee-for-hire) to potential business customers.
- Requirements: Static site (no backend), lightweight HTML/CSS/vanilla JS only, responsive and accessible.

---

## Business particulars (please provide these values)

- Business name (as you want it shown): LinuxTampa, LLC
- Legal name (if different): same
- DBA / trade name (if different): same
- Street address (optional): 
- City / State / ZIP (optional): Tampa area, FL
- Phone (optional): (813) 900-8131
- Email (preferred contact): hello@linuxtampa.com
- Website URL (desired domain): https://linuxtampa.com
- Short tagline (one line): Your Guide to OpenSource Software for Business
- One-paragraph summary / elevator pitch:
- Services / specialization (short list): 
- Technologies & skills (short list + years of experience for each, optional):
- Target customers (who you want to hire you):
- Regions served (local/remote/US/global): Remote US/EU
- Logo: Do you have a logo file? (yes / no). If yes, indicate filename or attach later.  No, I will need help creating one
- Brand color preferences (if any): navy blue & safety orange
- Typography preferences (serif / sans / monospace / Google fonts): sans
- Imagery preferences (photography, illustrations, terminal/tech motifs, Tampa/local imagery): terminal/tech/cloud imagery
- Accessibility / contrast / localization requirements: US English, high contrast, usable on mobile
- Privacy / data policy (do you need a link?): I'll need some more help with this
- Testimonials / case studies available (yes / no). If yes, give brief bullets or files.
- Resume / CV / LinkedIn URL (optional): https://linkedin.com/in/timbaileyjones
- Social links (GitHub, LinkedIn, Twitter, Mastodon, etc.): github.com/timbaileyjones, 
- Preferred contact method / CTA (email, phone, contact form, calendly link): email or phone

---

## Visual design — initial ideas (pick 1 or combine)

A: let's try #1 and #2

1) Clean professional — modern consultancy
   - Palette: navy (#0a2540), teal (#1ba098), warm gray, white
   - Typography: Sans for headings (e.g., Inter), serif or humanist sans for body
   - Imagery: subtle technical illustrations, icons for services, small profile photo in about
   - Layout: centred hero with tagline + CTA, services grid, case studies, contact block

2) Terminal / Developer aesthetic
   - Palette: dark navy or black background with green/teal accent (#00ff9f) and amber highlights
   - Typography: system mono for headings or monospace accents; readable sans for body
   - Imagery: terminal/CLI motifs, code snippets, minimal icons
   - Layout: left-aligned content, clear callouts for services and skillset

3) Tampa / Local flavor
   - Palette: gulf-teal, sunset-orange accent, sand neutrals
   - Typography: clean sans; larger headings
   - Imagery: subtle local photography (skyline, palm shadows) blended with tech imagery
   - Layout: hero with local image and tagline, trust indicators (years, clients)

Notes: the site should be responsive, fast, and accessible (WCAG AA target). I'll generate variants for mobile-first CSS.

---

## Pages & content structure (proposed)

- index.html — hero, services, brief bio, key projects, contact CTA
Generate some fictious examples that I can customize later.

- about.html — full bio, experience timeline, skills
  
- services.html (or a services section on index) — list of consulting offerings
  * website design, implementation and improvements
  * backend implementation & improvements
  * cloud design, automation & hosting (any provider)
  * Linux server administration
  * API integration 

- work/ case-studies — 1–3 short case studies with outcomes
Generate ipsum dolor placeholder text
- contact.html — contact details, preferred method (link to mailto or calendly)
A: I have a calendly link at https://calendly.com/timbaileyjones
- assets/ — logo, images, favicon, optionally PDF resume

A: I added a logo at images/linuxtampa.png

Question: Since we're going to generate several static pages, what are your recommendations for templating?  I definitely don't need anything as complex as Hugo or Jekyll, but I want to be able to change overall themes or features that appear on every page without hand-editing every page.

---

## Small contract (inputs / outputs / success criteria)

- Inputs: answers in the "Business particulars" section, logo and any images you provide, any sample copy.
- Outputs: a small static website (HTML/CSS/vanilla JS) with the pages above and a deployable folder.
- Success criteria: site is responsive, validates as static HTML5 (no server code), provides clear CTAs for contacting the consultancy.  (Question, what is "clear CTAs")?

---

## Edge cases & decisions

- If you don't have a logo, create a strong typographic wordmark instead.
- If no street address is provided, omit the address from public contact info.
- If you prefer not to publish phone/email, we'll show a contact form placeholder (you can swap later).
- If you need stronger privacy/legal language, we'll list a link placeholder to a minimal privacy page.

---

## How to reply

- Best: reply in chat with the fields filled (copy-paste the field name and your answer), e.g. `Business name: LinuxTampa, LLC`.
- Alternate: edit this file directly in the repository and tell me when you're done; I'll read it and continue.

---

## Next steps (after you provide answers)

1. I'll update this file with your answers.
2. I'll produce a first-pass static site skeleton (index + styles + assets) and run a quick local validation.
3. We'll iterate on copy, visuals, and add case studies or testimonials.

---

## Notes / version

Created: (auto) — initial prompt file to collect site generation details.
