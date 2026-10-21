import { rbObjRespondTo } from "@blazetrails/ruby-compat";

export class BodyProxy {
  private body: any;
  private block: () => void;
  private _closed = false;

  constructor(body: any, block: () => void) {
    this.body = body;
    this.block = block;
    return new Proxy(this, {
      has: (target, prop) =>
        Reflect.has(target, prop) || (typeof prop === "string" && target.respondToMissing(prop)),
      get: (target, prop, receiver) => {
        if (
          Reflect.has(target, prop) ||
          typeof prop !== "string" ||
          !target.respondToMissing(prop)
        ) {
          return Reflect.get(target, prop, receiver);
        }
        return (...args: unknown[]) => target.methodMissing(prop, ...args);
      },
    });
  }

  close(): void {
    if (this._closed) return;
    this._closed = true;
    try {
      if (rbObjRespondTo(this.body, "close")) {
        this.body.close();
      }
    } finally {
      this.block();
    }
  }

  get closed(): boolean {
    return this._closed;
  }

  /** @noRailsEquivalent PERMANENT */
  async *[Symbol.asyncIterator](): AsyncIterator<any> {
    if (this.body && typeof this.body[Symbol.asyncIterator] === "function") {
      for await (const item of this.body) yield item;
    } else if (Array.isArray(this.body)) {
      for (const item of this.body) yield item;
    } else if (this.body && typeof this.body[Symbol.iterator] === "function") {
      for (const item of this.body) yield item;
    }
  }

  /** @noRailsEquivalent PERMANENT */
  *[Symbol.iterator](): Iterator<any> {
    const items: any[] = [];
    this.each((item) => items.push(item));
    yield* items;
  }

  /** @noRailsEquivalent PERMANENT */
  each(callback: (item: any) => void): void {
    if (Array.isArray(this.body)) {
      for (const item of this.body) callback(item);
    } else if (this.body && typeof this.body.each === "function") {
      this.body.each(callback);
    } else if (this.body && typeof this.body[Symbol.iterator] === "function") {
      for (const item of this.body) callback(item);
    }
  }

  /** @noRailsEquivalent PERMANENT */
  toArray(): any[] {
    try {
      if (Array.isArray(this.body)) return this.body;
      if (typeof this.body.toArray === "function") return this.body.toArray();
      const result: any[] = [];
      this.each((item) => result.push(item));
      return result;
    } finally {
      this.close();
    }
  }

  respondToMissing(methodName: string): boolean {
    if (methodName === "toStr" || methodName === "to_str") return false;
    if (methodName === "toArray" || methodName === "to_ary") {
      return (
        Array.isArray(this.body) ||
        typeof this.body?.toArray === "function" ||
        typeof this.body?.to_ary === "function"
      );
    }
    if (methodName === "toPath" || methodName === "to_path") {
      return typeof this.body?.toPath === "function" || typeof this.body?.to_path === "function";
    }
    return typeof this.body?.[methodName] === "function";
  }

  /** @inventedArm if — PERMANENT */
  methodMissing(methodName: string, ...args: unknown[]): any {
    if (methodName === "toStr" || methodName === "to_str") {
      throw new Error("NoMethodError: undefined method 'to_str'");
    }
    if (methodName === "toArray" || methodName === "to_ary") {
      try {
        return Array.isArray(this.body) ? this.body : this.body.toArray(...args);
      } finally {
        this.close();
      }
    }
    if (typeof this.body?.[methodName] === "function") {
      return this.body[methodName](...args);
    }
    throw new Error(`NoMethodError: undefined method '${methodName}'`);
  }
}
