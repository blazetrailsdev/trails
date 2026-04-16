// Pure text-transform that turns a user-authored model source into a
// virtualized version with `declare` members spliced into each affected
// class body. No on-disk output; no `ts.Program` or `TypeChecker`
// dependency.
//
// Shells (the trails-tsc CLI and the tsserver plugin) call this and hand
// the result back to the compiler / language service. Tests exercise it
// directly against fixture pairs.

import ts from "typescript";
import { walk, type WalkOptions } from "./walker.js";
import { synthesizeDeclares } from "./synthesize.js";

export interface LineDelta {
  /**
   * 0-indexed line in the ORIGINAL source where the injected block begins.
   * Diagnostics reported at line > insertedAtLine + lineCount map back by
   * subtracting lineCount.
   */
  insertedAtLine: number;
  /** Number of lines the injected block spans. */
  lineCount: number;
}

export interface VirtualizeResult {
  text: string;
  deltas: LineDelta[];
}

export type VirtualizeOptions = WalkOptions;

export function virtualize(
  originalText: string,
  fileName: string,
  options: VirtualizeOptions = {},
): VirtualizeResult {
  const sf = ts.createSourceFile(fileName, originalText, ts.ScriptTarget.ES2022, true);
  const classes = walk(sf, options);

  interface Edit {
    pos: number;
    text: string;
    originalLine: number;
    lineCount: number;
  }
  const edits: Edit[] = [];

  for (const info of classes) {
    if (info.skip) continue;
    if (info.openBracePos < 0) continue;
    const decls = synthesizeDeclares(info);
    if (decls.length === 0) continue;
    const block = "\n" + decls.join("\n") + "\n";
    edits.push({
      pos: info.openBracePos,
      text: block,
      originalLine: sf.getLineAndCharacterOfPosition(info.openBracePos).line,
      lineCount: decls.length + 1, // leading newline + one per decl
    });
  }

  edits.sort((a, b) => b.pos - a.pos);

  let text = originalText;
  for (const e of edits) {
    text = text.slice(0, e.pos) + e.text + text.slice(e.pos);
  }

  const deltas: LineDelta[] = edits
    .slice()
    .sort((a, b) => a.originalLine - b.originalLine)
    .map((e) => ({ insertedAtLine: e.originalLine, lineCount: e.lineCount }));

  return { text, deltas };
}

/**
 * Given a line number in the virtualized text, returns the corresponding
 * line in the ORIGINAL source — or `null` if the position is inside an
 * injected block.
 */
export function remapLine(virtualLine: number, deltas: readonly LineDelta[]): number | null {
  let line = virtualLine;
  for (let i = deltas.length - 1; i >= 0; i--) {
    const d = deltas[i];
    if (!d) continue;
    const injectedStart = d.insertedAtLine;
    const injectedEnd = d.insertedAtLine + d.lineCount;
    if (line > injectedEnd) {
      line -= d.lineCount;
    } else if (line > injectedStart && line <= injectedEnd) {
      return null;
    }
  }
  return line;
}
