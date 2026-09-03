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

interface SourceToken {
  kind: "CODE" | "TEXT";
  value: string;
}

interface OffsetToken {
  kind: "CODE" | "TEXT" | "EOS";
  value: string;
  offset: number;
}

export function sourceLines(source: string): string[] {
  if (source.length === 0) return [];
  return source.split(/(?<=\n)/);
}

const LINE_TAG_RE = /<%%|%%>|<%!([\s\S]*?)!%>|<%(-)?(==|=|#)?([\s\S]*?)(-)?%>/g;

export function tokenizeLine(line: string): SourceToken[] {
  const tokens: SourceToken[] = [];
  let textBuf = "";
  let last = 0;
  const flushText = (): void => {
    if (textBuf.length > 0) tokens.push({ kind: "TEXT", value: textBuf });
    textBuf = "";
  };
  for (const m of line.matchAll(LINE_TAG_RE)) {
    textBuf += line.slice(last, m.index);
    last = m.index + m[0].length;
    if (m[0] === "<%%") {
      textBuf += "<%";
      continue;
    }
    if (m[0] === "%%>") {
      textBuf += "%>";
      continue;
    }
    if (m[2] === "-") textBuf = textBuf.replace(/[ \t]*$/, "");
    if (m[5] === "-") {
      const tail = /^[ \t]*\r?\n/.exec(line.slice(last));
      if (tail !== null) last += tail[0].length;
    }
    if (m[1] !== undefined) {
      flushText();
    } else if (m[3] === "#") {
      flushText();
    } else {
      flushText();
      tokens.push({ kind: "CODE", value: m[4].trim() });
    }
  }
  textBuf += line.slice(last);
  flushText();
  return tokens;
}

function offsetSourceTokens(tokens: SourceToken[]): OffsetToken[] {
  const result: OffsetToken[] = [];
  let offset = 0;
  for (const t of tokens) {
    result.push({ kind: t.kind, value: t.value, offset });
    offset += t.value.length;
  }
  result.push({ kind: "EOS", value: "", offset });
  return result;
}

export function findOffset(
  compiled: string,
  sourceTokens: SourceToken[],
  errorColumn: number,
): number {
  const tokens = offsetSourceTokens(sourceTokens);
  let pos = 0;

  for (let i = 0; i < tokens.length - 1; i++) {
    const { kind: name, value: str, offset } = tokens[i];
    const next = tokens[i + 1];
    let matchedStr = false;

    while (pos < compiled.length) {
      if (matchedStr && next.value.length > 0 && compiled.startsWith(next.value, pos)) {
        break;
      } else if (str.length > 0 && compiled.startsWith(str, pos)) {
        matchedStr = true;
        if (name === "CODE" && pos <= errorColumn && pos + str.length >= errorColumn) {
          return errorColumn - pos + offset;
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
): Spot | null {
  try {
    const lines = sourceLines(source);
    if (lines.length < backtraceLocation.lineno) return null;
    const tokens = tokenizeLine(lines[backtraceLocation.lineno - 1]);
    const newFirstColumn = findOffset(spot.snippet, tokens, spot.firstColumn);

    const linenoDelta = spot.firstLineno - backtraceLocation.lineno;
    spot.firstLineno -= linenoDelta;
    spot.lastLineno -= linenoDelta;

    const columnDelta = spot.firstColumn - newFirstColumn;
    spot.firstColumn -= columnDelta;
    spot.lastColumn -= columnDelta;
    spot.scriptLines = lines;

    return spot;
  } catch (e) {
    if (e instanceof LocationParsingError) return null;
    throw e;
  }
}
