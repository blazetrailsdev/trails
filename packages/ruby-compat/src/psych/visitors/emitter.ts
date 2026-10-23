import type { PsychIO } from "../../psych-adapter.js";
import { Emitter as PsychEmitter, type DumperOptions } from "../emitter.js";
import type { Alias } from "../nodes/alias.js";
import type { Document } from "../nodes/document.js";
import type { Mapping } from "../nodes/mapping.js";
import type { Scalar } from "../nodes/scalar.js";
import type { Sequence } from "../nodes/sequence.js";
import type { Stream } from "../nodes/stream.js";
import { registerConstant } from "../../variable.js";
import { Visitor } from "./visitor.js";

/**
 * `Psych::Visitors::Emitter` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/visitors/emitter.rb:4`).
 *
 * @noRailsEquivalent PERMANENT
 */
export class Emitter extends Visitor {
  private readonly handler: PsychEmitter;

  /** @noRailsEquivalent PERMANENT */
  constructor(io: PsychIO, options: DumperOptions = {}) {
    super();
    const opts = (["indentation", "canonical", "lineWidth"] as const).filter(
      (opt) => opt in options,
    );

    if (opts.length === 0) {
      this.handler = new PsychEmitter(io);
    } else {
      const du: DumperOptions = {};
      for (const option of opts) (du as Record<string, unknown>)[option] = options[option];
      this.handler = new PsychEmitter(io, du);
    }
  }

  /** @noRailsEquivalent PERMANENT */
  visitPsychNodesStream(o: Stream): void {
    this.handler.startStream(o.encoding);
    for (const c of o.children) this.accept(c);
    this.handler.endStream();
  }

  /** @noRailsEquivalent PERMANENT */
  visitPsychNodesDocument(o: Document): void {
    this.handler.startDocument(o.version, o.tagDirectives, o.implicit);
    for (const c of o.children) this.accept(c);
    this.handler.endDocument(o.implicitEnd);
  }

  /** @noRailsEquivalent PERMANENT */
  visitPsychNodesScalar(o: Scalar): void {
    this.handler.scalar(o.value, o.anchor, o.tag, o.plain, o.quoted, o.style);
  }

  /** @noRailsEquivalent PERMANENT */
  visitPsychNodesSequence(o: Sequence): void {
    this.handler.startSequence(o.anchor, o.tag, o.implicit, o.style);
    for (const c of o.children) this.accept(c);
    this.handler.endSequence();
  }

  /** @noRailsEquivalent PERMANENT */
  visitPsychNodesMapping(o: Mapping): void {
    this.handler.startMapping(o.anchor, o.tag, o.implicit, o.style);
    for (const c of o.children) this.accept(c);
    this.handler.endMapping();
  }

  /** @noRailsEquivalent PERMANENT */
  visitPsychNodesAlias(o: Alias): void {
    this.handler.alias(o.anchor);
  }
}

registerConstant("Psych::Visitors::Emitter", Emitter);
