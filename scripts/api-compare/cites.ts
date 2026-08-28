/**
 * The Rails CITATION checker (RFC 0121): every `gem/path.rb:LINE` written into
 * a deviation receipt has to point at the thing the receipt says it points at.
 *
 * A `@noRailsEquivalent` reason — and the reason half of its call-site
 * siblings `@missingRailsCall` / `@missingRailsArgs` — is the receipt for a
 * deviation. Nothing checked the citation inside it: the prose is parsed, the
 * permanence prefix is gated, but `reflection.rb:507` naming
 * `AssociationReflection#klass` (507 is inside `#compute_class`) reads as
 * evidence while pointing at nothing. #7115 needed two self-audits and a
 * reviewer round to clear ~255 of them by hand, and the reviewer still found
 * one the audits missed.
 *
 * Three properties are checked, per citation:
 *
 *   1. RESOLVABLE — the cited path resolves to exactly one `.rb` under
 *      `vendor/`. A bare basename with siblings across the adapter tree
 *      (`quoting.rb`, `schema_statements.rb`, `column.rb`) is `ambiguous`,
 *      and the fix is to qualify it with its directory
 *      (`abstract/schema_statements.rb`), which is what #7115 did by hand.
 *   2. IN RANGE — the line (both endpoints, for a `12-30` range) exists.
 *   3. METHOD MEMBERSHIP — when the reason names a Ruby method as `Klass#meth`
 *      or `Klass.meth` AND that method is defined in the cited file, the cited
 *      line falls inside that method's body. Operator names (`==`, `<=>`,
 *      `[]`, `+`, `name=`) parse like any other, which the ad-hoc #7115
 *      version could not do.
 *
 * A receipt that cites a USE site rather than a definition says so by writing
 * `use-site:` immediately before the citation
 * (`… Rails reads it at use-site:abstract_adapter.rb:1180`); membership is
 * skipped for that citation, the other two properties still hold.
 *
 * Hard rules: no node:* imports, no process.* references, async fs only.
 */

import * as fs from "fs/promises";
import * as path from "path";

/** The three receipt tags whose reason prose carries citations. */
export const CITING_TAGS = ["@noRailsEquivalent", "@missingRailsCall", "@missingRailsArgs"];

/** Marks a citation as pointing at a USE site, so membership is not checked. */
export const USE_SITE_MARKER = "use-site:";

export type CiteProblem = "ambiguous" | "unresolved" | "out-of-range" | "not-in-method";

/** One citation that failed one of the three properties. */
export interface CiteFinding {
  /** Repo-relative `.ts` file the receipt is written in. */
  tsFile: string;
  /** 1-based line of the JSDoc block the receipt sits in. */
  line: number;
  tag: string;
  /** The citation exactly as written, e.g. `reflection.rb:507`. */
  cite: string;
  problem: CiteProblem;
  detail: string;
}

/** One citation lifted out of a receipt's reason prose. */
export interface Cite {
  raw: string;
  file: string;
  startLine: number;
  endLine: number;
  useSite: boolean;
}

/** A `def` in a Ruby file: its name and the 1-based line span of its body. */
export interface RubyMethodSpan {
  name: string;
  startLine: number;
  endLine: number;
}

const CITE_RE = /(use-site:)?([\w./-]+\.rb):(\d+)(?:-(\d+))?/g;
/** A `, :35` riding behind a citation: a further line in the SAME file, the
 *  shape a receipt naming two sites in one `.rb` is written in
 *  (`routes.rb:10, :35`). Each one is checked like a citation of its own. */
const CONTINUATION_RE = /^\s*,\s*:(\d+)(?:-(\d+))?/;
/** `Klass#meth` / `Klass.meth`, the two spellings a reason names a method in.
 *  The method half takes operators too, so `Arel::Nodes::Node#==` parses. */
const NAMED_METHOD_RE = /\b[A-Z]\w*(?:::\w+)*[#.]([a-z_][\w]*[?!=]?|[^\s`,)]+)/g;

/** Citations in one receipt's reason prose, in written order. */
export function parseCites(reason: string): Cite[] {
  const out: Cite[] = [];
  for (const m of reason.matchAll(CITE_RE)) {
    const startLine = Number(m[3]);
    const useSite = m[1] !== undefined;
    out.push({
      raw: m[0],
      file: m[2],
      startLine,
      endLine: m[4] === undefined ? startLine : Number(m[4]),
      useSite,
    });
    let rest = reason.slice((m.index ?? 0) + m[0].length);
    for (let c = CONTINUATION_RE.exec(rest); c !== null; c = CONTINUATION_RE.exec(rest)) {
      const line = Number(c[1]);
      out.push({
        raw: `${m[2]}:${c[1]}${c[2] === undefined ? "" : `-${c[2]}`}`,
        file: m[2],
        startLine: line,
        endLine: c[2] === undefined ? line : Number(c[2]),
        useSite,
      });
      rest = rest.slice(c[0].length);
    }
  }
  return out;
}

/** Ruby method names the reason names as `Klass#meth` / `Klass.meth`. */
export function namedMethods(reason: string): string[] {
  return [...reason.matchAll(NAMED_METHOD_RE)].map((m) => m[1]);
}

/**
 * Every `def` in a Ruby source, with the span it covers. The end is the `end`
 * at the `def`'s own indentation — the same rule MRI's own indentation
 * conventions make readable, and enough to answer "is line N inside this
 * method". A `def` never closed at its indentation runs to EOF, and a one-line
 * `def name; @name; end` closes on its own line, where the start-anchored `end`
 * match cannot see it.
 */
export function rubyMethodSpans(text: string): RubyMethodSpan[] {
  const lines = text.split("\n");
  const out: RubyMethodSpan[] = [];
  const open: { name: string; indent: number; startLine: number }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const def = /^(\s*)def\s+(?:self\.)?(\S+?)(?:\(|;|\s|$)/.exec(line);
    if (def) {
      if (/;\s*end\s*$/.test(line)) out.push({ name: def[2], startLine: i + 1, endLine: i + 1 });
      else open.push({ name: def[2], indent: def[1].length, startLine: i + 1 });
      continue;
    }
    const end = /^(\s*)end\b/.exec(line);
    if (!end) continue;
    for (let j = open.length - 1; j >= 0; j--) {
      if (open[j].indent !== end[1].length) continue;
      out.push({ name: open[j].name, startLine: open[j].startLine, endLine: i + 1 });
      open.splice(j, 1);
      break;
    }
  }
  for (const o of open) out.push({ name: o.name, startLine: o.startLine, endLine: lines.length });
  return out;
}

/** Every `.rb` under `dir`, following symlinks — `vendor/rails` is one. */
export async function walkRubyFiles(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const isDir = entry.isSymbolicLink()
      ? await fs
          .stat(full)
          .then((s) => s.isDirectory())
          .catch(() => false)
      : entry.isDirectory();
    if (isDir) out.push(...(await walkRubyFiles(full)));
    else if (entry.name.endsWith(".rb")) out.push(full);
  }
  return out;
}

/** The vendored Ruby corpus a citation resolves against. */
export interface RubyCorpus {
  /** Repo-relative paths of every vendored `.rb`, sorted. */
  files: string[];
  /** Absolute path of `vendor/`, so a resolved file can be read. */
  vendorDir: string;
}

export async function loadCorpus(rootDir: string): Promise<RubyCorpus> {
  const vendorDir = path.join(rootDir, "vendor");
  const abs = await walkRubyFiles(vendorDir);
  return { files: abs.map((f) => path.relative(rootDir, f)).sort(), vendorDir };
}

/** Files the cited path could name: an exact repo-relative hit, else every
 *  vendored path ending in it. Exactly one is `resolvable`. */
export function resolveCite(corpus: RubyCorpus, cite: string): string[] {
  const wanted = cite.replace(/^\.?\//, "");
  const exact = corpus.files.filter((f) => f === wanted);
  if (exact.length > 0) return exact;
  return corpus.files.filter((f) => f.endsWith(`/${wanted}`));
}

/** One receipt's reason prose, located at the JSDoc block that wrote it. */
export interface Receipt {
  tsFile: string;
  line: number;
  tag: string;
  reason: string;
}

/** Every receipt in one `.ts` file's text: one per citing tag per JSDoc block,
 *  its reason running to the next line-leading `@tag` or the block's end —
 *  the same extent `noRailsEquivalentReason` reads. */
export function collectReceipts(tsFile: string, text: string): Receipt[] {
  if (!CITING_TAGS.some((t) => text.includes(t))) return [];
  const out: Receipt[] = [];
  for (const block of text.matchAll(/\/\*\*[\s\S]*?\*\//g)) {
    const startLine = text.slice(0, block.index).split("\n").length;
    const lines = block[0].split("\n").map((l) => l.replace(/^\s*\*/, ""));
    let current: Receipt | null = null;
    for (let i = 0; i < lines.length; i++) {
      const tag = CITING_TAGS.find((t) => lines[i].trimStart().startsWith(t));
      if (tag) {
        current = { tsFile, line: startLine + i, tag, reason: lines[i] };
        out.push(current);
        continue;
      }
      if (current === null) continue;
      if (/^\s*@\w+/.test(lines[i])) current = null;
      else current.reason += ` ${lines[i].trim()}`;
    }
  }
  return out;
}

/** Check one receipt's citations against the vendored corpus. */
export async function checkReceipt(
  corpus: RubyCorpus,
  receipt: Receipt,
  readFile: (relPath: string) => Promise<string>,
): Promise<CiteFinding[]> {
  const out: CiteFinding[] = [];
  const methods = namedMethods(receipt.reason);
  for (const cite of parseCites(receipt.reason)) {
    const at = { tsFile: receipt.tsFile, line: receipt.line, tag: receipt.tag, cite: cite.raw };
    const matches = resolveCite(corpus, cite.file);
    if (matches.length === 0) {
      out.push({ ...at, problem: "unresolved", detail: `no vendored .rb named ${cite.file}` });
      continue;
    }
    if (matches.length > 1) {
      out.push({
        ...at,
        problem: "ambiguous",
        detail: `${matches.length} vendored files match — qualify it: ${matches.slice(0, 3).join(", ")}`,
      });
      continue;
    }
    const text = await readFile(matches[0]);
    const total = text.split("\n").length;
    if (cite.startLine < 1 || cite.endLine > total) {
      out.push({
        ...at,
        problem: "out-of-range",
        detail: `${matches[0]} has ${total} lines`,
      });
      continue;
    }
    if (cite.useSite || methods.length === 0) continue;
    const spans = rubyMethodSpans(text);
    const named = spans.filter((s) => methods.includes(s.name));
    if (named.length === 0) continue;
    if (named.some((s) => cite.startLine >= s.startLine && cite.startLine <= s.endLine)) continue;
    const enclosing = spans.filter(
      (s) => cite.startLine >= s.startLine && cite.startLine <= s.endLine,
    );
    out.push({
      ...at,
      problem: "not-in-method",
      detail:
        `line ${cite.startLine} is ` +
        (enclosing.length === 0
          ? "in no method body"
          : `inside #${enclosing[enclosing.length - 1].name}`) +
        `, not #${named.map((s) => s.name).join("/#")}`,
    });
  }
  return out;
}
