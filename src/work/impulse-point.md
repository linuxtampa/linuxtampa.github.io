---
layout: base.njk
title: "Impulse Point — SafeConnect (2016–2017)"
description: Migrated 130+ Subversion repositories to Git and modernized the build pipeline for a network access control product.
---

# Impulse Point — SafeConnect (2016–2017)

Impulse Point made [SafeConnect](https://roi4cio.com/catalog/product/impulse-safeconnect), a network access control product deployed as a 1U rackmount server at client sites. Day one set the tone:

> "Here's a Dell workstation with 16G and 1TB drive. Configure it any way you want."

An hour later: Kubuntu Linux, all dev tools, company repos cloned and building locally. A Linux geek's dream.

## Stack

- **Frontend:** Angular 1.x (predates the modern TypeScript-based Angular)
- **Backend:** Java/WAR deployed on Tomcat (RHEL 7 packaged version)
- **Build:** Atlassian Bamboo, producing RPM packages hosted on a public RPM repo
- **Deployment:** Client sites updated via standard `yum upgrade`

## SVN → Git Migration

When I joined in 2016, Impulse Point's code was in Subversion. They wanted to move to Git and hosted Atlassian Bitbucket. Having done svn→git migrations previously at Syniverse, I was a natural fit for the task.

I wrote a bash script that walked each of their **130+ repositories** through the full migration process automatically. One script, 130 repos, done.

The real win wasn't just the migration itself — it was gaining access to the entire ecosystem of Git-based tooling that the rest of the industry had already moved to. Nobody was building integrations for SVN anymore.  And even git's competition like perforce & mercurial are all-but-forgotten now.

[&larr; Back to Work](/work/)
