import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));

const binding = typeof process.versions.bun === "string"
  // Support `bun build --compile` by being statically analyzable enough to find the .node file at build-time
  ? await import(`${root}/prebuilds/${process.platform}-${process.arch}/tree-sitter-logrotate.node`)
  : (await import("node-gyp-build")).default(root);

const stateLanguage = { language: binding.stateLanguage };

try {
  const nodeTypes = await import(`${root}/src/node-types.json`, { with: { type: "json" } });
  binding.nodeTypeInfo = nodeTypes.default;
} catch { }

try {
  const nodeTypes = await import(`${root}/src/state/src/node-types.json`, { with: { type: "json" } });
  stateLanguage.nodeTypeInfo = nodeTypes.default;
} catch { }

const queries = [
  ["HIGHLIGHTS_QUERY", `${root}/queries/highlights.scm`],
  ["INJECTIONS_QUERY", `${root}/queries/injections.scm`],
  ["LOCALS_QUERY", `${root}/queries/locals.scm`],
  ["TAGS_QUERY", `${root}/queries/tags.scm`],
];

for (const [prop, path] of queries) {
  Object.defineProperty(binding, prop, {
    configurable: true,
    enumerable: true,
    get() {
      delete binding[prop];
      try {
        binding[prop] = readFileSync(path, "utf8");
      } catch { }
      return binding[prop];
    }
  });
}

Object.defineProperty(stateLanguage, "HIGHLIGHTS_QUERY", {
  configurable: true,
  enumerable: true,
  get() {
    delete stateLanguage.HIGHLIGHTS_QUERY;
    try {
      stateLanguage.HIGHLIGHTS_QUERY = readFileSync(`${root}/src/state/queries/highlights.scm`, "utf8");
    } catch { }
    return stateLanguage.HIGHLIGHTS_QUERY;
  }
});

export { stateLanguage };
export default binding;
