import { tokenize } from "@blazetrails/activesupport";
import { NotImplementedError } from "@blazetrails/ruby-compat";
import {
  hyphenPragma,
  rewriteHyphenNames,
  sourceOffset,
  type HyphenOptions,
} from "@blazetrails/tse-compiler";

export class LocationParsingError extends Error {
  override name = "LocationParsingError";
}

/** @noRailsEquivalent PERMANENT */
export interface BacktraceLocation {
  lineno: number;
  column?: number;
}

export interface Spot {
  snippet: string;
  firstLineno: number;
  lastLineno: number;
  firstColumn: number;
  lastColumn: number;
  scriptLines?: string[];
}

type OffsetToken = [name: string, str: string | null, offset: number];

export function sourceLines(source: string): string[] {
  if (source.length === 0) return [];
  return source.split(/(?<=\n)/);
}

function offsetSourceTokens(sourceTokens: [string, string][]): OffsetToken[] {
  let sourceOffset = 0;
  const withOffset: OffsetToken[] = [];
  for (const [name, str] of sourceTokens) {
    if (name === ":CODE" || name === ":TEXT") withOffset.push([name, str, sourceOffset]);
    sourceOffset += str.length;
  }
  withOffset.push([":EOS", null, sourceOffset]);
  return withOffset;
}

export function findOffset(
  compiled: string,
  sourceTokens: [string, string][],
  errorColumn: number,
  hyphenNames?: HyphenOptions | null,
): number {
  const tokens = offsetSourceTokens(sourceTokens);
  let pos = 0;

  for (let i = 0; i < tokens.length - 1; i++) {
    const [name, srcStr, offset] = tokens[i] as [string, string, number];
    const rewrite =
      name === ":CODE" && hyphenNames != null ? rewriteHyphenNames(srcStr, hyphenNames) : null;
    const str = rewrite?.code ?? srcStr;
    const [, nextStr] = tokens[i + 1];
    let matchedStr = false;

    while (pos < compiled.length) {
      if (matchedStr && nextStr != null && compiled.startsWith(nextStr, pos)) {
        break;
      } else if (compiled.startsWith(str, pos)) {
        matchedStr = true;
        if (name === ":CODE" && pos <= errorColumn && pos + str.length >= errorColumn) {
          return sourceOffset(rewrite?.edits ?? [], errorColumn - pos) + offset;
        }
        pos += str.length;
      } else {
        pos += 1;
      }
    }
  }

  throw new LocationParsingError("Couldn't find code snippet");
}

export function translateLocation(
  spot: Spot,
  backtraceLocation: BacktraceLocation,
  source: string,
  hyphenNames: HyphenOptions | null | undefined = hyphenPragma(source),
): Spot | null {
  try {
    const lines = sourceLines(source);
    if (lines.length < backtraceLocation.lineno) return null;
    const tokens = tokenize(lines[backtraceLocation.lineno - 1]);
    const newFirstColumn = findOffset(spot.snippet, tokens, spot.firstColumn, hyphenNames);

    const linenoDelta = spot.firstLineno - backtraceLocation.lineno;
    spot.firstLineno -= linenoDelta;
    spot.lastLineno -= linenoDelta;

    const columnDelta = spot.firstColumn - newFirstColumn;
    spot.firstColumn -= columnDelta;
    spot.lastColumn -= columnDelta;
    spot.scriptLines = lines;

    return spot;
  } catch (e) {
    if (e instanceof NotImplementedError || e instanceof LocationParsingError) return null;
    throw e;
  }
}
