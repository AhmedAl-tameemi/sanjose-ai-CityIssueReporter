---
name: Dependency-free tests
description: Testing approach for focused unit coverage in the workspace's Node-based artifacts.
---

Use Node's built-in test runner for focused validation and storage-contract tests. Add a browser or DOM test framework only when the requirement depends on rendered interaction or browser-only behavior.

**Why:** The workspace has no standard test framework, and small pure tests can run under its existing Node runtime without introducing test-only dependencies.

**How to apply:** Prefer extracting pure boundary logic or persistence contracts for testability; use a DOM/browser harness when those tests would not cover the requested behavior.

Modules imported directly by Node's strip-only TypeScript runner must use
erasable syntax, not constructor parameter properties or enums.

**Why:** Strip-only execution does not transpile syntax that generates runtime
JavaScript, even when the same source typechecks and bundles successfully.

**How to apply:** Use declared fields and constructor assignments in directly
imported test targets, or bundle an integration fixture with the existing esbuild.