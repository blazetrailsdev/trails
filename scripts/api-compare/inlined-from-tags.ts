/**
 * The `@inlinedFrom <Ruby::Module>#<hook> <source>/<version>/<file>:<first>-<last>`
 * JSDoc tag (RFC 0188): names the Ruby body a segment of a constructor came
 * from when that body lives in another Ruby file. A constructor carries one
 * tag per inlined segment, in chain order, so the list is ordered and is not
 * deduplicated.
 *
 * The citation is the span of the `def`, relative to `vendor/` and not
 * spelling it. The tag carries nothing else: no prose, no story id, no
 * permanence token.
 *
 * Hard rules: no node:* imports, no process.* references, async fs.
 */

import type { InlinedFrom } from "@blazetrails/parity/types";
import type { JsdocOrigin } from "./missing-rails-call-tags.js";

export const TAG = "@inlinedFrom";

const TAG_LINE = /^@inlinedFrom(?:\s+(.*))?$/;
const RUBY_NAME = /^([A-Z]\w*(?:::[A-Z]\w*)*)#(initialize|new)$/;
const CITATION = /^([\w.-]+)\/([\w.-]+)\/(\S+\.rb):(\d+)-(\d+)$/;

/** The tags one JSDoc comment carries, in written order. Throws on a malformed one. */
export function inlinedFromIn(comment: string, origin?: JsdocOrigin): InlinedFrom[] {
  const tags: InlinedFrom[] = [];
  const lines = comment
    .replace(/^\/\*\*/, "")
    .replace(/\*\/$/, "")
    .split("\n");
  lines.forEach((raw, index) => {
    const m = raw
      .replace(/^\s*\*?\s*/, "")
      .trimEnd()
      .match(TAG_LINE);
    if (!m) return;
    const at = origin ? ` ${origin.fileName}:${origin.startLine + index}` : "";
    const malformed = (why: string): Error =>
      new Error(
        `${TAG} is malformed:${at} — ${why}. Write it as ` +
          `\`${TAG} Ruby::Module#initialize <source>/<version>/<file>:<first>-<last>\`.`,
      );
    const [name, citation, ...extra] = (m[1] ?? "").split(/\s+/).filter(Boolean);
    const ruby = name?.match(RUBY_NAME);
    if (!ruby)
      throw malformed("it must name a Ruby `Module#initialize` or `Mod::ClassMethods#new`");
    if (ruby[2] === "new" && !ruby[1].endsWith("::ClassMethods")) {
      throw malformed("`new` is cited on a `ClassMethods` module only");
    }
    if (citation === undefined) throw malformed("it carries no source citation");
    const cite = citation.match(CITATION);
    if (!cite || cite[1] === "vendor") {
      throw malformed("its citation is relative to `vendor/` and does not spell it");
    }
    if (extra.length > 0) throw malformed("it carries nothing after the citation");
    const [firstLine, lastLine] = [Number(cite[4]), Number(cite[5])];
    if (firstLine < 1 || lastLine < firstLine) throw malformed("its line span is empty");
    tags.push({
      module: ruby[1],
      hook: ruby[2] as InlinedFrom["hook"],
      source: cite[1],
      version: cite[2],
      file: cite[3],
      firstLine,
      lastLine,
    });
  });
  return tags;
}
