#!/usr/bin/env bash
set -euo pipefail

webkit_executable="${PLAYWRIGHT_WEBKIT_EXECUTABLE:?Playwright WebKit executable path is required}"
webkit_root="$(dirname "$webkit_executable")/minibrowser-wpe"
if [[ ! -x "$webkit_root/bin/MiniBrowser" ]]; then
  exec "$webkit_executable" "$@"
fi

export WEBKIT_EXEC_PATH="$webkit_root/bin"
export WEBKIT_INJECTED_BUNDLE_PATH="$webkit_root/lib"
export WEBKIT_INSPECTOR_RESOURCES_PATH="$webkit_root/share"
export WEBKIT_FORCE_COMPLEX_TEXT=1

# GLVND's normal /usr/share vendor search does not include Nix's Mesa.
# Prefer the configured Mesa over an inherited vendor from a different runtime
# version. Mixing those versions can make WebKit's page process abort.
if [[ -n "${REPLIT_LD_LIBRARY_PATH:-}" ]]; then
  IFS=: read -ra library_dirs <<< "${REPLIT_LD_LIBRARY_PATH:-}:${LD_LIBRARY_PATH:-}"
  for directory in "${library_dirs[@]}"; do
    vendor="$directory/../share/glvnd/egl_vendor.d/50_mesa.json"
    if [[ -f "$vendor" ]]; then
      export __EGL_VENDOR_LIBRARY_FILENAMES="$(readlink -f "$vendor")"
      break
    fi
  done
  # The native libraries alone are insufficient: GLib and GStreamer normally
  # discover their TLS/codec plugins in conventional system directories.
  for directory in "${library_dirs[@]}"; do
    scanner="$directory/../libexec/gstreamer-1.0/gst-plugin-scanner"
    if [[ -x "$scanner" ]]; then
      export GST_PLUGIN_SCANNER="$(readlink -f "$scanner")"
    fi
    if [[ -d "$directory/gstreamer-1.0" ]]; then
      export GST_PLUGIN_SYSTEM_PATH="${GST_PLUGIN_SYSTEM_PATH:+$GST_PLUGIN_SYSTEM_PATH:}$directory/gstreamer-1.0"
    fi
    if [[ -f "$directory/gio/modules/libgiognutls.so" ]]; then
      export GIO_EXTRA_MODULES="${GIO_EXTRA_MODULES:+$GIO_EXTRA_MODULES:}$directory/gio/modules"
    fi
  done
fi

extra_library_path="${WEBKIT_EXTRA_LIBRARY_PATH:-}"
atomic_library_path=""
if [[ -d /nix/store ]]; then
  atomic_library_path="$(
    for library in /nix/store/*-gcc-*-lib/lib/libatomic.so.1; do
      [[ -f "$library" ]] || continue
      package="${library#*-gcc-}"
      version="${package%%-lib/*}"
      [[ "$version" =~ ^[0-9] ]] || continue
      printf '%s\t%s\n' "$version" "$(dirname "$library")"
    done | sort -V | tail -n 1 | cut -f 2
  )"
fi
if [[ -z "$extra_library_path" && -d /nix/store ]]; then
  extra_library_path="$(
    for library in /nix/store/*-harfbuzz-icu-*/lib/libharfbuzz-icu.so.0; do
      [[ -f "$library" ]] || continue
      package="${library#*-harfbuzz-icu-}"
      version="${package%%/*}"
      printf '%s\t%s\n' "$version" "$(dirname "$library")"
    done | sort -V | tail -n 1 | cut -f 2
  )"
fi
export LD_LIBRARY_PATH="$webkit_root/lib:$webkit_root/sys/lib:${REPLIT_LD_LIBRARY_PATH:-}:$extra_library_path:$atomic_library_path:${LD_LIBRARY_PATH:-}"

exec "$webkit_root/bin/MiniBrowser" "$@"