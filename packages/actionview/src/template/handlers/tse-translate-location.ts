/**
 * Port of `ActionView::Template::Handlers::ERB#translate_location` (and its
 * private `find_offset` / `offset_source_tokens` helpers). Maps a compiled-JS
 * spot back to the originating `.tse` source position by anchoring the
 * compiled snippet against per-line tokens of the source.
 *
 * Algorithm preserved 1:1 from Rails (`erb.rb` lines 43–161). Key shape
 * differences from the Ruby original:
 *
 * - Ruby's `String#lines` keeps the trailing line-separator; we mirror that
 *   with a `split(/(?<=\n)/)`.
 * - Ruby uses `StringScanner` over byte offsets; JS strings are UTF-16 code
 *   units, so positions here are code-unit indices. ASCII-only source (the
 *   common case for templates) round-trips identically. Multi-byte content
 *   diverges in absolute column counts but the relative deltas this method
 *   computes are still correct.
 * - Ruby's `ERB::Util.tokenize(line)` yields `[:CODE | :TEXT, str]` pairs
 *   where CODE is the *contents* of `<% %>` (no delimiters), whitespace
 *   preserved. Our compiler trims tag bodies (`parser.ts`), so the
 *   anchoring tokenizer here also trims CODE — `<%= name %>` becomes
 *   `_ob.append(name);` in compiled output, and the CODE anchor is `"name"`.
 *   This is a TSE-specific divergence from Erubi, which keeps whitespace on
 *   both sides; the alignment property `find_offset` relies on is preserved.
 */

export class LocationParsingError extends Error {
  override name = "LocationParsingError";
}

/** Minimal shape needed from a JS backtrace location. Matches the property
 *  V8/Node expose on `CallSite` / parsed stack frames. */
export interface BacktraceLocation {
  lineno: number;
}

/** Mirrors the `ErrorHighlight::Spot` hash Rails mutates in place. Field
 *  names are camelCased; semantics are 1:1 with Ruby. `scriptLines` is
 *  written by `translateLocation` on success. */
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

/** `String#lines` parity — split on `\n` while keeping the separator on each
 *  line. `"a\nb\nc"` → `["a\n", "b\n", "c"]`. An empty source yields `[]`,
 *  matching Ruby. */
export function sourceLines(source: string): string[] {
  if (source.length === 0) return [];
  return source.split(/(?<=\n)/);
}

const LINE_TAG_RE = /<%%|%%>|<%!([\s\S]*?)!%>|<%(-)?(==|=|#)?([\s\S]*?)(-)?%>/g;

/** `ERB::Util.tokenize` parity for a single source line. Token kinds emitted:
 *
 * - CODE for `<% … %>`, `<%= … %>`, `<%== … %>` — their contents appear in
 *   the compiled JS, so `findOffset` can anchor on them.
 * - TEXT for static spans, plus Rails' `<%%` / `%%>` escapes (literal `<%` /
 *   `%>`).
 *
 * Skipped entirely (no token emitted) — these source spans are dropped by
 * `@blazetrails/tse-compiler`'s emitter, so emitting them as CODE would
 * break `findOffset` (the substring never appears in compiled output) and
 * emitting them as TEXT would do the same.
 *
 * - `<%# … %>` comment tags.
 * - `<%! … !%>` typesMagic blocks.
 */
export function tokenizeLine(line: string): SourceToken[] {
  const tokens: SourceToken[] = [];
  let textBuf = "";
  let last = 0;
  const flushText = (): void => {
    if (textBuf.length > 0) tokens.push({ kind: "TEXT", value: textBuf });
    textBuf = "";
  };
  for (const m of line.matchAll(LINE_TAG_RE)) {
    textBuf += line.slice(last, m.index!);
    last = m.index! + m[0].length;
    if (m[0] === "<%%") {
      textBuf += "<%";
      continue;
    }
    if (m[0] === "%%>") {
      textBuf += "%>";
      continue;
    }
    // `<%- ... %>`: strip preceding `[ \t]*` from the TEXT buffer, matching
    // the lexer in @blazetrails/tse-compiler/src/lexer.ts.
    if (m[2] === "-") textBuf = textBuf.replace(/[ \t]*$/, "");
    // `<% ... -%>`: consume the following `[ \t]*\r?\n` from the source so
    // the post-tag TEXT token doesn't keep a newline the compiler dropped.
    // Mirrors the trimRight branch in the lexer. `sourceLines` keeps `\n`
    // attached to each line, so this case IS reachable per-line.
    if (m[5] === "-") {
      const tail = /^[ \t]*\r?\n/.exec(line.slice(last));
      if (tail !== null) last += tail[0].length;
    }
    if (m[1] !== undefined) {
      // `<%! ... !%>` typesMagic — compiler drops it, so do we.
      flushText();
    } else if (m[3] === "#") {
      // `<%# ... %>` comment — compiler drops it, so do we.
      flushText();
    } else {
      flushText();
      // Trim CODE contents to match what `@blazetrails/tse-compiler`'s parser
      // emits (`tok.value.trim()` in parser.ts) — `<%= name %>` becomes the
      // emitted JS `_ob.append(name);`, so the anchor string is `"name"`,
      // not `" name "`. This is a TSE-specific divergence from Ruby's
      // `ERB::Util.tokenize`, which preserves whitespace; Erubi keeps it on
      // both sides, so Rails' anchoring lines up without trimming.
      tokens.push({ kind: "CODE", value: m[4].trim() });
    }
  }
  textBuf += line.slice(last);
  flushText();
  return tokens;
}

/** Annotate each CODE/TEXT token with its offset (UTF-16 code units, not
 *  bytes — see the file-level note) within the source line, appending an
 *  EOS sentinel. Mirrors `offset_source_tokens` in `erb.rb`, which uses
 *  `bytesize`. */
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

/**
 * `find_offset` parity. Walks `compiled` with a position cursor, anchoring on
 * consecutive source-token pairs. When the current CODE token's span covers
 * `errorColumn` in the compiled snippet, returns the equivalent source-line
 * column.
 */
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

/**
 * Map a compiled-JS `spot` back to its originating `.tse` source location.
 * Mutates `spot` in place (matching Rails) and returns it; returns `null` if
 * the backtrace line is past EOF or `find_offset` can't anchor.
 *
 * Mirrors `Template::Handlers::ERB#translate_location`.
 */
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
