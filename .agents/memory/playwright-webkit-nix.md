---
name: Playwright WebKit on Replit
description: Running Playwright's Linux WebKit engine in Replit's Nix environment
---

For headless Playwright WebKit on Replit, launch the bundled WPE MiniBrowser with both its own libraries and Replit's Nix library paths. Playwright's wrapper can replace `LD_LIBRARY_PATH`, hiding host libraries that are installed and available to other processes. The WebKit bundle may also require `harfbuzz-icu` and `libatomic.so.1` resolved directly from Nix store paths.

**Why:** The browser bundle expects a conventional Linux host library layout, while Replit provides libraries through Nix; installing WebKit alone does not guarantee that its native dependencies are visible to the nested launcher.

**How to apply:** Keep WebKit's test-only launcher and Nix dependencies together when adding Playwright WebKit coverage in a Linux Replit workspace. If MiniBrowser still fails to start, inspect its missing libraries and expose the required Nix store directories to the launcher. Chromium's launch setup does not establish that WebKit can launch.

Keep dynamically discovered graphics, TLS, and codec plugins consistent with
the configured native-library runtime. An inherited graphics vendor from a
different Mesa version can launch the browser but abort every page process.
GStreamer needs its plugin scanner as well as plugin directories; native
libraries alone do not establish playback capability.

**Why:** Replit's inherited runtime and configured Nix packages can refer to
different versions. Missing TLS discovery, mismatched graphics discovery, and
missing codec discovery look like app or media failures even when the app and
fixture bytes are correct.

**How to apply:** Diagnose browser-native errors before changing advertised
formats. Resolve plugins from the same configured packages as their libraries,
and distinguish Linux WebKit results from real macOS/iOS Safari certification.