import ts from "typescript";
import * as path from "node:path";
import { remapLine } from "../type-virtualization/virtualize.js";
import type { TrailsCompilerHost } from "./host.js";

/**
 * Remap diagnostics from virtualized-source coordinates back to the
 * user's original source. For each diagnostic in a virtualized file,
 * creates a SourceFile from the original (non-virtualized) text and
 * computes the correct position, so ts.formatDiagnostics shows the
 * user's real line numbers.
 */
export function remapDiagnostics(
  diagnostics: readonly ts.Diagnostic[],
  host: TrailsCompilerHost,
): ts.Diagnostic[] {
  const originalSfCache = new Map<string, ts.SourceFile>();
  return diagnostics.map((d) => remapOneDiagnostic(d, host, originalSfCache));
}

function getOrCreateOriginalSf(
  resolved: string,
  virtualSf: ts.SourceFile,
  host: TrailsCompilerHost,
  cache: Map<string, ts.SourceFile>,
): ts.SourceFile | undefined {
  if (cache.has(resolved)) return cache.get(resolved)!;
  const originalText = host.getOriginalText(resolved);
  if (originalText == null) return undefined;
  const sf = ts.createSourceFile(virtualSf.fileName, originalText, virtualSf.languageVersion, true);
  cache.set(resolved, sf);
  return sf;
}

function remapOneDiagnostic(
  d: ts.Diagnostic,
  host: TrailsCompilerHost,
  originalSfCache: Map<string, ts.SourceFile>,
): ts.Diagnostic {
  // Always remap relatedInformation entries — they may point into
  // virtualized files even when the parent diagnostic doesn't.
  const remappedRelated = d.relatedInformation?.map(
    (ri) =>
      remapOneDiagnostic(
        ri as ts.Diagnostic,
        host,
        originalSfCache,
      ) as ts.DiagnosticRelatedInformation,
  );

  if (!d.file || d.start == null) {
    return remappedRelated ? { ...d, relatedInformation: remappedRelated } : d;
  }

  const resolved = path.resolve(d.file.fileName);
  const deltas = host.getDeltasForFile(resolved);
  if (!deltas || deltas.length === 0) {
    return remappedRelated ? { ...d, relatedInformation: remappedRelated } : d;
  }

  const virtualSf = d.file;
  const { line: virtualLine, character } = virtualSf.getLineAndCharacterOfPosition(d.start);
  const originalLine = remapLine(virtualLine, deltas);
  if (originalLine === null || originalLine === virtualLine) {
    return remappedRelated ? { ...d, relatedInformation: remappedRelated } : d;
  }

  const originalSf = getOrCreateOriginalSf(resolved, virtualSf, host, originalSfCache);
  if (!originalSf) {
    return remappedRelated ? { ...d, relatedInformation: remappedRelated } : d;
  }

  const newStart = originalSf.getPositionOfLineAndCharacter(originalLine, character);

  return {
    ...d,
    file: originalSf,
    start: newStart,
    ...(remappedRelated ? { relatedInformation: remappedRelated } : {}),
  };
}
