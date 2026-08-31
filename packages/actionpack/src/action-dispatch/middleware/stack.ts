/**
 * ActionDispatch::MiddlewareStack
 *
 * An ordered list of middleware with insertion/removal operations.
 */

import type { RackEnv, RackResponse } from "@blazetrails/rack";

export type RackApp = (env: RackEnv) => Promise<RackResponse>;

/**
 * A Rack application that answers `call` as a method rather than being one.
 * Ruby has a single shape here — `MiddlewareStack#build` folds over anything
 * that responds to `call` (`stack.rb:166-175`), which is how
 * `Engine#endpoint` hands its `RouteSet` straight to the stack
 * (`engine.rb:521`) — while JS keeps a function and a `call`-bearing object
 * apart, so both spellings are named.
 *
 * @noRailsEquivalent PERMANENT
 */
export interface RackAppObject {
  call(env: RackEnv): Promise<RackResponse>;
}
type MiddlewareFactory = new (
  app: RackApp,
  ...args: any[]
) => { call(env: RackEnv): Promise<RackResponse> };

export interface MiddlewareEntry {
  klass: MiddlewareFactory;
  args: unknown[];
  block?: (app: RackApp) => RackApp;
  /**
   * `ActionController::MiddlewareStack::Middleware#valid?`
   * (`action_controller/metal.rb:26-28`) — absent on a plain
   * `ActionDispatch` entry, which Ruby models as a different class.
   */
  valid?(action: string): boolean;
}

export class MiddlewareStack implements Iterable<MiddlewareEntry> {
  private entries: MiddlewareEntry[] = [];

  constructor() {
    // matches Rails `initialize(*args)` — block form is not ported.
  }

  get middlewares(): MiddlewareEntry[] {
    return this.entries;
  }

  set middlewares(value: MiddlewareEntry[]) {
    this.entries = value;
  }

  get length(): number {
    return this.entries.length;
  }

  get size(): number {
    return this.entries.length;
  }

  /** Ruby `Object#dup` — a shallow copy of the entry list. */
  dup(): this {
    const copy = new (this.constructor as new () => this)();
    copy.middlewares = [...this.entries];
    return copy;
  }

  /** `Enumerable#any?` over the stack — `middleware_stack.any?` at `metal.rb:322, :332`. */
  any(): boolean {
    return this.entries.length > 0;
  }

  each(callback: (entry: MiddlewareEntry) => void): void {
    for (const entry of this.entries) callback(entry);
  }

  last(): MiddlewareEntry | undefined {
    return this.entries[this.entries.length - 1];
  }

  deleteBang(target: MiddlewareFactory): void {
    const idx = this.findIndex(target);
    if (idx === -1) {
      const name = (target as { name?: string }).name;
      throw new Error(`No such middleware to remove: ${name || String(target)}`);
    }
    this.entries.splice(idx, 1);
  }

  /**
   * A Ruby `&block` has no positional spelling next to `*args`; trails names
   * the block form `useWithBlock`, so this arm has no block to forward.
   *
   * @missingRailsArgs build_middleware — PERMANENT
   */
  use(klass: MiddlewareFactory, ...args: unknown[]): void {
    this.entries.push(this.buildMiddleware(klass, args));
  }

  useWithBlock(
    klass: MiddlewareFactory,
    block: (app: RackApp) => RackApp,
    ...args: unknown[]
  ): void {
    this.entries.push(this.buildMiddleware(klass, args, block));
  }

  /** @missingRailsArgs build_middleware — PERMANENT */
  unshift(klass: MiddlewareFactory, ...args: unknown[]): void {
    this.entries.unshift(this.buildMiddleware(klass, args));
  }

  /** @missingRailsArgs build_middleware — PERMANENT */
  insert(index: number, klass: MiddlewareFactory, ...args: unknown[]): void {
    if (index < 0 || index > this.entries.length) {
      throw new Error(`Invalid index ${index} for middleware stack of size ${this.entries.length}`);
    }
    this.entries.splice(index, 0, this.buildMiddleware(klass, args));
  }

  insertBefore(index: MiddlewareFactory, klass: MiddlewareFactory, ...args: unknown[]): void {
    const idx = this.findIndex(index);
    if (idx === -1) throw new Error("No such middleware to insert before");
    this.entries.splice(idx, 0, this.buildMiddleware(klass, args));
  }

  insertAfter(index: MiddlewareFactory | number, ...args: unknown[]): void {
    const [klass, ...rest] = args as [MiddlewareFactory, ...unknown[]];
    if (typeof index === "number") {
      this.entries.splice(index + 1, 0, this.buildMiddleware(klass, rest));
    } else {
      const idx = this.findIndex(index);
      if (idx === -1) throw new Error("No such middleware to insert after");
      this.entries.splice(idx + 1, 0, this.buildMiddleware(klass, rest));
    }
  }

  swap(target: MiddlewareFactory, ...args: unknown[]): void {
    const [klass, ...rest] = args as [MiddlewareFactory, ...unknown[]];
    const idx = this.findIndex(target);
    if (idx === -1) throw new Error("No such middleware to swap");
    this.entries[idx] = this.buildMiddleware(klass, rest);
  }

  delete(target: MiddlewareFactory): void {
    const idx = this.findIndex(target);
    if (idx !== -1) {
      this.entries.splice(idx, 1);
    }
  }

  deleteStrict(target: MiddlewareFactory): void {
    const idx = this.findIndex(target);
    if (idx === -1) throw new Error("No such middleware to delete");
    this.entries.splice(idx, 1);
  }

  move(target: MiddlewareFactory | number, source: MiddlewareFactory | number): void {
    const sourceIndex = this.assertIndex(source, "before");
    const [sourceMiddleware] = this.entries.splice(sourceIndex, 1);

    const targetIndex = this.assertIndex(target, "before");
    this.entries.splice(targetIndex, 0, sourceMiddleware);
  }

  /** Rails: `alias_method :move_before, :move`. */
  moveBefore(target: MiddlewareFactory | number, source: MiddlewareFactory | number): void {
    this.move(target, source);
  }

  moveAfter(target: MiddlewareFactory | number, source: MiddlewareFactory | number): void {
    const sourceIndex = this.assertIndex(source, "after");
    const [sourceMiddleware] = this.entries.splice(sourceIndex, 1);

    const targetIndex = this.assertIndex(target, "after");
    this.entries.splice(targetIndex + 1, 0, sourceMiddleware);
  }

  includes(klass: MiddlewareFactory): boolean {
    return this.findIndex(klass) !== -1;
  }

  get(index: number): MiddlewareEntry | undefined {
    return this.entries[index];
  }

  toArray(): MiddlewareEntry[] {
    return [...this.entries];
  }

  /**
   * @noRailsEquivalent PERMANENT
   *   (`use-site:vendor/rails/actionpack/lib/action_dispatch/middleware/stack.rb:72, :81` — `include
   *   Enumerable` plus `def each`).
   * JS iteration protocol — Ruby reaches iteration through Enumerable#each
   */
  [Symbol.iterator](): Iterator<MiddlewareEntry> {
    return this.entries[Symbol.iterator]();
  }

  build(app: RackApp | RackAppObject): RackApp {
    let current: RackApp = typeof app === "function" ? app : (env: RackEnv) => app.call(env);
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const entry = this.entries[i];
      if (entry.block) {
        current = entry.block(current);
      } else {
        const mw = new entry.klass(current, ...entry.args);
        current = (env: RackEnv) => mw.call(env);
      }
    }
    return current;
  }

  private findIndex(klass: MiddlewareFactory): number {
    return this.entries.findIndex((e) => e.klass === klass);
  }

  /** @internal */
  assertIndex(index: number | MiddlewareFactory, where: "before" | "after"): number {
    const i = typeof index === "number" ? index : this.indexOf(index);
    if (i === -1) {
      throw new Error(`No such middleware to insert ${where}: ${String(index)}`);
    }
    return i;
  }

  /**
   * `MiddlewareStack#build_middleware` (`stack.rb:184-186`) — the one place
   * an entry is constructed, so `ActionController::MiddlewareStack` can
   * override it (`action_controller/metal.rb:44-52`).
   *
   * @internal
   */
  buildMiddleware(
    klass: MiddlewareFactory,
    args: unknown[],
    block?: (app: RackApp) => RackApp,
  ): MiddlewareEntry {
    return { klass, args, block };
  }

  /** @internal */
  indexOf(klass: MiddlewareFactory): number {
    return this.findIndex(klass);
  }
}
