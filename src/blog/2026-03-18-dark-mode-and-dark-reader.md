---
layout: blog-post.njk
title: "Building a Dark Mode Toggle That Plays Nice With Dark Reader"
date: 2026-03-18
description: How to detect the Dark Reader browser extension and gracefully step aside — with a MutationObserver, a one-liner CSS trick, and a lesson I learned the hard way about why this actually matters.
tags:
  - blog
  - web
  - css
  - javascript
  - empathy
---

## Why I Care About This

In 2022, I had life-changing eye surgery — lens replacement. Before the surgery, I could not read bright white screens without significant pain and discomfort. Dark Reader became a non-negotiable part of my browser setup. Every site I visited got inverted whether the developers intended it or not.  But sometimes a web offers a dark mode toggle but it actually conflict with DarkReader's efforts. 

I'm not alone. Millions of people depend on Dark Reader and similar extensions for accessibility reasons — photosensitivity, migraines, recovering from eye surgery, or simply preferring low-luminance environments. Many of them have no control over their viewing conditions. Think about screen sharing: when someone else is presenting, you're stuck with whatever theme their machine is running.

With the new artificial lens in each eye now, I can handle bright screens again — though I still prefer dark.  But the issue is still important to me, because #empathy is an important value.

But building this site gave me a fresh appreciation for the problem from the other side: what happens when *your* site's dark mode toggle and Dark Reader are both active at the same time?

The short answer: they fight, and it looks terrible.

---

## The Problem

When you build a dark mode toggle into your site, you're typically doing something like this:

```javascript
// Set dark mode
document.documentElement.setAttribute('data-theme', 'dark');

// Set light mode
document.documentElement.removeAttribute('data-theme');
```

And your CSS looks like:

```css
:root {
  --bg-main: #fdf8f2;
  --text-primary: #2c1a0e;
}

[data-theme="dark"] {
  --bg-main: #0f150f;
  --text-primary: #00ff9f;
}
```

This works beautifully on its own. But Dark Reader works by injecting its own stylesheet into the page — it analyzes your colors, inverts them, and applies its own `data-darkreader-scheme` attribute to `<html>`. If your toggle is also active, both stylesheets are fighting over the same elements. The result is an ugly, inconsistent mess: some things are double-inverted back to light, others are a muddy combination of both themes.

The polite solution is to detect that Dark Reader is present and step aside.

---

## Detecting Dark Reader

Dark Reader signals its presence by adding a `data-darkreader-scheme` attribute to the `<html>` element. You can check for it directly:

```javascript
const isDarkReaderActive = () =>
  document.documentElement.hasAttribute('data-darkreader-scheme');
```

The catch: Dark Reader injects asynchronously after the page loads. If you check at `DOMContentLoaded`, you'll often check before DR has done anything. A simple `setTimeout` workaround is fragile — network speed, extension load order, and browser quirks all affect timing.

The right event to catch these changes is called a `MutationObserver`. It watches the DOM for changes and fires a callback the instant Dark Reader adds or removes its attribute — no polling, no race conditions, NO EXCUSES!

---

## The Solution

Here's the complete dark mode toggle script with Dark Reader awareness built in:

```javascript
(function() {
  const themeToggle = document.getElementById('theme-toggle');
  const themeToggleText = document.getElementById('theme-toggle-text');
  const html = document.documentElement;

  const setTheme = (theme) => {
    if (theme === 'dark') {
      html.setAttribute('data-theme', 'dark');
      themeToggleText.textContent = 'Light';
      localStorage.setItem('theme', 'dark');
    } else {
      html.removeAttribute('data-theme');
      themeToggleText.textContent = 'Dark';
      localStorage.setItem('theme', 'light');
    }
  };

  // Restore saved preference on load
  setTheme(localStorage.getItem('theme') || 'light');

  themeToggle.addEventListener('click', () => {
    const current = html.getAttribute('data-theme');
    setTheme(current === 'dark' ? 'light' : 'dark');
  });

  // Hide our toggle if Dark Reader is active — it's already doing the job.
  // Use visibility:hidden instead of display:none to preserve layout spacing.
  const checkDarkReader = () => {
    const drActive = html.hasAttribute('data-darkreader-scheme');
    themeToggle.style.visibility = drActive ? 'hidden' : '';
  };

  checkDarkReader();

  new MutationObserver(checkDarkReader).observe(html, {
    attributes: true,
    attributeFilter: ['data-darkreader-scheme']
  });
})();
```

The key decisions:

**`attributeFilter: ['data-darkreader-scheme']`** — We're only watching for the one attribute we care about. Without this filter, the observer would fire on *any* attribute change to `<html>`, including our own `data-theme` toggles, causing unnecessary callbacks.

**`visibility: hidden` instead of `display: none`** — This is a subtle but important distinction. `display: none` removes the element from the layout flow entirely. If your toggle button is a flex child in your nav bar, hiding it with `display: none` collapses that slot and causes the remaining nav items to shift. `visibility: hidden` makes the element invisible while preserving its space in the layout — the nav stays perfectly centered regardless of whether the button is visible.

```css
/* What we want — button disappears, space remains */
themeToggle.style.visibility = 'hidden';  /* ✓ */

/* What we don't want — button disappears, nav shifts */
themeToggle.style.display = 'none';       /* ✗ */
```

---

## The HTML

Your toggle button just needs an ID and a text span to update:

```html
<button id="theme-toggle" aria-label="Toggle dark mode">
  <span id="theme-toggle-text">Dark</span>
</button>
```

When Dark Reader is active, the button is invisible but still in the DOM, still taking up space, and the `MutationObserver` is still watching. The moment a user disables Dark Reader, the observer fires, the button reappears, and your toggle is fully functional again.

---

## A Note on Accessibility

If you're building for an audience that includes people with photosensitivity or visual impairments, a well-implemented dark mode isn't just a nice-to-have — it's a courtesy. Dark Reader exists because browsers and operating systems were late to the party on system-level dark mode, and many sites still don't respect `prefers-color-scheme` at all.

The approach above respects the user's choice: if they've installed Dark Reader, they've made a deliberate decision about how they want to see the web. Your toggle doesn't fight them — it just quietly gets out of the way.

If you want to go further, you can also respect the system preference on first load by checking `prefers-color-scheme` before falling back to your saved `localStorage` value:

```javascript
const getInitialTheme = () => {
  const saved = localStorage.getItem('theme');
  if (saved) return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
};
```

Small things. Big difference for the people who need them.
