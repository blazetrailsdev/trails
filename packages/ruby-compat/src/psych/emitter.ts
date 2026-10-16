import type * as Yaml from "yaml";
import { NotImplementedError } from "../not-implemented-error.js";
import { registerConstant } from "../variable.js";
import { yaml as backend, type PsychIO } from "../psych-adapter.js";
import { Mapping } from "./nodes/mapping.js";
import { Scalar } from "./nodes/scalar.js";

const yaml = backend as unknown as typeof Yaml;

const BREAK = /[\r\n\u0085\u2028\u2029]/;
const blankz = (c: string | undefined) =>
  c === undefined || c === " " || c === "\t" || BREAK.test(c);
const PRINTABLE = /^[\n\x20-\x7e\x85\xa0-\ud7ff\ue000-\ufefe\uff00-\ufffd\u{10000}-\u{10ffff}]$/u;

function analyzeScalar(value: string): {
  blockPlainAllowed: boolean;
  singleQuotedAllowed: boolean;
  blockAllowed: boolean;
} {
  if (value.length === 0) {
    return { blockPlainAllowed: true, singleQuotedAllowed: true, blockAllowed: false };
  }
  const chars = Array.from(value);
  let blockIndicators = false;
  let leadingSpace = false;
  let leadingBreak = false;
  let trailingSpace = false;
  let trailingBreak = false;
  let breakSpace = false;
  let spaceBreak = false;
  let previousSpace = false;
  let previousBreak = false;
  let lineBreaks = false;
  let specialCharacters = false;

  if ((value.startsWith("---") || value.startsWith("...")) && blankz(chars[3])) {
    blockIndicators = true;
  }
  let precededByWhitespace = true;
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    const followedByWhitespace = blankz(chars[i + 1]);
    if (i === 0) {
      if ("#,[]{}&*!|>'\"%@`".includes(c)) blockIndicators = true;
      if ((c === "?" || c === ":" || c === "-") && followedByWhitespace) blockIndicators = true;
    } else {
      if (c === ":" && followedByWhitespace) blockIndicators = true;
      if (c === "#" && precededByWhitespace) blockIndicators = true;
    }
    if (!PRINTABLE.test(c) || c === "\ufeff") specialCharacters = true;
    if (BREAK.test(c)) lineBreaks = true;
    if (c === " ") {
      if (i === 0) leadingSpace = true;
      if (i === chars.length - 1) trailingSpace = true;
      if (previousBreak) breakSpace = true;
      previousSpace = true;
      previousBreak = false;
    } else if (BREAK.test(c)) {
      if (i === 0) leadingBreak = true;
      if (i === chars.length - 1) trailingBreak = true;
      if (previousSpace) spaceBreak = true;
      previousBreak = true;
      previousSpace = false;
    } else {
      previousSpace = false;
      previousBreak = false;
    }
    precededByWhitespace = blankz(c);
  }

  let blockPlainAllowed = true;
  let singleQuotedAllowed = true;
  let blockAllowed = true;
  if (leadingSpace || leadingBreak || trailingSpace || trailingBreak) blockPlainAllowed = false;
  if (trailingSpace) blockAllowed = false;
  if (breakSpace) {
    blockPlainAllowed = false;
    singleQuotedAllowed = false;
  }
  if (spaceBreak || specialCharacters) {
    blockPlainAllowed = singleQuotedAllowed = blockAllowed = false;
  }
  if (lineBreaks) blockPlainAllowed = false;
  if (blockIndicators) blockPlainAllowed = false;
  return { blockPlainAllowed, singleQuotedAllowed, blockAllowed };
}

const EXPLICIT_KEYS = new WeakMap<Yaml.Scalar, Yaml.Scalar.Type | undefined>();

const encoder = new TextEncoder();

function writeSingleQuoted(
  stringify: NonNullable<Yaml.ScalarTag["stringify"]>,
): NonNullable<Yaml.ScalarTag["stringify"]> {
  return (item, ctx, onComment, onChompKeep) => {
    const style = EXPLICIT_KEYS.get(item);
    if (style !== undefined) {
      item = Object.assign(Object.create(Object.getPrototypeOf(item)), item, { type: style });
    }
    const { value, type } = item as Yaml.Scalar<string>;
    if (type === yaml.Scalar.PLAIN) {
      return stringify(item, { ...ctx, actualString: false }, onComment, onChompKeep);
    }
    if (type !== yaml.Scalar.QUOTE_SINGLE || typeof value !== "string") {
      return stringify(item, ctx, onComment, onChompKeep);
    }
    const lineWidth = ctx.options.lineWidth;
    const bestWidth = lineWidth > 0 ? lineWidth : Infinity;
    const allowBreaks = !ctx.implicitKey;
    const chars = Array.from(value);
    let out = "'";
    let column =
      (ctx.indentAtStart === undefined
        ? ctx.indent === ""
          ? "--- ".length
          : ctx.indent.length
        : ctx.indent.length - ctx.indentStep.length + ctx.indentAtStart) + 1;
    let spaces = false;
    let breaks = false;
    const writeIndent = () => {
      if (!out.endsWith("\n")) out += "\n";
      out += ctx.indent;
      column = ctx.indent.length;
    };
    for (let i = 0; i < chars.length; i++) {
      const c = chars[i];
      if (c === " ") {
        if (
          allowBreaks &&
          !spaces &&
          column > bestWidth &&
          i !== 0 &&
          i !== chars.length - 1 &&
          chars[i + 1] !== " "
        ) {
          writeIndent();
        } else {
          out += c;
          column++;
        }
        spaces = true;
      } else if (BREAK.test(c)) {
        if (!breaks && c === "\n") out += "\n";
        out += "\n";
        column = 0;
        breaks = true;
      } else {
        if (breaks) writeIndent();
        out += c === "'" ? "''" : c;
        column += c === "'" ? 2 : 1;
        spaces = false;
        breaks = false;
      }
    }
    if (breaks) writeIndent();
    return `${out}'`;
  };
}

/** `yaml_emitter_t`'s dumper options (`Psych::Handler::DumperOptions`, `vendor/ruby/v3.3.11/ext/psych/lib/psych/handler.rb:16`). */
export interface DumperOptions {
  indentation?: number;
  canonical?: boolean;
  lineWidth?: number;
}

const STYLES: Record<number, Yaml.Scalar.Type> = {
  [Scalar.PLAIN]: "PLAIN",
  [Scalar.SINGLE_QUOTED]: "QUOTE_SINGLE",
  [Scalar.DOUBLE_QUOTED]: "QUOTE_DOUBLE",
  [Scalar.LITERAL]: "BLOCK_LITERAL",
  [Scalar.FOLDED]: "BLOCK_FOLDED",
};

type Collection = Yaml.YAMLMap | Yaml.YAMLSeq;

/**
 * `Psych::Emitter` (`vendor/ruby/v3.3.11/ext/psych/psych_emitter.c:527`), the
 * libyaml emitter, driving the backend's `Document`: each event builds a
 * backend node, and `end_document` writes the document. Scalar style and tag
 * selection is libyaml's `yaml_emitter_select_scalar_style`.
 *
 * @noRailsEquivalent PERMANENT
 */
export class Emitter {
  private readonly io: PsychIO;
  private readonly options: DumperOptions;
  private doc: Yaml.Document | null = null;
  private documentStart = "";
  private readonly stack: { node: Collection; key?: Yaml.Node }[] = [];

  /** @noRailsEquivalent PERMANENT */
  constructor(io: PsychIO, options: DumperOptions = {}) {
    this.io = io;
    this.options = options;
  }

  /** @noRailsEquivalent PERMANENT */
  startStream(_encoding: number): this {
    if (this.options.canonical) throw new NotImplementedError("canonical");
    return this;
  }

  /** @noRailsEquivalent PERMANENT */
  endStream(): this {
    return this;
  }

  /** @noRailsEquivalent PERMANENT */
  startDocument(_version: number[], _tagDirectives: [string, string][], implicit: boolean): this {
    this.doc = new yaml.Document(undefined, {
      customTags: (tags: Yaml.Tags) =>
        tags.map((t) =>
          typeof t === "object" && t.tag === "tag:yaml.org,2002:str"
            ? {
                ...(t as Yaml.ScalarTag),
                stringify: writeSingleQuoted((t as Yaml.ScalarTag).stringify!),
              }
            : t,
        ),
    });
    this.documentStart = implicit ? "" : "---";
    return this;
  }

  /** @noRailsEquivalent PERMANENT */
  endDocument(_implicitEnd: boolean): this {
    const doc = this.doc!;
    const du: {
      indent?: number;
      lineWidth?: number;
      indentSeq: boolean;
      flowCollectionPadding: boolean;
    } = { indentSeq: false, flowCollectionPadding: false };
    if ("indentation" in this.options) du.indent = this.options.indentation;
    if ("lineWidth" in this.options) du.lineWidth = this.options.lineWidth;
    const root = doc.contents;
    let body = doc.toString(du).replace(/^( *)- $/gm, "$1-");
    let string: string;
    if (body === "\n") {
      string = `${this.documentStart}\n`;
    } else if (root?.tag || (yaml.isCollection(root) && (root.flow || root.items.length === 0))) {
      string = `${this.documentStart} ${body}`;
    } else if (yaml.isScalar(root)) {
      body = body.replace(/\n(?=.)/g, `\n${" ".repeat(du.indent ?? 2)}`);
      string = `${this.documentStart} ${body}`;
    } else {
      string = this.documentStart ? `${this.documentStart}\n${body}` : body;
    }
    this.io.write(string);
    this.doc = null;
    return this;
  }

  /** @noRailsEquivalent PERMANENT */
  scalar(
    value: string,
    anchor: string | null,
    tag: string | null,
    plain: boolean,
    quoted: boolean,
    style: number,
  ): this {
    if (tag != null && (plain || quoted)) tag = null;
    const noTag = tag == null;
    const analysis = analyzeScalar(value);

    if (style === Scalar.ANY) style = Scalar.PLAIN;
    if (style === Scalar.PLAIN) {
      if (!analysis.blockPlainAllowed) style = Scalar.SINGLE_QUOTED;
      if (noTag && !plain) style = Scalar.SINGLE_QUOTED;
    }
    if (style === Scalar.SINGLE_QUOTED) {
      if (!analysis.singleQuotedAllowed) style = Scalar.DOUBLE_QUOTED;
    }
    if (style === Scalar.LITERAL || style === Scalar.FOLDED) {
      if (!analysis.blockAllowed) style = Scalar.DOUBLE_QUOTED;
    }
    if (noTag && !quoted && style !== Scalar.PLAIN) tag = "!";

    const node = this.doc!.createNode(value) as Yaml.Scalar;
    node.type = STYLES[style];
    if (tag != null) node.tag = tag;
    if (anchor != null) node.anchor = anchor;
    this.add(node);
    return this;
  }

  /** @noRailsEquivalent PERMANENT */
  startSequence(
    anchor: string | null,
    tag: string | null,
    _implicit: boolean,
    style: number,
  ): this {
    return this.start(new yaml.YAMLSeq(), anchor, tag, style);
  }

  /** @noRailsEquivalent PERMANENT */
  endSequence(): this {
    this.stack.pop();
    return this;
  }

  /** @noRailsEquivalent PERMANENT */
  startMapping(anchor: string | null, tag: string | null, _implicit: boolean, style: number): this {
    return this.start(new yaml.YAMLMap(), anchor, tag, style);
  }

  /** @noRailsEquivalent PERMANENT */
  endMapping(): this {
    this.stack.pop();
    return this;
  }

  /** @noRailsEquivalent PERMANENT */
  alias(anchor: string): this {
    this.add(new yaml.Alias(anchor) as unknown as Yaml.Node);
    return this;
  }

  private start(node: Collection, anchor: string | null, tag: string | null, style: number): this {
    if (tag != null) node.tag = tag;
    if (anchor != null) node.anchor = anchor;
    if (style === Mapping.FLOW) node.flow = true;
    this.add(node);
    this.stack.push({ node });
    return this;
  }

  private checkSimpleKey(node: Yaml.Node): boolean {
    if (yaml.isAlias(node)) return encoder.encode(node.source).length <= 128;
    if (!yaml.isScalar(node) && !yaml.isCollection(node)) return false;
    const tag = node.tag?.startsWith("tag:yaml.org,2002:")
      ? `!!${node.tag.slice("tag:yaml.org,2002:".length)}`
      : node.tag;
    let length = encoder.encode(node.anchor ?? "").length + encoder.encode(tag ?? "").length;
    if (yaml.isScalar(node)) {
      const value = String(node.value);
      if (BREAK.test(value)) return false;
      length += encoder.encode(value).length;
    } else if (node.items.length !== 0) {
      return false;
    }
    if (length > 128) return false;
    return true;
  }

  private add(node: Yaml.Node): void {
    const top = this.stack.at(-1);
    if (!top) {
      this.doc!.contents = node as Yaml.Document["contents"];
    } else if (yaml.isSeq(top.node)) {
      top.node.items.push(node);
    } else if (top.key === undefined) {
      if (yaml.isScalar(node) && !this.checkSimpleKey(node)) {
        const style = node.type;
        node = node.clone() as Yaml.Scalar;
        node.type = "BLOCK_LITERAL";
        EXPLICIT_KEYS.set(node, style);
      }
      top.key = node;
    } else {
      top.node.add(new yaml.Pair(top.key, node));
      top.key = undefined;
    }
  }
}

registerConstant("Psych::Emitter", Emitter);
