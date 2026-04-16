import ts from "typescript";
import * as path from "node:path";
import { virtualize, type VirtualizeResult } from "../type-virtualization/virtualize.js";

const BASE_PATTERN = /\bextends\s+Base\b/;
const STATIC_BLOCK_PATTERN = /\bstatic\s*\{/;

export interface TrailsCompilerHost extends ts.CompilerHost {
  getDeltasForFile(fileName: string): VirtualizeResult["deltas"] | undefined;
  getOriginalText(fileName: string): string | undefined;
}

export function buildCompilerHost(options: ts.CompilerOptions): TrailsCompilerHost {
  const baseHost = ts.createCompilerHost(options, true);
  const deltaMap = new Map<string, VirtualizeResult["deltas"]>();
  const virtualizedTextCache = new Map<string, string>();
  const originalTextCache = new Map<string, string>();

  function shouldVirtualize(text: string): boolean {
    return BASE_PATTERN.test(text) && STATIC_BLOCK_PATTERN.test(text);
  }

  function getVirtualizedText(resolved: string): string | undefined {
    if (virtualizedTextCache.has(resolved)) return virtualizedTextCache.get(resolved)!;
    const originalText = baseHost.readFile(resolved);
    if (originalText == null) return undefined;
    if (!shouldVirtualize(originalText)) {
      virtualizedTextCache.set(resolved, originalText);
      return originalText;
    }
    const result = virtualize(originalText, resolved);
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
