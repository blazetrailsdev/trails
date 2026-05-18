import type { TscPlugin, VirtualizeOutput } from "@blazetrails/trails-tsc";
import { virtualize } from "../type-virtualization/virtualize.js";
import { resolveAutoImports } from "./auto-import.js";
import type { SchemaColumnValue } from "../type-virtualization/synthesize.js";

const STATIC_BLOCK_PATTERN = /\bstatic\s*\{/;
// Cheap pre-filter for files using top-level `include(...)` from
// `@blazetrails/activesupport`. False positives just cost a parse
// the walker will reject; false negatives would silently lose the
// interface merge. We require a line whose first non-whitespace
// token is `include(` AND a named import binding the local name
// `include` from `@blazetrails/activesupport`.
const INCLUDE_CALL_PATTERN = /^\s*include\s*\(/m;
const ACTIVESUPPORT_INCLUDE_IMPORT_PATTERN =
  /import\s*\{[^}]*\binclude\b(?!\s+as\s+(?!include\b))[^}]*\}\s*from\s*["']@blazetrails\/activesupport["']/;

export interface ArModelsPluginOptions {
  /**
   * Names of base classes whose `extends` chain triggers
   * virtualization (typically discovered by walking the transitive
   * extends graph in a preliminary plain-program pass).
   */
  baseNames: readonly string[];
  /**
   * Map of model class name → absolute file path. Used to inject
   * `import type` lines for association targets not already in scope.
   */
  modelRegistry: ReadonlyMap<string, string>;
  /** Schema columns keyed by table name; drives schema-only declares. */
  schemaColumnsByTable?: Readonly<Record<string, Readonly<Record<string, SchemaColumnValue>>>>;
}

/**
 * The AR `ar-models` plugin: walks each `.ts` file, and for classes
 * extending a registered Base, synthesizes `declare <col>: <type>`
 * lines from association/enum/schema metadata. Also prepends
 * `import type { Target }` for unresolved association targets and
 * appends an interface-merge declaration for `include(...)` mixin
 * use sites.
 */
export function createArModelsPlugin(opts: ArModelsPluginOptions): TscPlugin {
  const { baseNames, modelRegistry, schemaColumnsByTable } = opts;
  const baseNameSet = new Set(baseNames);
  const hasSchemaColumns = schemaColumnsByTable && Object.keys(schemaColumnsByTable).length > 0;
  const EXTENDS_IDENT = /\bextends\s+([\w$]+)/g;

  function shouldVirtualize(text: string): boolean {
    // Files using `include()` need the interface-merge appendix even
    // when they don't extend Base — utility classes mixing in plain
    // modules go through the same path.
    if (INCLUDE_CALL_PATTERN.test(text) && ACTIVESUPPORT_INCLUDE_IMPORT_PATTERN.test(text)) {
      return true;
    }
    // Fast-path skip for files that don't reference a Base-like
    // class. When schema columns are available, a class extending
    // Base may need declares even without a `static {}` block — so
    // the static-block pre-filter only applies when no schema info
    // is present.
    if (!hasSchemaColumns && !STATIC_BLOCK_PATTERN.test(text)) return false;
    EXTENDS_IDENT.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = EXTENDS_IDENT.exec(text))) {
      if (baseNameSet.has(match[1]!)) return true;
    }
    return false;
  }

  return {
    name: "ar-models",
    // Cover every TypeScript source extension. The previous AR host
    // didn't filter by extension at all; `shouldVirtualize` handles
    // content-based exclusion (e.g. .d.ts declaration files).
    extensions: [".ts", ".tsx", ".mts", ".cts"],
    virtualize(filePath, source): VirtualizeOutput | null {
      if (!shouldVirtualize(source)) return null;
      const prependImports = resolveAutoImports(source, filePath, modelRegistry, baseNames);
      const result = virtualize(source, filePath, {
        baseNames,
        prependImports,
        schemaColumnsByTable,
      });
      return { ts: result.text, deltas: result.deltas };
    },
  };
}
