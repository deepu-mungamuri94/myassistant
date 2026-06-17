#!/usr/bin/env bash
#
# Vendor all third-party front-end dependencies locally so the app works
# fully offline (no cdn.tailwindcss.com / jsdelivr at runtime).
#
# Run this ONCE from the project root after cloning, and again whenever you
# bump a pinned version below:
#
#     bash www/vendor/download-vendors.sh
#
# Then build/sync as usual (npx cap sync android). The files land in www/vendor/
# and are referenced by www/index.html.
#
set -euo pipefail

# Resolve paths relative to this script so it works from any CWD.
VENDOR_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${VENDOR_DIR}/../.." && pwd)"
NM="${ROOT_DIR}/node_modules"

echo "→ Vendoring into ${VENDOR_DIR}"

fetch() {
  local url="$1" out="$2"
  echo "  • ${out}"
  curl -fsSL "${url}" -o "${VENDOR_DIR}/${out}"
}

# --- CDN-only libraries (pinned versions) ---
fetch "https://cdn.tailwindcss.com"                                                          "tailwindcss.js"
fetch "https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js"                              "marked.min.js"
fetch "https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"                     "chart.umd.min.js"
fetch "https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2.2.0/dist/chartjs-plugin-datalabels.min.js" "chartjs-plugin-datalabels.min.js"

# --- Capacitor ES modules (copied from node_modules; run `npm install` first) ---
if [ -f "${NM}/@capacitor/core/dist/index.js" ]; then
  echo "  • capacitor-core.esm.js"
  cp "${NM}/@capacitor/core/dist/index.js" "${VENDOR_DIR}/capacitor-core.esm.js"
else
  echo "  ! @capacitor/core not found in node_modules — run 'npm install' first" >&2
fi

# status-bar's dist/esm/index.js does `export * from './definitions'`, which
# breaks when loaded standalone from www/vendor (no sibling files). So we emit a
# self-contained module that inlines the Style/Animation enums and registers the
# plugin. `@capacitor/core` resolves via the import map in index.html.
echo "  • capacitor-status-bar.esm.js (self-contained)"
cat > "${VENDOR_DIR}/capacitor-status-bar.esm.js" <<'EOF'
// Vendored @capacitor/status-bar (self-contained for offline use).
// Combines dist/esm/index.js + dist/esm/definitions.js so there are no
// sibling-file imports at runtime. `@capacitor/core` resolves via the
// import map in index.html to ./vendor/capacitor-core.esm.js.
import { registerPlugin } from '@capacitor/core';

export var Style;
(function (Style) {
    Style["Dark"] = "DARK";
    Style["Light"] = "LIGHT";
    Style["Default"] = "DEFAULT";
})(Style || (Style = {}));

export var Animation;
(function (Animation) {
    Animation["None"] = "NONE";
    Animation["Slide"] = "SLIDE";
    Animation["Fade"] = "FADE";
})(Animation || (Animation = {}));

/** @deprecated Use `Animation`. */
export const StatusBarAnimation = Animation;
/** @deprecated Use `Style`. */
export const StatusBarStyle = Style;

const StatusBar = registerPlugin('StatusBar');
export { StatusBar };
EOF

echo "✓ Done. Vendored files:"
ls -la "${VENDOR_DIR}" | grep -E '\.(js)$' || true
