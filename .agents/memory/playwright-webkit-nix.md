---
name: Playwright WebKit on Replit
description: Running Playwright's Linux WebKit engine in Replit's Nix environment
---

For headless Playwright WebKit on Replit, launch the bundled WPE MiniBrowser with both its own libraries and Replit's Nix library paths. Playwright's wrapper can replace `LD_LIBRARY_PATH`, hiding host libraries that are installed and available to other processes. The WebKit bundle may also require `harfbuzz-icu` and `libatomic.so.1` resolved directly from Nix store paths.

**Why:** The browser bundle expects a conventional Linux host library layout, while Replit provides libraries through Nix; installing WebKit alone does not guarantee that its native dependencies are visible to the nested launcher.

**How to apply:** Keep WebKit's test-only launcher and Nix dependencies together when adding Playwright WebKit coverage in a Linux Replit workspace. If MiniBrowser still fails to start, inspect its missing libraries and expose the required Nix store directories to the launcher. Chromium's launch setup does not establish that WebKit can launch.