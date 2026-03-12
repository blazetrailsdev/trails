/**
 * ActionDispatch::MiddlewareStack
 *
 * An ordered list of middleware with insertion/removal operations.
 */

import type { RackEnv, RackResponse } from "@rails-ts/rack";

type RackApp = (env: RackEnv) => Promise<RackResponse>;
type MiddlewareFactory = new (
  app: RackApp,
  ...args: any[]
) => { call(env: RackEnv): Promise<RackResponse> };

export interface MiddlewareEntry {
  klass: MiddlewareFactory;
  args: unknown[];
  block?: (app: RackApp) => RackApp;
}

export class MiddlewareStack implements Iterable<MiddlewareEntry> {
  private entries: MiddlewareEntry[] = [];

  get length(): number {
    return this.entries.length;
  }

  get size(): number {
    return this.entries.length;
  }

  use(klass: MiddlewareFactory, ...args: unknown[]): void {
    this.entries.push({ klass, args });
  }

  useWithBlock(
    klass: MiddlewareFactory,
    block: (app: RackApp) => RackApp,
    ...args: unknown[]
  ): void {
    this.entries.push({ klass, args, block });
  }

  unshift(klass: MiddlewareFactory, ...args: unknown[]): void {
    this.entries.unshift({ klass, args });
  }

  insert(index: number, klass: MiddlewareFactory, ...args: unknown[]): void {
    if (index < 0 || index > this.entries.length) {
      throw new Error(`Invalid index ${index} for middleware stack of size ${this.entries.length}`);
    }
    this.entries.splice(index, 0, { klass, args });
  }

  insertBefore(target: MiddlewareFactory, klass: MiddlewareFactory, ...args: unknown[]): void {
    const idx = this.findIndex(target);
    if (idx === -1) throw new Error("No such middleware to insert before");
    this.entries.splice(idx, 0, { klass, args });
  }

  insertAfter(
    target: MiddlewareFactory | number,
    klass: MiddlewareFactory,
    ...args: unknown[]
  ): void {
    if (typeof target === "number") {
      this.entries.splice(target + 1, 0, { klass, args });
    } else {
      const idx = this.findIndex(target);
      if (idx === -1) throw new Error("No such middleware to insert after");
      this.entries.splice(idx + 1, 0, { klass, args });
    }
  }

  swap(target: MiddlewareFactory, klass: MiddlewareFactory, ...args: unknown[]): void {
    const idx = this.findIndex(target);
    if (idx === -1) throw new Error("No such middleware to swap");
    this.entries[idx] = { klass, args };
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

  move(target: MiddlewareFactory, index: number): void {
    const idx = this.findIndex(target);
    if (idx === -1) throw new Error("No such middleware to move");
    const [entry] = this.entries.splice(idx, 1);
    this.entries.splice(index, 0, entry);
  }

  moveBefore(target: MiddlewareFactory, beforeTarget: MiddlewareFactory): void {
    const srcIdx = this.findIndex(target);
    if (srcIdx === -1) throw new Error("No such middleware to move");
    const [entry] = this.entries.splice(srcIdx, 1);
    const destIdx = this.findIndex(beforeTarget);
    if (destIdx === -1) throw new Error("No such middleware to move before");
    this.entries.splice(destIdx, 0, entry);
  }

  moveAfter(target: MiddlewareFactory, afterTarget: MiddlewareFactory | number): void {
    const srcIdx = this.findIndex(target);
    if (srcIdx === -1) throw new Error("No such middleware to move");
    const [entry] = this.entries.splice(srcIdx, 1);
    if (typeof afterTarget === "number") {
      this.entries.splice(afterTarget, 0, entry);
    } else {
      const destIdx = this.findIndex(afterTarget);
      if (destIdx === -1) throw new Error("No such middleware to move after");
      this.entries.splice(destIdx + 1, 0, entry);
    }
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

  [Symbol.iterator](): Iterator<MiddlewareEntry> {
    return this.entries[Symbol.iterator]();
  }

  build(app: RackApp): RackApp {
    let current = app;
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
}
