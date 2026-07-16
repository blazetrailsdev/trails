/**
 * Extensible handler registry keyed by Prism node kind.
 *
 * This is the architectural centerpiece of the spike: dispatch is a Map
 * lookup, NOT a switch/if-chain. A new node kind is supported by calling
 * `registry.on("SomeNode", handler)` — no central dispatch block to edit.
 * Unhandled kinds degrade gracefully to a marked passthrough (see
 * `Codegen`), so a file always produces output.
 */
import type { Handler } from "./types.js";

export class Registry {
  private readonly handlers = new Map<string, Handler>();

  /** Register (or override) the handler for a Prism node kind. */
  on(kind: string, handler: Handler): this {
    this.handlers.set(kind, handler);
    return this;
  }

  /** Register many kinds that share one handler (e.g. all literal reads). */
  onMany(kinds: string[], handler: Handler): this {
    for (const k of kinds) this.on(k, handler);
    return this;
  }

  get(kind: string): Handler | undefined {
    return this.handlers.get(kind);
  }

  has(kind: string): boolean {
    return this.handlers.has(kind);
  }

  get size(): number {
    return this.handlers.size;
  }
}
