import ts from "typescript";
import * as path from "node:path";
import type { LineDelta, TscPlugin } from "./plugin.js";

export interface PluginCompilerHost extends ts.CompilerHost {
  /** Line-delta records for a virtualized file, if any. */
  getDeltasForFile(fileName: string): readonly LineDelta[] | undefined;
  /** Original (pre-virtualized) text for a file the host rewrote. */
  getOriginalText(fileName: string): string | undefined;
}

/**
 * Build a `ts.CompilerHost` that routes every source file through the
 * registered plugins. The first plugin whose `extensions` match and
 * whose `virtualize()` returns a non-null result wins for that file;
 * files that match no plugin pass through unchanged. Virtualized text
 * and original text are cached per resolved path so the diagnostic
 * remapper can recover user coordinates without re-reading disk.
 */
export function buildPluginHost(
  options: ts.CompilerOptions,
  plugins: readonly TscPlugin[],
): PluginCompilerHost {
  const baseHost = ts.createIncrementalCompilerHost(options);
  const virtualizedTextCache = new Map<string, string>();
  const originalTextCache = new Map<string, string>();
  const deltaMap = new Map<string, readonly LineDelta[]>();
  const sourceFileCache = new Map<string, ts.SourceFile>();

  const pluginsByExt = new Map<string, TscPlugin[]>();
  for (const p of plugins) {
    for (const ext of p.extensions) {
      const list = pluginsByExt.get(ext) ?? [];
      list.push(p);
      pluginsByExt.set(ext, list);
    }
  }

  function getVirtualizedText(resolved: string): string | undefined {
    if (virtualizedTextCache.has(resolved)) return virtualizedTextCache.get(resolved)!;
    const originalText = baseHost.readFile(resolved);
    if (originalText == null) return undefined;
    const ext = extensionOf(resolved);
    const candidates = pluginsByExt.get(ext);
    if (!candidates) {
      virtualizedTextCache.set(resolved, originalText);
      return originalText;
    }
    for (const plugin of candidates) {
      const result = plugin.virtualize(resolved, originalText);
      if (!result) continue;
      virtualizedTextCache.set(resolved, result.ts);
      originalTextCache.set(resolved, originalText);
      if (result.deltas && result.deltas.length > 0) {
        deltaMap.set(resolved, result.deltas);
      }
      return result.ts;
    }
    virtualizedTextCache.set(resolved, originalText);
    return originalText;
  }

  const host: PluginCompilerHost = {
    ...baseHost,

    getSourceFile(fileName, languageVersionOrOptions, onError, shouldCreateNewSourceFile) {
      const resolved = path.resolve(fileName);
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
      if (sourceFileCache.has(resolved)) return sourceFileCache.get(resolved)!;
      const sf = ts.createSourceFile(resolved, text, languageVersionOrOptions, true);
      // `ts.EmitAndSemanticDiagnosticsBuilderProgram` asserts every
      // source file has a `version`; supply one ourselves.
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

function extensionOf(filePath: string): string {
  // Return everything from the first dot in the basename so plugins
  // can claim compound suffixes (`.tse.ts`, `.d.ts`) directly.
  const base = path.basename(filePath);
  const dot = base.indexOf(".");
  return dot === -1 ? "" : base.slice(dot);
}

/** djb2 fallback when the base host doesn't expose `createHash`. */
function djb2Hash(text: string): string {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36) + ":" + text.length;
}
