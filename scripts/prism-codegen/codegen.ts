/**
 * The emitter: walks a Prism AST through the {@link Registry}, tracking
 * per-kind coverage. Handled kinds run their handler; unhandled kinds fall to
 * a marked `/* TODO *​/` passthrough that still recurses into children, so
 * nested handled nodes below an unhandled parent are still emitted and
 * counted. This is what makes coverage a fine-grained per-node-instance metric
 * rather than a whole-file pass/fail.
 */
import { Registry } from "./registry.js";
import type { Coverage, Emitter, PrismNode } from "./types.js";

class CoverageTally implements Coverage {
  readonly counts = new Map<string, { handled: number; passthrough: number }>();
  record(kind: string, handled: boolean): void {
    const c = this.counts.get(kind) ?? { handled: 0, passthrough: 0 };
    if (handled) c.handled++;
    else c.passthrough++;
    this.counts.set(kind, c);
  }
}

export class Codegen implements Emitter {
  readonly coverage = new CoverageTally();
  inClass = false;
  inAsyncMethod = false;
  constructor(
    private readonly registry: Registry,
    readonly asyncMethods: ReadonlySet<string> = new Set(),
  ) {}

  emit(node: PrismNode | null | undefined): string {
    if (!node || !node.constructor) return "";
    const kind = node.constructor.name;
    const handler = this.registry.get(kind);
    this.coverage.record(kind, handler !== undefined);
    if (handler) return handler(node, this);
    return this.passthrough(node, kind);
  }

  /**
   * Unhandled node: emit a marked TODO but keep walking children so any
   * handled descendants still contribute output and coverage. Children are
   * emitted newline-joined inside a comment-tagged block.
   */
  private passthrough(node: PrismNode, kind: string): string {
    const children = node
      .compactChildNodes()
      .map((c) => this.emit(c))
      .filter((s) => s.trim().length > 0);
    if (children.length === 0) return `/* TODO(${kind}) */`;
    return `/* TODO(${kind}) */ ${children.join(" ")}`;
  }

  emitBody(node: PrismNode | null | undefined): string {
    if (!node) return "";
    // A StatementsNode holds an ordered list of statements.
    const kids = node.constructor?.name === "StatementsNode" ? node.compactChildNodes() : [node];
    return kids
      .map((s) => {
        const code = this.emit(s);
        return endsInBlock(code) ? code : code + ";";
      })
      .filter((s) => s.trim().length > 1)
      .join("\n");
  }

  indent(src: string): string {
    return src
      .split("\n")
      .map((l) => (l.length ? "  " + l : l))
      .join("\n");
  }
}

/** Statements that already close with `}` or a comment don't get a `;`. */
function endsInBlock(code: string): boolean {
  const t = code.trimEnd();
  return t.endsWith("}") || t.endsWith("*/") || t.length === 0;
}
