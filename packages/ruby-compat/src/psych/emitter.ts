import { NotImplementedError } from "../not-implemented-error.js";
import { RuntimeError } from "../runtime-error.js";
import { registerConstant } from "../variable.js";
import type { PsychIO } from "../psych-adapter.js";
import { Scalar } from "./nodes/scalar.js";
import { Sequence } from "./nodes/sequence.js";
import { Mapping } from "./nodes/mapping.js";

/** `yaml_emitter_t`'s dumper options (`Psych::Handler::DumperOptions`, `vendor/ruby/v3.3.11/ext/psych/lib/psych/handler.rb:16`). */
export interface DumperOptions {
  indentation?: number;
  canonical?: boolean;
  lineWidth?: number;
}

type Event =
  | { type: "STREAM_START" }
  | { type: "STREAM_END" }
  | {
      type: "DOCUMENT_START";
      version: number[];
      tagDirectives: [string, string][];
      implicit: boolean;
    }
  | { type: "DOCUMENT_END"; implicit: boolean }
  | { type: "ALIAS"; anchor: string }
  | {
      type: "SCALAR";
      anchor: string | null;
      tag: string | null;
      value: string;
      plainImplicit: boolean;
      quotedImplicit: boolean;
      style: number;
    }
  | {
      type: "SEQUENCE_START";
      anchor: string | null;
      tag: string | null;
      implicit: boolean;
      style: number;
    }
  | {
      type: "MAPPING_START";
      anchor: string | null;
      tag: string | null;
      implicit: boolean;
      style: number;
    }
  | { type: "SEQUENCE_END" }
  | { type: "MAPPING_END" };

type State =
  | "STREAM_START"
  | "FIRST_DOCUMENT_START"
  | "DOCUMENT_START"
  | "DOCUMENT_CONTENT"
  | "DOCUMENT_END"
  | "FLOW_SEQUENCE_FIRST_ITEM"
  | "FLOW_SEQUENCE_ITEM"
  | "FLOW_MAPPING_FIRST_KEY"
  | "FLOW_MAPPING_KEY"
  | "FLOW_MAPPING_SIMPLE_VALUE"
  | "FLOW_MAPPING_VALUE"
  | "BLOCK_SEQUENCE_FIRST_ITEM"
  | "BLOCK_SEQUENCE_ITEM"
  | "BLOCK_MAPPING_FIRST_KEY"
  | "BLOCK_MAPPING_KEY"
  | "BLOCK_MAPPING_SIMPLE_VALUE"
  | "BLOCK_MAPPING_VALUE"
  | "END";

const DEFAULT_TAG_DIRECTIVES: [string, string][] = [
  ["!", "!"],
  ["!!", "tag:yaml.org,2002:"],
];

const isBreak = (c: string | undefined) =>
  c === "\r" || c === "\n" || c === "\u0085" || c === "\u2028" || c === "\u2029";
const isSpace = (c: string | undefined) => c === " ";
const isBlank = (c: string | undefined) => c === " " || c === "\t";
const isBlankz = (c: string | undefined) =>
  c === undefined || c === "\0" || isBlank(c) || isBreak(c);
const isAlpha = (c: string) => /^[0-9A-Za-z_-]$/.test(c);
const isBom = (c: string) => c === "\ufeff";
const isPrintable = (c: string) =>
  /^[\n\x20-\x7e\xa0-\ud7ff\ue000-\ufffd]$/.test(c) && c !== "\ufeff" && c !== "\ufffe";
const encoder = new TextEncoder();
const width = (s: string) => encoder.encode(s).length;

interface ScalarData {
  value: string;
  multiline: boolean;
  flowPlainAllowed: boolean;
  blockPlainAllowed: boolean;
  singleQuotedAllowed: boolean;
  blockAllowed: boolean;
  style: number;
}

/**
 * `Psych::Emitter` (`vendor/ruby/v3.3.11/ext/psych/psych_emitter.c:527`), the
 * libyaml 0.2.5 emitter (`src/emitter.c`): each handler call builds a libyaml
 * event (`psych_emitter.c`) and `yaml_emitter_emit` drives the state machine.
 *
 * @noRailsEquivalent PERMANENT
 */
export class Emitter {
  private readonly io: PsychIO;
  private readonly canonical: boolean = false;
  private readonly unicode = true;
  private bestIndent = 2;
  private bestWidth = 0;
  private buffer = "";
  private readonly states: State[] = [];
  private state: State = "STREAM_START";
  private readonly events: Event[] = [];
  private readonly indents: number[] = [];
  private tagDirectives: [string, string][] = [];
  private indent = -1;
  private flowLevel = 0;
  private rootContext = false;
  private sequenceContext = false;
  private mappingContext = false;
  private simpleKeyContext = false;
  private line = 0;
  private column = 0;
  private whitespace = false;
  private indention = false;
  private openEnded = 0;
  private anchorData: { anchor: string; alias: boolean } | null = null;
  private tagData: { handle: string | null; suffix: string | null } = {
    handle: null,
    suffix: null,
  };
  private scalarData!: ScalarData;

  /** @noRailsEquivalent PERMANENT */
  constructor(io: PsychIO, options: DumperOptions = {}) {
    if ("lineWidth" in options) this.bestWidth = options.lineWidth!;
    if ("indentation" in options) this.bestIndent = options.indentation!;
    if ("canonical" in options) this.canonical = options.canonical === true;
    this.io = io;
  }

  /** @noRailsEquivalent PERMANENT */
  startStream(_encoding: number): this {
    if (this.canonical) throw new NotImplementedError("canonical");
    this.emit({ type: "STREAM_START" });
    return this;
  }

  /** @noRailsEquivalent PERMANENT */
  endStream(): this {
    this.emit({ type: "STREAM_END" });
    return this;
  }

  /** @noRailsEquivalent PERMANENT */
  startDocument(version: number[], tagDirectives: [string, string][], implicit: boolean): this {
    this.emit({ type: "DOCUMENT_START", version, tagDirectives, implicit });
    return this;
  }

  /** @noRailsEquivalent PERMANENT */
  endDocument(implicitEnd: boolean): this {
    this.emit({ type: "DOCUMENT_END", implicit: implicitEnd });
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
    this.emit({
      type: "SCALAR",
      anchor,
      tag,
      value,
      plainImplicit: plain,
      quotedImplicit: quoted,
      style,
    });
    return this;
  }

  /** @noRailsEquivalent PERMANENT */
  startSequence(anchor: string | null, tag: string | null, implicit: boolean, style: number): this {
    this.emit({ type: "SEQUENCE_START", anchor, tag, implicit, style });
    return this;
  }

  /** @noRailsEquivalent PERMANENT */
  endSequence(): this {
    this.emit({ type: "SEQUENCE_END" });
    return this;
  }

  /** @noRailsEquivalent PERMANENT */
  startMapping(anchor: string | null, tag: string | null, implicit: boolean, style: number): this {
    this.emit({ type: "MAPPING_START", anchor, tag, implicit, style });
    return this;
  }

  /** @noRailsEquivalent PERMANENT */
  endMapping(): this {
    this.emit({ type: "MAPPING_END" });
    return this;
  }

  /** @noRailsEquivalent PERMANENT */
  alias(anchor: string): this {
    this.emit({ type: "ALIAS", anchor });
    return this;
  }

  private emit(event: Event): void {
    this.events.push(event);
    while (!this.needMoreEvents()) {
      this.analyzeEvent(this.events[0]);
      this.stateMachine(this.events[0]);
      this.events.shift();
    }
  }

  private needMoreEvents(): boolean {
    if (this.events.length === 0) return true;
    let accumulate: number;
    switch (this.events[0].type) {
      case "DOCUMENT_START":
        accumulate = 1;
        break;
      case "SEQUENCE_START":
        accumulate = 2;
        break;
      case "MAPPING_START":
        accumulate = 3;
        break;
      default:
        return false;
    }
    if (this.events.length - 1 > accumulate) return false;
    let level = 0;
    for (const event of this.events) {
      switch (event.type) {
        case "STREAM_START":
        case "DOCUMENT_START":
        case "SEQUENCE_START":
        case "MAPPING_START":
          level += 1;
          break;
        case "STREAM_END":
        case "DOCUMENT_END":
        case "SEQUENCE_END":
        case "MAPPING_END":
          level -= 1;
          break;
      }
      if (!level) return false;
    }
    return true;
  }

  private stateMachine(event: Event): void {
    switch (this.state) {
      case "STREAM_START":
        return this.emitStreamStart(event);
      case "FIRST_DOCUMENT_START":
        return this.emitDocumentStart(event, true);
      case "DOCUMENT_START":
        return this.emitDocumentStart(event, false);
      case "DOCUMENT_CONTENT":
        return this.emitDocumentContent(event);
      case "DOCUMENT_END":
        return this.emitDocumentEnd(event);
      case "FLOW_SEQUENCE_FIRST_ITEM":
        return this.emitFlowSequenceItem(event, true);
      case "FLOW_SEQUENCE_ITEM":
        return this.emitFlowSequenceItem(event, false);
      case "FLOW_MAPPING_FIRST_KEY":
        return this.emitFlowMappingKey(event, true);
      case "FLOW_MAPPING_KEY":
        return this.emitFlowMappingKey(event, false);
      case "FLOW_MAPPING_SIMPLE_VALUE":
        return this.emitFlowMappingValue(event, true);
      case "FLOW_MAPPING_VALUE":
        return this.emitFlowMappingValue(event, false);
      case "BLOCK_SEQUENCE_FIRST_ITEM":
        return this.emitBlockSequenceItem(event, true);
      case "BLOCK_SEQUENCE_ITEM":
        return this.emitBlockSequenceItem(event, false);
      case "BLOCK_MAPPING_FIRST_KEY":
        return this.emitBlockMappingKey(event, true);
      case "BLOCK_MAPPING_KEY":
        return this.emitBlockMappingKey(event, false);
      case "BLOCK_MAPPING_SIMPLE_VALUE":
        return this.emitBlockMappingValue(event, true);
      case "BLOCK_MAPPING_VALUE":
        return this.emitBlockMappingValue(event, false);
      case "END":
        throw new RuntimeError("expected nothing after STREAM-END");
    }
  }

  private emitStreamStart(event: Event): void {
    if (event.type !== "STREAM_START") throw new RuntimeError("expected STREAM-START");
    if (this.bestIndent < 2 || this.bestIndent > 9) this.bestIndent = 2;
    if (this.bestWidth >= 0 && this.bestWidth <= this.bestIndent * 2) this.bestWidth = 80;
    if (this.bestWidth < 0) this.bestWidth = Infinity;
    this.indent = -1;
    this.line = 0;
    this.column = 0;
    this.whitespace = true;
    this.indention = true;
    this.state = "FIRST_DOCUMENT_START";
  }

  private emitDocumentStart(event: Event, first: boolean): void {
    if (event.type === "DOCUMENT_START") {
      for (const [handle, prefix] of event.tagDirectives) {
        this.analyzeTagDirective(handle, prefix);
        this.appendTagDirective(handle, prefix, false);
      }
      for (const [handle, prefix] of DEFAULT_TAG_DIRECTIVES) {
        this.appendTagDirective(handle, prefix, true);
      }
      let implicit = event.implicit;
      if (!first || this.canonical) implicit = false;
      const hasVersion = event.version.length > 0;
      if ((hasVersion || event.tagDirectives.length > 0) && this.openEnded) {
        this.writeIndicator("...", true, false, false);
        this.writeIndent();
      }
      this.openEnded = 0;
      if (hasVersion) {
        implicit = false;
        this.writeIndicator("%YAML", true, false, false);
        this.writeIndicator(event.version[1] === 1 ? "1.1" : "1.2", true, false, false);
        this.writeIndent();
      }
      if (event.tagDirectives.length > 0) {
        implicit = false;
        for (const [handle, prefix] of event.tagDirectives) {
          this.writeIndicator("%TAG", true, false, false);
          this.writeTagHandle(handle);
          this.writeTagContent(prefix, true);
          this.writeIndent();
        }
      }
      if (!implicit) {
        this.writeIndent();
        this.writeIndicator("---", true, false, false);
        if (this.canonical) this.writeIndent();
      }
      this.state = "DOCUMENT_CONTENT";
      this.openEnded = 0;
      return;
    } else if (event.type === "STREAM_END") {
      if (this.openEnded === 2) {
        this.writeIndicator("...", true, false, false);
        this.openEnded = 0;
        this.writeIndent();
      }
      this.flush();
      this.state = "END";
      return;
    }
    throw new RuntimeError("expected DOCUMENT-START or STREAM-END");
  }

  private emitDocumentContent(event: Event): void {
    this.states.push("DOCUMENT_END");
    this.emitNode(event, true, false, false, false);
  }

  private emitDocumentEnd(event: Event): void {
    if (event.type !== "DOCUMENT_END") throw new RuntimeError("expected DOCUMENT-END");
    this.writeIndent();
    if (!event.implicit) {
      this.writeIndicator("...", true, false, false);
      this.openEnded = 0;
      this.writeIndent();
    } else if (!this.openEnded) {
      this.openEnded = 1;
    }
    this.flush();
    this.state = "DOCUMENT_START";
    this.tagDirectives = [];
  }

  private emitFlowSequenceItem(event: Event, first: boolean): void {
    if (first) {
      this.writeIndicator("[", true, true, false);
      this.increaseIndent(true, false);
      this.flowLevel++;
    }
    if (event.type === "SEQUENCE_END") {
      this.flowLevel--;
      this.indent = this.indents.pop()!;
      if (this.canonical && !first) {
        this.writeIndicator(",", false, false, false);
        this.writeIndent();
      }
      this.writeIndicator("]", false, false, false);
      this.state = this.states.pop()!;
      return;
    }
    if (!first) this.writeIndicator(",", false, false, false);
    if (this.canonical || this.column > this.bestWidth) this.writeIndent();
    this.states.push("FLOW_SEQUENCE_ITEM");
    this.emitNode(event, false, true, false, false);
  }

  private emitFlowMappingKey(event: Event, first: boolean): void {
    if (first) {
      this.writeIndicator("{", true, true, false);
      this.increaseIndent(true, false);
      this.flowLevel++;
    }
    if (event.type === "MAPPING_END") {
      this.flowLevel--;
      this.indent = this.indents.pop()!;
      if (this.canonical && !first) {
        this.writeIndicator(",", false, false, false);
        this.writeIndent();
      }
      this.writeIndicator("}", false, false, false);
      this.state = this.states.pop()!;
      return;
    }
    if (!first) this.writeIndicator(",", false, false, false);
    if (this.canonical || this.column > this.bestWidth) this.writeIndent();
    if (!this.canonical && this.checkSimpleKey()) {
      this.states.push("FLOW_MAPPING_SIMPLE_VALUE");
      this.emitNode(event, false, false, true, true);
    } else {
      this.writeIndicator("?", true, false, false);
      this.states.push("FLOW_MAPPING_VALUE");
      this.emitNode(event, false, false, true, false);
    }
  }

  private emitFlowMappingValue(event: Event, simple: boolean): void {
    if (simple) {
      this.writeIndicator(":", false, false, false);
    } else {
      if (this.canonical || this.column > this.bestWidth) this.writeIndent();
      this.writeIndicator(":", true, false, false);
    }
    this.states.push("FLOW_MAPPING_KEY");
    this.emitNode(event, false, false, true, false);
  }

  private emitBlockSequenceItem(event: Event, first: boolean): void {
    if (first) this.increaseIndent(false, this.mappingContext && !this.indention);
    if (event.type === "SEQUENCE_END") {
      this.indent = this.indents.pop()!;
      this.state = this.states.pop()!;
      return;
    }
    this.writeIndent();
    this.writeIndicator("-", true, false, true);
    this.states.push("BLOCK_SEQUENCE_ITEM");
    this.emitNode(event, false, true, false, false);
  }

  private emitBlockMappingKey(event: Event, first: boolean): void {
    if (first) this.increaseIndent(false, false);
    if (event.type === "MAPPING_END") {
      this.indent = this.indents.pop()!;
      this.state = this.states.pop()!;
      return;
    }
    this.writeIndent();
    if (this.checkSimpleKey()) {
      this.states.push("BLOCK_MAPPING_SIMPLE_VALUE");
      this.emitNode(event, false, false, true, true);
    } else {
      this.writeIndicator("?", true, false, true);
      this.states.push("BLOCK_MAPPING_VALUE");
      this.emitNode(event, false, false, true, false);
    }
  }

  private emitBlockMappingValue(event: Event, simple: boolean): void {
    if (simple) {
      this.writeIndicator(":", false, false, false);
    } else {
      this.writeIndent();
      this.writeIndicator(":", true, false, true);
    }
    this.states.push("BLOCK_MAPPING_KEY");
    this.emitNode(event, false, false, true, false);
  }

  private emitNode(
    event: Event,
    root: boolean,
    sequence: boolean,
    mapping: boolean,
    simpleKey: boolean,
  ): void {
    this.rootContext = root;
    this.sequenceContext = sequence;
    this.mappingContext = mapping;
    this.simpleKeyContext = simpleKey;
    switch (event.type) {
      case "ALIAS":
        return this.emitAlias();
      case "SCALAR":
        return this.emitScalar(event);
      case "SEQUENCE_START":
        return this.emitSequenceStart(event);
      case "MAPPING_START":
        return this.emitMappingStart(event);
      default:
        throw new RuntimeError("expected SCALAR, SEQUENCE-START, MAPPING-START, or ALIAS");
    }
  }

  private emitAlias(): void {
    this.processAnchor();
    if (this.simpleKeyContext) this.put(" ");
    this.state = this.states.pop()!;
  }

  private emitScalar(event: Extract<Event, { type: "SCALAR" }>): void {
    this.selectScalarStyle(event);
    this.processAnchor();
    this.processTag();
    this.increaseIndent(true, false);
    this.processScalar();
    this.indent = this.indents.pop()!;
    this.state = this.states.pop()!;
  }

  private emitSequenceStart(event: Extract<Event, { type: "SEQUENCE_START" }>): void {
    this.processAnchor();
    this.processTag();
    if (
      this.flowLevel ||
      this.canonical ||
      event.style === Sequence.FLOW ||
      this.checkEmptySequence()
    ) {
      this.state = "FLOW_SEQUENCE_FIRST_ITEM";
    } else {
      this.state = "BLOCK_SEQUENCE_FIRST_ITEM";
    }
  }

  private emitMappingStart(event: Extract<Event, { type: "MAPPING_START" }>): void {
    this.processAnchor();
    this.processTag();
    if (
      this.flowLevel ||
      this.canonical ||
      event.style === Mapping.FLOW ||
      this.checkEmptyMapping()
    ) {
      this.state = "FLOW_MAPPING_FIRST_KEY";
    } else {
      this.state = "BLOCK_MAPPING_FIRST_KEY";
    }
  }

  private increaseIndent(flow: boolean, indentless: boolean): void {
    this.indents.push(this.indent);
    if (this.indent < 0) {
      this.indent = flow ? this.bestIndent : 0;
    } else if (!indentless) {
      this.indent += this.bestIndent;
    }
  }

  private checkEmptySequence(): boolean {
    if (this.events.length < 2) return false;
    return this.events[0].type === "SEQUENCE_START" && this.events[1].type === "SEQUENCE_END";
  }

  private checkEmptyMapping(): boolean {
    if (this.events.length < 2) return false;
    return this.events[0].type === "MAPPING_START" && this.events[1].type === "MAPPING_END";
  }

  private checkSimpleKey(): boolean {
    const event = this.events[0];
    let length = 0;
    const tagLength = width(this.tagData.handle ?? "") + width(this.tagData.suffix ?? "");
    const anchorLength = width(this.anchorData?.anchor ?? "");
    switch (event.type) {
      case "ALIAS":
        length += anchorLength;
        break;
      case "SCALAR":
        if (this.scalarData.multiline) return false;
        length += anchorLength + tagLength + width(this.scalarData.value);
        break;
      case "SEQUENCE_START":
        if (!this.checkEmptySequence()) return false;
        length += anchorLength + tagLength;
        break;
      case "MAPPING_START":
        if (!this.checkEmptyMapping()) return false;
        length += anchorLength + tagLength;
        break;
      default:
        return false;
    }
    if (length > 128) return false;
    return true;
  }

  private selectScalarStyle(event: Extract<Event, { type: "SCALAR" }>): void {
    let style = event.style;
    const noTag = !this.tagData.handle && !this.tagData.suffix;
    if (noTag && !event.plainImplicit && !event.quotedImplicit) {
      throw new RuntimeError("neither tag nor implicit flags are specified");
    }
    if (style === Scalar.ANY) style = Scalar.PLAIN;
    if (this.canonical) style = Scalar.DOUBLE_QUOTED;
    if (this.simpleKeyContext && this.scalarData.multiline) style = Scalar.DOUBLE_QUOTED;
    if (style === Scalar.PLAIN) {
      if (
        (this.flowLevel && !this.scalarData.flowPlainAllowed) ||
        (!this.flowLevel && !this.scalarData.blockPlainAllowed)
      ) {
        style = Scalar.SINGLE_QUOTED;
      }
      if (!this.scalarData.value.length && (this.flowLevel || this.simpleKeyContext)) {
        style = Scalar.SINGLE_QUOTED;
      }
      if (noTag && !event.plainImplicit) style = Scalar.SINGLE_QUOTED;
    }
    if (style === Scalar.SINGLE_QUOTED) {
      if (!this.scalarData.singleQuotedAllowed) style = Scalar.DOUBLE_QUOTED;
    }
    if (style === Scalar.LITERAL || style === Scalar.FOLDED) {
      if (!this.scalarData.blockAllowed || this.flowLevel || this.simpleKeyContext) {
        style = Scalar.DOUBLE_QUOTED;
      }
    }
    if (noTag && !event.quotedImplicit && style !== Scalar.PLAIN) {
      this.tagData = { handle: "!", suffix: null };
    }
    this.scalarData.style = style;
  }

  private processAnchor(): void {
    if (!this.anchorData) return;
    this.writeIndicator(this.anchorData.alias ? "*" : "&", true, false, false);
    this.writeAnchor(this.anchorData.anchor);
  }

  private processTag(): void {
    const { handle, suffix } = this.tagData;
    if (!handle && !suffix) return;
    if (handle) {
      this.writeTagHandle(handle);
      if (suffix) this.writeTagContent(suffix, false);
    } else {
      this.writeIndicator("!<", true, false, false);
      this.writeTagContent(suffix!, false);
      this.writeIndicator(">", false, false, false);
    }
  }

  private processScalar(): void {
    const { value, style } = this.scalarData;
    switch (style) {
      case Scalar.PLAIN:
        return this.writePlainScalar(value, !this.simpleKeyContext);
      case Scalar.SINGLE_QUOTED:
        return this.writeSingleQuoted(value, !this.simpleKeyContext);
      case Scalar.DOUBLE_QUOTED:
        return this.writeDoubleQuoted(value, !this.simpleKeyContext);
      case Scalar.LITERAL:
        return this.writeLiteralScalar(value);
      case Scalar.FOLDED:
        return this.writeFoldedScalar(value);
    }
  }

  private analyzeTagDirective(handle: string, prefix: string): void {
    if (!handle.length) throw new RuntimeError("tag handle must not be empty");
    if (handle[0] !== "!") throw new RuntimeError("tag handle must start with '!'");
    if (handle.at(-1) !== "!") throw new RuntimeError("tag handle must end with '!'");
    for (const c of handle.slice(1, -1)) {
      if (!isAlpha(c)) {
        throw new RuntimeError("tag handle must contain alphanumerical characters only");
      }
    }
    if (!prefix.length) throw new RuntimeError("tag prefix must not be empty");
  }

  private appendTagDirective(handle: string, prefix: string, allowDuplicates: boolean): void {
    if (this.tagDirectives.some(([h]) => h === handle)) {
      if (allowDuplicates) return;
      throw new RuntimeError("duplicate %TAG directive");
    }
    this.tagDirectives.push([handle, prefix]);
  }

  private analyzeAnchor(anchor: string, alias: boolean): void {
    if (!anchor.length) {
      throw new RuntimeError(
        alias ? "alias value must not be empty" : "anchor value must not be empty",
      );
    }
    for (const c of anchor) {
      if (!isAlpha(c)) {
        throw new RuntimeError(
          alias
            ? "alias value must contain alphanumerical characters only"
            : "anchor value must contain alphanumerical characters only",
        );
      }
    }
    this.anchorData = { anchor, alias };
  }

  private analyzeTag(tag: string): void {
    if (!tag.length) throw new RuntimeError("tag value must not be empty");
    for (const [handle, prefix] of this.tagDirectives) {
      if (prefix.length < tag.length && tag.startsWith(prefix)) {
        this.tagData = { handle, suffix: tag.slice(prefix.length) };
        return;
      }
    }
    this.tagData = { handle: null, suffix: tag };
  }

  private analyzeScalar(value: string): void {
    const chars = Array.from(value);
    this.scalarData = {
      value,
      multiline: false,
      flowPlainAllowed: false,
      blockPlainAllowed: true,
      singleQuotedAllowed: true,
      blockAllowed: false,
      style: Scalar.ANY,
    };
    if (!chars.length) return;

    let blockIndicators = false;
    let flowIndicators = false;
    let lineBreaks = false;
    let specialCharacters = false;
    let leadingSpace = false;
    let leadingBreak = false;
    let trailingSpace = false;
    let trailingBreak = false;
    let breakSpace = false;
    let spaceBreak = false;
    let previousSpace = false;
    let previousBreak = false;

    if ((value.startsWith("---") || value.startsWith("...")) && chars.length >= 3) {
      blockIndicators = true;
      flowIndicators = true;
    }
    let precededByWhitespace = true;
    let followedByWhitespace = isBlankz(chars[1]);
    for (let i = 0; i < chars.length; i++) {
      const c = chars[i];
      if (i === 0) {
        if ("#,[]{}&*!|>'\"%@`".includes(c)) {
          flowIndicators = true;
          blockIndicators = true;
        }
        if (c === "?" || c === ":") {
          flowIndicators = true;
          if (followedByWhitespace) blockIndicators = true;
        }
        if (c === "-" && followedByWhitespace) {
          flowIndicators = true;
          blockIndicators = true;
        }
      } else {
        if (",?[]{}".includes(c)) flowIndicators = true;
        if (c === ":") {
          flowIndicators = true;
          if (followedByWhitespace) blockIndicators = true;
        }
        if (c === "#" && precededByWhitespace) {
          flowIndicators = true;
          blockIndicators = true;
        }
      }
      if (!isPrintable(c) || (c.codePointAt(0)! > 0x7f && !this.unicode)) {
        specialCharacters = true;
      }
      if (isBreak(c)) lineBreaks = true;
      if (isSpace(c)) {
        if (i === 0) leadingSpace = true;
        if (i === chars.length - 1) trailingSpace = true;
        if (previousBreak) breakSpace = true;
        previousSpace = true;
        previousBreak = false;
      } else if (isBreak(c)) {
        if (i === 0) leadingBreak = true;
        if (i === chars.length - 1) trailingBreak = true;
        if (previousSpace) spaceBreak = true;
        previousBreak = true;
        previousSpace = false;
      } else {
        previousSpace = false;
        previousBreak = false;
      }
      precededByWhitespace = isBlankz(c);
      if (i + 1 < chars.length) followedByWhitespace = isBlankz(chars[i + 2]);
    }

    const data = this.scalarData;
    data.multiline = lineBreaks;
    data.flowPlainAllowed = true;
    data.blockPlainAllowed = true;
    data.singleQuotedAllowed = true;
    data.blockAllowed = true;
    if (leadingSpace || leadingBreak || trailingSpace || trailingBreak) {
      data.flowPlainAllowed = false;
      data.blockPlainAllowed = false;
    }
    if (trailingSpace) data.blockAllowed = false;
    if (breakSpace) {
      data.flowPlainAllowed = false;
      data.blockPlainAllowed = false;
      data.singleQuotedAllowed = false;
    }
    if (spaceBreak || specialCharacters) {
      data.flowPlainAllowed = false;
      data.blockPlainAllowed = false;
      data.singleQuotedAllowed = false;
      data.blockAllowed = false;
    }
    if (lineBreaks) {
      data.flowPlainAllowed = false;
      data.blockPlainAllowed = false;
    }
    if (flowIndicators) data.flowPlainAllowed = false;
    if (blockIndicators) data.blockPlainAllowed = false;
  }

  private analyzeEvent(event: Event): void {
    this.anchorData = null;
    this.tagData = { handle: null, suffix: null };
    this.scalarData = {
      value: "",
      multiline: false,
      flowPlainAllowed: false,
      blockPlainAllowed: false,
      singleQuotedAllowed: false,
      blockAllowed: false,
      style: Scalar.ANY,
    };
    switch (event.type) {
      case "ALIAS":
        this.analyzeAnchor(event.anchor, true);
        return;
      case "SCALAR":
        if (event.anchor != null) this.analyzeAnchor(event.anchor, false);
        if (
          event.tag != null &&
          (this.canonical || (!event.plainImplicit && !event.quotedImplicit))
        ) {
          this.analyzeTag(event.tag);
        }
        this.analyzeScalar(event.value);
        return;
      case "SEQUENCE_START":
      case "MAPPING_START":
        if (event.anchor != null) this.analyzeAnchor(event.anchor, false);
        if (event.tag != null && (this.canonical || !event.implicit)) this.analyzeTag(event.tag);
        return;
    }
  }

  private flush(): void {
    if (!this.buffer.length) return;
    this.io.write(this.buffer);
    this.buffer = "";
  }

  private put(value: string): void {
    this.buffer += value;
    this.column++;
  }

  private putBreak(): void {
    this.buffer += "\n";
    this.column = 0;
    this.line++;
  }

  private write(c: string): void {
    this.buffer += c;
    this.column++;
  }

  private writeBreak(c: string): void {
    if (c === "\n") {
      this.putBreak();
    } else {
      this.buffer += c;
      this.column = 0;
      this.line++;
    }
  }

  private writeIndent(): void {
    const indent = this.indent >= 0 ? this.indent : 0;
    if (!this.indention || this.column > indent || (this.column === indent && !this.whitespace)) {
      this.putBreak();
    }
    while (this.column < indent) this.put(" ");
    this.whitespace = true;
    this.indention = true;
  }

  private writeIndicator(
    indicator: string,
    needWhitespace: boolean,
    isWhitespace: boolean,
    isIndention: boolean,
  ): void {
    if (needWhitespace && !this.whitespace) this.put(" ");
    for (const c of indicator) this.write(c);
    this.whitespace = isWhitespace;
    this.indention = this.indention && isIndention;
  }

  private writeAnchor(value: string): void {
    for (const c of value) this.write(c);
    this.whitespace = false;
    this.indention = false;
  }

  private writeTagHandle(value: string): void {
    if (!this.whitespace) this.put(" ");
    for (const c of value) this.write(c);
    this.whitespace = false;
    this.indention = false;
  }

  private writeTagContent(value: string, needWhitespace: boolean): void {
    if (needWhitespace && !this.whitespace) this.put(" ");
    for (const c of value) {
      if (isAlpha(c) || ";/?:@&=+$,_.~*'()[]".includes(c)) {
        this.write(c);
      } else {
        for (const byte of encoder.encode(c)) {
          this.put("%");
          this.put(byte.toString(16).toUpperCase().padStart(2, "0")[0]);
          this.put(byte.toString(16).toUpperCase().padStart(2, "0")[1]);
        }
      }
    }
    this.whitespace = false;
    this.indention = false;
  }

  private writePlainScalar(value: string, allowBreaks: boolean): void {
    const chars = Array.from(value);
    let spaces = false;
    let breaks = false;
    if (!this.whitespace && (chars.length || this.flowLevel)) this.put(" ");
    for (let i = 0; i < chars.length; i++) {
      const c = chars[i];
      if (isSpace(c)) {
        if (allowBreaks && !spaces && this.column > this.bestWidth && !isSpace(chars[i + 1])) {
          this.writeIndent();
        } else {
          this.write(c);
        }
        spaces = true;
      } else if (isBreak(c)) {
        if (!breaks && c === "\n") this.putBreak();
        this.writeBreak(c);
        this.indention = true;
        breaks = true;
      } else {
        if (breaks) this.writeIndent();
        this.write(c);
        this.indention = false;
        spaces = false;
        breaks = false;
      }
    }
    this.whitespace = false;
    this.indention = false;
  }

  private writeSingleQuoted(value: string, allowBreaks: boolean): void {
    const chars = Array.from(value);
    let spaces = false;
    let breaks = false;
    this.writeIndicator("'", true, false, false);
    for (let i = 0; i < chars.length; i++) {
      const c = chars[i];
      if (isSpace(c)) {
        if (
          allowBreaks &&
          !spaces &&
          this.column > this.bestWidth &&
          i !== 0 &&
          i !== chars.length - 1 &&
          !isSpace(chars[i + 1])
        ) {
          this.writeIndent();
        } else {
          this.write(c);
        }
        spaces = true;
      } else if (isBreak(c)) {
        if (!breaks && c === "\n") this.putBreak();
        this.writeBreak(c);
        this.indention = true;
        breaks = true;
      } else {
        if (breaks) this.writeIndent();
        if (c === "'") this.put("'");
        this.write(c);
        this.indention = false;
        spaces = false;
        breaks = false;
      }
    }
    if (breaks) this.writeIndent();
    this.writeIndicator("'", false, false, false);
    this.whitespace = false;
    this.indention = false;
  }

  private writeDoubleQuoted(value: string, allowBreaks: boolean): void {
    const chars = Array.from(value);
    let spaces = false;
    this.writeIndicator('"', true, false, false);
    for (let i = 0; i < chars.length; i++) {
      const c = chars[i];
      if (
        !isPrintable(c) ||
        (!this.unicode && c.codePointAt(0)! > 0x7f) ||
        isBom(c) ||
        isBreak(c) ||
        c === '"' ||
        c === "\\"
      ) {
        this.put("\\");
        const code = c.codePointAt(0)!;
        const ESCAPES: Record<number, string> = {
          0x00: "0",
          0x07: "a",
          0x08: "b",
          0x09: "t",
          0x0a: "n",
          0x0b: "v",
          0x0c: "f",
          0x0d: "r",
          0x1b: "e",
          0x22: '"',
          0x5c: "\\",
          0x85: "N",
          0xa0: "_",
          0x2028: "L",
          0x2029: "P",
        };
        if (code in ESCAPES) {
          this.put(ESCAPES[code]);
        } else {
          const [indicator, digits] =
            code <= 0xff ? ["x", 2] : code <= 0xffff ? ["u", 4] : ["U", 8];
          this.put(indicator);
          for (const digit of code.toString(16).toUpperCase().padStart(digits, "0")) {
            this.put(digit);
          }
        }
        spaces = false;
      } else if (isSpace(c)) {
        if (
          allowBreaks &&
          !spaces &&
          this.column > this.bestWidth &&
          i !== 0 &&
          i !== chars.length - 1
        ) {
          this.writeIndent();
          if (isSpace(chars[i + 1])) this.put("\\");
        } else {
          this.write(c);
        }
        spaces = true;
      } else {
        this.write(c);
        spaces = false;
      }
    }
    this.writeIndicator('"', false, false, false);
    this.whitespace = false;
    this.indention = false;
  }

  private writeBlockScalarHints(chars: string[]): void {
    let chompHint: string | null = null;
    if (isSpace(chars[0]) || isBreak(chars[0])) {
      this.writeIndicator(String(this.bestIndent), false, false, false);
    }
    this.openEnded = 0;
    if (!chars.length) {
      chompHint = "-";
    } else if (!isBreak(chars.at(-1))) {
      chompHint = "-";
    } else if (chars.length === 1) {
      chompHint = "+";
      this.openEnded = 2;
    } else if (isBreak(chars.at(-2))) {
      chompHint = "+";
      this.openEnded = 2;
    }
    if (chompHint) this.writeIndicator(chompHint, false, false, false);
  }

  private writeLiteralScalar(value: string): void {
    const chars = Array.from(value);
    let breaks = true;
    this.writeIndicator("|", true, false, false);
    this.writeBlockScalarHints(chars);
    this.putBreak();
    this.indention = true;
    this.whitespace = true;
    for (const c of chars) {
      if (isBreak(c)) {
        this.writeBreak(c);
        this.indention = true;
        breaks = true;
      } else {
        if (breaks) this.writeIndent();
        this.write(c);
        this.indention = false;
        breaks = false;
      }
    }
  }

  private writeFoldedScalar(value: string): void {
    const chars = Array.from(value);
    let breaks = true;
    let leadingSpaces = true;
    this.writeIndicator(">", true, false, false);
    this.writeBlockScalarHints(chars);
    this.putBreak();
    this.indention = true;
    this.whitespace = true;
    for (let i = 0; i < chars.length; i++) {
      const c = chars[i];
      if (isBreak(c)) {
        if (!breaks && !leadingSpaces && c === "\n") {
          let k = 0;
          while (isBreak(chars[i + k])) k++;
          if (!isBlankz(chars[i + k])) this.putBreak();
        }
        this.writeBreak(c);
        this.indention = true;
        breaks = true;
      } else {
        if (breaks) {
          this.writeIndent();
          leadingSpaces = isBlank(c);
        }
        if (!breaks && isSpace(c) && !isSpace(chars[i + 1]) && this.column > this.bestWidth) {
          this.writeIndent();
        } else {
          this.write(c);
        }
        this.indention = false;
        breaks = false;
      }
    }
  }
}

registerConstant("Psych::Emitter", Emitter);
