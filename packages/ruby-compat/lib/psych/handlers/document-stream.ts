import { Document } from "../nodes/document.js";
import { TreeBuilder } from "../tree-builder.js";

/**
 * `Psych::Handlers::DocumentStream` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/handlers/document_stream.rb:6`).
 *
 * @noRailsEquivalent PERMANENT
 */
export class DocumentStream extends TreeBuilder {
  private readonly block: (document: Document) => unknown;

  /** @noRailsEquivalent PERMANENT */
  constructor(block: (document: Document) => unknown) {
    super();
    this.block = block;
  }

  /** @noRailsEquivalent PERMANENT */
  override startDocument(
    version: number[],
    tagDirectives: [string, string][],
    implicit: boolean,
  ): Document {
    const n = new Document(version, tagDirectives, implicit);
    return this.push(n);
  }

  /** @noRailsEquivalent PERMANENT */
  override endDocument(implicitEnd: boolean = !this.isStreaming()): unknown {
    (this.last as Document).implicitEnd = implicitEnd;
    return this.block(this.pop() as Document);
  }
}
