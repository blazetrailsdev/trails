/**
 * ESLint rule: manifest-complete
 *
 * Verifies that `models/index.ts` imports every model source file in the
 * same directory and that every relative import it contains points to a file
 * that actually exists. Reports a lint error per missing or stale entry so
 * editors and CI catch drift from hand-authored models without invoking the
 * CLI.
 *
 * NOT autofixable — writing is the CLI's job (`ar generate:manifest`).
 * Enable this rule in any project that has a `models/index.ts` manifest
 * (copy the rule file next to your eslint.config.mjs and import it directly):
 *
 *   // eslint.config.mjs in the user app
 *   import manifestComplete from "./eslint/manifest-complete.mjs";
 *   export default [
 *     {
 *       files: ["**\/models\/index.ts"],
 *       plugins: { blazetrails: { rules: { "manifest-complete": manifestComplete } } },
 *       rules: { "blazetrails/manifest-complete": "error" },
 *     },
 *   ];
 *
 * The rule is intentionally off-by-default in this repo — the trails
 * monorepo itself has no user-app models/ directory.
 *
 * Sync fs is used inside the rule body. ESLint synchronously processes files
 * and the async API is unavailable in rule `create()`; this is acceptable.
 */
import * as fs from "fs";
import * as path from "path";

/** Files in the models dir that count as model sources (mirrors generate-manifest.ts). */
function isModelFile(name) {
  return (
    name.endsWith(".ts") &&
    name !== "index.ts" &&
    !name.endsWith(".test.ts") &&
    !name.endsWith(".d.ts")
  );
}

/**
 * Resolve a relative import specifier to a bare filename, handling the ESM
 * `.js`-extension convention (source is `.ts` on disk).
 * Returns `undefined` for non-relative imports or nested paths.
 * Uses string ops (not path.*) because ESM specifiers always use `/`.
 */
function specifierToFile(specifier) {
  if (!specifier.startsWith("./")) return undefined;
  const rest = specifier.slice(2); // strip "./"
  // Nested paths (./sub/x.js) are not model files in a flat models/ dir.
  if (rest.includes("/")) return undefined;
  return rest.replace(/\.js$/, ".ts");
}

const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Verify that `models/index.ts` imports every model file in the models directory and that all relative imports point to existing files. Run `ar generate:manifest` to regenerate.",
    },
    fixable: null,
    schema: [],
    messages: {
      missingImport:
        "Model file `{{file}}` is not imported in models/index.ts. Run `ar generate:manifest` to update.",
      staleImport:
        "models/index.ts imports `{{specifier}}` but `{{file}}` does not exist in the models directory. Run `ar generate:manifest` to update.",
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename?.();
    if (!filename) return {};

    // Only run on the manifest file itself.
    const norm = filename.replace(/\\/g, "/");
    if (!norm.endsWith("/models/index.ts")) return {};

    const modelsDir = path.dirname(filename);

    // Read model files from disk once per lint run (sync: required for ESLint rules).
    let modelFiles;
    try {
      modelFiles = new Set(fs.readdirSync(modelsDir).filter(isModelFile).sort());
    } catch {
      // Directory unreadable — skip silently rather than crashing the lint run.
      return {};
    }

    // Track which model files are covered by an import declaration.
    const importedFiles = new Set();
    const importedSpecifiers = new Map(); // specifier → node

    return {
      ImportDeclaration(node) {
        const specifier = node.source?.value;
        if (typeof specifier !== "string") return;
        const file = specifierToFile(specifier);
        if (!file) return;
        importedSpecifiers.set(specifier, node);
        importedFiles.add(file);
      },

      "Program:exit"(program) {
        // Missing: model file exists but is not imported.
        for (const file of modelFiles) {
          if (!importedFiles.has(file)) {
            context.report({ node: program, messageId: "missingImport", data: { file } });
          }
        }
        // Stale: imported but no corresponding file on disk.
        for (const [specifier, node] of importedSpecifiers) {
          const file = specifierToFile(specifier);
          if (file && !modelFiles.has(file)) {
            context.report({ node, messageId: "staleImport", data: { specifier, file } });
          }
        }
      },
    };
  },
};

export default rule;
