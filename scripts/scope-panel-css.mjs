// Scope the shared panel stylesheet (@as-one/panel-ui/src/styles.css) so it can
// be inlined into the DSH client bundle without leaking into the host shell.
//
// Rules:
//   - every selector gets the `.asone-panel` ancestor prefix
//   - `:root` becomes `.asone-panel` (CSS variables live on the panel root)
//   - `html` / `body` / `#root` parts are rewritten to `.asone-panel`
//   - `@keyframes` bodies are left untouched
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/** Resolve postcss from the workspace .pnpm store (it is a vite transitive dep). */
function loadPostcss() {
  const candidates = [
    "../node_modules/postcss/lib/postcss.js",
    "../../../node_modules/.pnpm/postcss@8.5.30/node_modules/postcss/lib/postcss.js",
    "../../node_modules/.pnpm/postcss@8.5.30/node_modules/postcss/lib/postcss.js",
    "../../../node_modules/postcss/lib/postcss.js",
  ];
  for (const c of candidates) {
    try {
      return require(c);
    } catch {}
  }
  throw new Error("postcss not found — run pnpm install at the workspace root first");
}

const postcss = loadPostcss();

function scopeSelector(selector, scope) {
  const s = selector.trim();
  if (s === "") return null;
  if (s === ":root") return scope;
  const head = /^(html|body|#root)\b/.exec(s);
  if (head !== null) {
    const rest = s.slice(head[0].length).trim();
    return rest === "" ? scope : `${scope} ${rest}`;
  }
  if (s.startsWith(scope)) return s;
  return `${scope} ${s}`;
}

/**
 * @param {string} css raw stylesheet text
 * @param {string} [scope] ancestor class, default `.asone-panel`
 * @returns {string} scoped stylesheet
 */
export function scopePanelCss(css, scope = ".asone-panel") {
  const root = postcss.parse(css);
  root.walkRules((rule) => {
    const parent = rule.parent;
    if (parent !== undefined && parent.type === "atrule" && /keyframes$/i.test(parent.name)) {
      return;
    }
    const scoped = rule.selectors
      .map((sel) => scopeSelector(sel, scope))
      .filter((sel) => sel !== null);
    if (scoped.length === 0) {
      rule.remove();
      return;
    }
    rule.selectors = scoped;
  });
  return root.toString();
}
