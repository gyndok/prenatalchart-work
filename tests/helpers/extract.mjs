import { readFileSync } from "node:fs";

const bundlePath = new URL(
  "../../extracted/out/renderer/assets/index-DU3ZcdpM.js",
  import.meta.url
);
const bundle = readFileSync(bundlePath, "utf-8");

// Slice top-level `function name(...) { ... }` blocks out of the
// pretty-printed bundle (body ends at the first column-0 `}`) and
// evaluate them together so they can call each other.
export function extractFunctions(...names) {
  const src = names
    .map((name) => {
      const re = new RegExp(`^function ${name}\\([\\s\\S]*?^\\}`, "m");
      const m = bundle.match(re);
      if (!m) throw new Error(`function ${name} not found in bundle`);
      return m[0];
    })
    .join("\n");
  return new Function(`${src}; return { ${names.join(", ")} };`)();
}

export function bundleSource() {
  return bundle;
}
