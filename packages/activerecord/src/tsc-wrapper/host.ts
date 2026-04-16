import ts from "typescript";
import * as path from "node:path";
import { virtualize, type VirtualizeResult } from "../type-virtualization/virtualize.js";
import { resolveAutoImports } from "./auto-import.js";

const STATIC_BLOCK_PATTERN = /\bstatic\s*\{/;

export interface TrailsCompilerHost extends ts.CompilerHost {
  getDeltasForFile(fileName: string): VirtualizeResult["deltas"] | undefined;
  getOriginalText(fileName: string): string | undefined;
}

export function buildCompilerHost(
  options: ts.CompilerOptions,
  baseNames?: readonly string[],
  modelRegistry?: ReadonlyMap<string, string>,
): TrailsCompilerHost {
  // Incremental host seeds `createHash` and attaches file versions —
  // required by `ts.createEmitAndSemanticDiagnosticsBuilderProgram`
  // (used by `--build`) and harmless for plain `createProgram`.
  const baseHost = ts.createIncrementalCompilerHost(options);
  const deltaMap = new Map<string, VirtualizeResult["deltas"]>();
  const virtualizedTextCache = new Map<string, string>();
  const originalTextCache = new Map<string, string>();

  const baseNameSet = new Set(baseNames ?? ["Base"]);
  // Match valid JS/TS identifiers (including $) after `extends`.
  const EXTENDS_IDENT = /\bextends\s+([\w$]+)/g;

  function shouldVirtualize(text: string): boolean {
    if (!STATIC_BLOCK_PATTERN.test(text)) return false;
    EXTENDS_IDENT.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = EXTENDS_IDENT.exec(text))) {
      if (baseNameSet.has(match[1]!)) return true;
    }
    return false;
  }

  function getVirtualizedText(resolved: string): string | undefined {
    if (virtualizedTextCache.has(resolved)) return virtualizedTextCache.get(resolved)!;
    const originalText = baseHost.readFile(resolved);
    if (originalText == null) return undefined;
    if (!shouldVirtualize(originalText)) {
      virtualizedTextCache.set(resolved, originalText);
      return originalText;
    }
    const prependImports = modelRegistry
      ? resolveAutoImports(originalText, resolved, modelRegistry, baseNames)
      : undefined;
    const result = virtualize(originalText, resolved, { baseNames, prependImports });
    virtualizedTextCache.set(resolved, result.text);
    originalTextCache.set(resolved, originalText);
    deltaMap.set(resolved, result.deltas);
    return result.text;
  }

  const sourceFileCache = new Map<string, ts.SourceFile>();

  const host: TrailsCompilerHost = {
    ...baseHost,

    getSourceFile(fileName, languageVersionOrOptions, onError, shouldCreateNewSourceFile) {
      const resolved = path.resolve(fileName);

      // In watch/incremental mode, shouldCreateNewSourceFile signals
      // that the file changed on disk. Flush all caches for this path
      // so we re-read, re-virtualize, and re-parse.
      if (shouldCreateNewSourceFile) {
        virtualizedTextCache.delete(resolved);
        originalTextCache.delete(resolved);
        deltaMap.delete(resolved);
        sourceFileCache.delete(resolved);
      }

      const text = getVirtualizedText(resolved);
      if (text == null) {
        return baseHost.getSourceFile(
          fileName,
          languageVersionOrOptions,
          onError,
          shouldCreateNewSourceFile,
        );
      }
      if (sourceFileCache.has(resolved)) {
        return sourceFileCache.get(resolved)!;
      }
      const sf = ts.createSourceFile(resolved, text, languageVersionOrOptions, true);
      // `ts.EmitAndSemanticDiagnosticsBuilderProgram` (used by
      // `--build`) asserts every source file has a `version`. When
      // we produce our own virtualized SourceFile we must set it
      // ourselves — hash the virtualized text so re-parsing
      // identical text stays cache-stable.
      (sf as ts.SourceFile & { version: string }).version = baseHost.createHash
        ? baseHost.createHash(text)
        : djb2Hash(text);
      sourceFileCache.set(resolved, sf);
      return sf;
    },

    readFile(fileName) {
      return getVirtualizedText(path.resolve(fileName)) ?? baseHost.readFile(fileName);
    },

    getDeltasForFile(fileName) {
      return deltaMap.get(path.resolve(fileName));
    },

    getOriginalText(fileName) {
      return originalTextCache.get(path.resolve(fileName));
    },
  };

  return host;
}

/**
 * djb2 string hash — content-sensitive fallback used for
 * `SourceFile.version` when the base host doesn't expose a hash
 * function. Not cryptographic, but distinguishes texts of the same
 * length (unlike `String(text.length)`), so the incremental
 * builder doesn't reuse stale SourceFiles for edits that don't
 * change length.
 */
function djb2Hash(text: string): string {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36) + ":" + text.length;
}
