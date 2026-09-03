import type { TscPlugin, VirtualizeOutput } from "@blazetrails/trails-tsc";
import { virtualize } from "@blazetrails/activerecord/type-virtualization/virtualize.js";
import { resolveAutoImports } from "./auto-import.js";
import type { SchemaColumnValue } from "@blazetrails/activerecord/type-virtualization/synthesize.js";

const STATIC_BLOCK_PATTERN = /\bstatic\s*\{/;
const INCLUDE_CALL_PATTERN = /^\s*include\s*\(/m;
const ACTIVESUPPORT_INCLUDE_IMPORT_PATTERN =
  /import\s*\{[^}]*\binclude\b(?!\s+as\s+(?!include\b))[^}]*\}\s*from\s*["']@blazetrails\/activesupport["']/;

export interface ArModelsPluginOptions {
  baseNames: readonly string[];
  modelRegistry: ReadonlyMap<string, string>;
  schemaColumnsByTable?: Readonly<Record<string, Readonly<Record<string, SchemaColumnValue>>>>;
}

export function createArModelsPlugin(opts: ArModelsPluginOptions): TscPlugin {
  const { baseNames, modelRegistry, schemaColumnsByTable } = opts;
  const baseNameSet = new Set(baseNames);
  const hasSchemaColumns = schemaColumnsByTable && Object.keys(schemaColumnsByTable).length > 0;
  const EXTENDS_IDENT = /\bextends\s+([\w$]+)/g;

  function shouldVirtualize(text: string): boolean {
    if (INCLUDE_CALL_PATTERN.test(text) && ACTIVESUPPORT_INCLUDE_IMPORT_PATTERN.test(text)) {
      return true;
    }
    if (!hasSchemaColumns && !STATIC_BLOCK_PATTERN.test(text)) return false;
    EXTENDS_IDENT.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = EXTENDS_IDENT.exec(text))) {
      if (baseNameSet.has(match[1])) return true;
    }
    return false;
  }

  return {
    name: "ar-models",
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
