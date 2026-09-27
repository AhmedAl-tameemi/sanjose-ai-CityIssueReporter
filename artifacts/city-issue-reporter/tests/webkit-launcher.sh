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

extra_library_path="${WEBKIT_EXTRA_LIBRARY_PATH:-}"
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
export LD_LIBRARY_PATH="$webkit_root/lib:$webkit_root/sys/lib:${REPLIT_LD_LIBRARY_PATH:-}:$extra_library_path:${LD_LIBRARY_PATH:-}"

exec "$webkit_root/bin/MiniBrowser" "$@"