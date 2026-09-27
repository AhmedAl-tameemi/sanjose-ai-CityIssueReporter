---
name: Playwright WebKit on Replit
description: Running Playwright's Linux WebKit engine in Replit's Nix environment
---

For headless Playwright WebKit on Replit, launch the bundled WPE MiniBrowser with both its own libraries and Replit's Nix library paths. Playwright's wrapper can replace `LD_LIBRARY_PATH`, hiding host libraries that are installed and available to other processes. The WebKit bundle may also require a `harfbuzz-icu` library resolved directly from the Nix store.

**Why:** The browser bundle expects a conventional Linux host library layout, while Replit provides libraries through Nix; the nested launcher changes the search path.

**How to apply:** Keep WebKit's test-only launcher and Nix dependencies together when adding Playwright WebKit coverage in a Linux Replit workspace. Chromium's launch setup does not establish that WebKit can launch.