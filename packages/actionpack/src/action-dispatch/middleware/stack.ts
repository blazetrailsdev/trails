import type { RackEnv, RackResponse } from "@blazetrails/rack";

export type RackApp = (env: RackEnv) => Promise<RackResponse>;

/** @noRailsEquivalent PERMANENT */
export interface RackAppObject {
  call(env: RackEnv): Promise<RackResponse>;
}
export type MiddlewareBlock = (...args: any[]) => unknown;

export type MiddlewareFactory = new (
  app: RackApp,
  ...args: any[]
) => { call(env: RackEnv): Promise<RackResponse> };

export class Middleware {
  constructor(
    readonly klass: MiddlewareFactory,
    readonly args: unknown[],
    readonly block?: MiddlewareBlock,
  ) {}

  inspect(): string {
    return typeof this.klass === "function"
      ? this.klass.name
      : (this.klass as object).constructor.name;
  }

  build(app: RackApp): RackApp {
    const mw = new this.klass(app, ...this.args, ...(this.block ? [this.block] : []));
    return (env: RackEnv) => mw.call(env);
  }
}

export class MiddlewareStack implements Iterable<Middleware> {
  private entries: Middleware[] = [];

  constructor() {}

  get middlewares(): Middleware[] {
    return this.entries;
  }

  set middlewares(value: Middleware[]) {
    this.entries = value;
  }

  get length(): number {
    return this.entries.length;
  }

  get size(): number {
    return this.entries.length;
  }

  dup(): this {
    const copy = new (this.constructor as new () => this)();
    copy.middlewares = [...this.entries];
    return copy;
  }

  isAny(): boolean {
    return this.entries.length > 0;
  }

  each(callback: (entry: Middleware) => void): void {
    for (const entry of this.entries) callback(entry);
  }

  last(): Middleware | undefined {
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

  /** @missingRailsArgs build_middleware — PERMANENT */
  use(klass: MiddlewareFactory, ...args: unknown[]): void {
    this.entries.push(this.buildMiddleware(klass, args));
  }

  /** @missingRailsArgs build_middleware — PERMANENT */
  unshift(klass: MiddlewareFactory, ...args: unknown[]): void {
    this.entries.unshift(this.buildMiddleware(klass, args));
  }

  /** @missingRailsArgs build_middleware — PERMANENT */
  insert(index: MiddlewareFactory | number, klass: MiddlewareFactory, ...args: unknown[]): void {
    index = this.assertIndex(index, "before");
    this.middlewares.splice(index, 0, this.buildMiddleware(klass, args));
  }

  insertBefore(
    index: MiddlewareFactory | number,
    klass: MiddlewareFactory,
    ...args: unknown[]
  ): void {
    this.insert(index, klass, ...args);
  }

  insertAfter(index: MiddlewareFactory | number, ...args: unknown[]): void {
    index = this.assertIndex(index, "after");
    this.insert(index + 1, ...(args as [MiddlewareFactory, ...unknown[]]));
  }

  swap(target: MiddlewareFactory | number, ...args: unknown[]): void {
    const index = this.assertIndex(target, "before");
    this.insert(index, ...(args as [MiddlewareFactory, ...unknown[]]));
    this.middlewares.splice(index + 1, 1);
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

  get(index: number): Middleware | undefined {
    return this.entries[index];
  }

  toArray(): Middleware[] {
    return [...this.entries];
  }

  /** @noRailsEquivalent PERMANENT */
  [Symbol.iterator](): Iterator<Middleware> {
    return this.entries[Symbol.iterator]();
  }

  build(app: RackApp | RackAppObject): RackApp {
    let current: RackApp = typeof app === "function" ? app : (env: RackEnv) => app.call(env);
    for (let i = this.entries.length - 1; i >= 0; i--) {
      current = this.entries[i].build(current);
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
      throw new Error(
        `No such middleware to insert ${where}: ${typeof index === "number" ? index : index.name}`,
      );
    }
    return i;
  }

  /** @internal */
  buildMiddleware(klass: MiddlewareFactory, args: unknown[], block?: MiddlewareBlock): Middleware {
    return new Middleware(klass, args, block);
  }

  /** @internal */
  indexOf(klass: MiddlewareFactory): number {
    return this.findIndex(klass);
  }
}
