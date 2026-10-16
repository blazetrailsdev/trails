import { Handler } from "./handler.js";
import { Alias } from "./nodes/alias.js";
import { Document } from "./nodes/document.js";
import { Mapping } from "./nodes/mapping.js";
import type { Node } from "./nodes/node.js";
import { Scalar } from "./nodes/scalar.js";
import { Sequence } from "./nodes/sequence.js";
import { Stream } from "./nodes/stream.js";

/**
 * `Psych::TreeBuilder` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/tree_builder.rb:17`).
 *
 * @noRailsEquivalent PERMANENT
 */
export class TreeBuilder extends Handler {
  /** @noRailsEquivalent PERMANENT */
  root: Stream | null = null;
  protected stack: Node[] = [];
  protected last: Node | null = null;
  private startLine: number | null = null;
  private startColumn: number | null = null;
  private endLine: number | null = null;
  private endColumn: number | null = null;

  /** @noRailsEquivalent PERMANENT */
  override eventLocation(
    startLine: number,
    startColumn: number,
    endLine: number,
    endColumn: number,
  ): void {
    this.startLine = startLine;
    this.startColumn = startColumn;
    this.endLine = endLine;
    this.endColumn = endColumn;
  }

  /** @noRailsEquivalent PERMANENT */
  override startSequence(
    anchor: string | null,
    tag: string | null,
    implicit: boolean,
    style: number,
  ): Sequence {
    const n = new Sequence(anchor, tag, implicit, style);
    this.setStartLocation(n);
    this.last!.children.push(n);
    return this.push(n);
  }

  /** @noRailsEquivalent PERMANENT */
  override endSequence(): Sequence {
    const n = this.pop() as Sequence;
    this.setEndLocation(n);
    return n;
  }

  /** @noRailsEquivalent PERMANENT */
  override startMapping(
    anchor: string | null,
    tag: string | null,
    implicit: boolean,
    style: number,
  ): Mapping {
    const n = new Mapping(anchor, tag, implicit, style);
    this.setStartLocation(n);
    this.last!.children.push(n);
    return this.push(n);
  }

  /** @noRailsEquivalent PERMANENT */
  override endMapping(): Mapping {
    const n = this.pop() as Mapping;
    this.setEndLocation(n);
    return n;
  }

  /** @noRailsEquivalent PERMANENT */
  override startDocument(
    version: number[],
    tagDirectives: [string, string][],
    implicit: boolean,
  ): Document {
    const n = new Document(version, tagDirectives, implicit);
    this.setStartLocation(n);
    this.last!.children.push(n);
    return this.push(n);
  }

  /** @noRailsEquivalent PERMANENT */
  override endDocument(implicitEnd: boolean = !this.isStreaming()): unknown {
    (this.last as Document).implicitEnd = implicitEnd;
    const n = this.pop() as Document;
    this.setEndLocation(n);
    return n;
  }

  /** @noRailsEquivalent PERMANENT */
  override startStream(encoding: number): Stream {
    this.root = new Stream(encoding);
    this.setStartLocation(this.root);
    return this.push(this.root);
  }

  /** @noRailsEquivalent PERMANENT */
  override endStream(): Stream {
    const n = this.pop() as Stream;
    this.setEndLocation(n);
    return n;
  }

  /** @noRailsEquivalent PERMANENT */
  override scalar(
    value: string,
    anchor: string | null,
    tag: string | null,
    plain: boolean,
    quoted: boolean,
    style: number,
  ): Scalar {
    const s = new Scalar(value, anchor, tag, plain, quoted, style);
    this.setLocation(s);
    this.last!.children.push(s);
    return s;
  }

  /** @noRailsEquivalent PERMANENT */
  override alias(anchor: string): Alias {
    const a = new Alias(anchor);
    this.setLocation(a);
    this.last!.children.push(a);
    return a;
  }

  protected push<T extends Node>(value: T): T {
    this.stack.push(value);
    this.last = value;
    return value;
  }

  protected pop(): Node | undefined {
    const x = this.stack.pop();
    this.last = this.stack.at(-1) ?? null;
    return x;
  }

  private setLocation(node: Node): void {
    this.setStartLocation(node);
    this.setEndLocation(node);
  }

  private setStartLocation(node: Node): void {
    node.startLine = this.startLine;
    node.startColumn = this.startColumn;
  }

  private setEndLocation(node: Node): void {
    node.endLine = this.endLine;
    node.endColumn = this.endColumn;
  }
}
