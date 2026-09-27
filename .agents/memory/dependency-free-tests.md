---
name: Dependency-free tests
description: Testing approach for focused unit coverage in the workspace's Node-based artifacts.
---

Use Node's built-in test runner for focused validation and storage-contract tests. Add a browser or DOM test framework only when the requirement depends on rendered interaction or browser-only behavior.

**Why:** The workspace has no standard test framework, and small pure tests can run under its existing Node runtime without introducing test-only dependencies.

**How to apply:** Prefer extracting pure boundary logic or persistence contracts for testability; use a DOM/browser harness when those tests would not cover the requested behavior.