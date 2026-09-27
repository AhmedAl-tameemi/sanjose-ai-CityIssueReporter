---
name: Workspace-scoped package installs
description: Handling dependency installation in this pnpm monorepo.
---

When a dependency belongs to one artifact, keep it in that artifact's package manifest and lockfile importer. The managed language-package installer runs `pnpm add` at the workspace root and can fail with pnpm's root-add guard; it has no workspace-filter parameter.

**Why:** Installing a test-only dependency at the root makes it visible to unrelated workspace packages and weakens dependency ownership.

**How to apply:** Try the managed installer first. If the root guard blocks it, use a package-filtered pnpm add command for the owning workspace rather than forcing a root install.