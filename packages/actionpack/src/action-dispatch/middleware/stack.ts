import {
  RuntimeError,
  deleteAt,
  rbInspect,
  insert,
  rbBlockGivenP,
  rbFSend,
} from "@blazetrails/ruby-compat";
import { Notifications } from "@blazetrails/activesupport";
import type { RackEnv, RackResponse } from "@blazetrails/rack";

export type RackApp = (env: RackEnv) => Promise<RackResponse>;

/** @noRailsEquivalent PERMANENT */
export interface RackAppObject {
  call(env: RackEnv): Promise<RackResponse>;
}
export type MiddlewareBlock = (...args: any[]) => unknown;

export type MiddlewareFactory = new (
  app: any,
  ...args: any[]
) => { call(env: RackEnv): Promise<RackResponse> };

export class Middleware {
  constructor(
    readonly klass: MiddlewareFactory,
    readonly args: unknown[],
    readonly block?: MiddlewareBlock,
  ) {}

  get name(): string {
    return this.klass.name;
  }

  equals(middleware: unknown): boolean | undefined {
    if (middleware instanceof Middleware) return this.klass === middleware.klass;
    if (typeof middleware === "function") return this.klass === middleware;
    return undefined;
  }

  inspect(): string {
    return typeof this.klass === "function"
      ? this.klass.name
      : (this.klass as object).constructor.name;
  }

  build(app: RackApp | RackAppObject): RackApp | RackAppObject {
    return new this.klass(app, ...this.args, ...(this.block ? [this.block] : []));
  }

  buildInstrumented(app: RackApp | RackAppObject): InstrumentationProxy {
    return new InstrumentationProxy(this.build(app), this.inspect());
  }
}

export class InstrumentationProxy {
  static readonly EVENT_NAME = "process_middleware.action_dispatch";

  private _middleware: RackApp | RackAppObject;
  private _payload: { middleware: string };

  constructor(middleware: RackApp | RackAppObject, className: string) {
    this._middleware = middleware;

    this._payload = {
      middleware: className,
    };
  }

  call(env: RackEnv): Promise<RackResponse> {
    return Notifications.instrument(
      InstrumentationProxy.EVENT_NAME,
      this._payload,
      () => rbFSend(this._middleware, "call", env) as Promise<RackResponse>,
    );
  }
}

export class MiddlewareStack implements Iterable<Middleware> {
  private entries: Middleware[] = [];

  constructor(block?: (stack: MiddlewareStack) => void) {
    if (block) block(this);
  }

  get middlewares(): Middleware[] {
    return this.entries;
  }

  set middlewares(value: Middleware[]) {
    this.entries = value;
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

  unshift(klass: MiddlewareFactory, ...args: unknown[]): void {
    const block = rbBlockGivenP(args[args.length - 1])
      ? (args.pop() as MiddlewareBlock)
      : undefined;
    this.middlewares.unshift(this.buildMiddleware(klass, args, block));
  }

  insert(index: MiddlewareFactory | number, klass: MiddlewareFactory, ...args: unknown[]): void {
    const block = rbBlockGivenP(args[args.length - 1])
      ? (args.pop() as MiddlewareBlock)
      : undefined;
    index = this.assertIndex(index, "before");
    this.middlewares.splice(index, 0, this.buildMiddleware(klass, args, block));
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

  delete(target: MiddlewareFactory): Middleware[] | null {
    let rejected = false;
    for (let i = this.entries.length - 1; i >= 0; i--) {
      if (this.entries[i].name === target.name) {
        this.entries.splice(i, 1);
        rejected = true;
      }
    }
    return rejected ? this.entries : null;
  }

  deleteBang(target: MiddlewareFactory): Middleware[] {
    const rejected = this.delete(target);
    if (rejected === null) {
      throw new RuntimeError(`No such middleware to remove: ${rbInspect(target)}`);
    }
    return rejected;
  }

  move(target: MiddlewareFactory | number, source: MiddlewareFactory | number): void {
    const sourceIndex = this.assertIndex(source, "before");
    const sourceMiddleware = deleteAt(this.middlewares, sourceIndex)!;

    const targetIndex = this.assertIndex(target, "before");
    insert(this.middlewares, targetIndex, sourceMiddleware);
  }

  moveBefore(target: MiddlewareFactory | number, source: MiddlewareFactory | number): void {
    this.move(target, source);
  }

  moveAfter(target: MiddlewareFactory | number, source: MiddlewareFactory | number): void {
    const sourceIndex = this.assertIndex(source, "after");
    const sourceMiddleware = deleteAt(this.middlewares, sourceIndex)!;

    const targetIndex = this.assertIndex(target, "after");
    insert(this.middlewares, targetIndex + 1, sourceMiddleware);
  }

  use(klass: MiddlewareFactory, ...args: unknown[]): void {
    const block = rbBlockGivenP(args[args.length - 1])
      ? (args.pop() as MiddlewareBlock)
      : undefined;
    this.middlewares.push(this.buildMiddleware(klass, args, block));
  }

  includes(obj: unknown): boolean {
    return this.middlewares.some((m) => m.equals(obj) === true);
  }

  get(i: number): Middleware | undefined {
    return this.entries[i];
  }

  toArray(): Middleware[] {
    return [...this.entries];
  }

  /** @noRailsEquivalent PERMANENT */
  [Symbol.iterator](): Iterator<Middleware> {
    return this.entries[Symbol.iterator]();
  }

  build(app: RackApp | RackAppObject): RackApp | RackAppObject {
    const instrumenting = Notifications.notifier.listening(InstrumentationProxy.EVENT_NAME);
    const middlewares = Object.freeze(this.middlewares);
    let a: RackApp | RackAppObject = app;
    for (let i = middlewares.length - 1; i >= 0; i--) {
      if (instrumenting) {
        a = middlewares[i].buildInstrumented(a);
      } else {
        a = middlewares[i].build(a);
      }
    }
    return a;
  }

  /** @internal */
  assertIndex(index: number | MiddlewareFactory, where: "before" | "after"): number {
    const i = typeof index === "number" ? index : this.indexOf(index);
    if (i === -1) {
      throw new RuntimeError(`No such middleware to insert ${where}: ${rbInspect(index)}`);
    }
    return i;
  }

  /** @internal */
  buildMiddleware(klass: MiddlewareFactory, args: unknown[], block?: MiddlewareBlock): Middleware {
    return new Middleware(klass, args, block);
  }

  /** @internal */
  indexOf(klass: MiddlewareFactory): number {
    return this.entries.findIndex((m) => m.name === klass.name);
  }
}
