import { NoMethodError, rbFSend, rbObjRespondTo } from "@blazetrails/ruby-compat";
import { Rack } from "./namespaces.js";

export class BodyProxy {
  protected body: any;
  private block: () => void;
  private _closed = false;

  constructor(body: any, block: () => void) {
    this.body = body;
    this.block = block;
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

  respondToMissing(methodName: string, _includeAll = false): boolean {
    switch (methodName) {
      case "toStr":
        return false;
      default:
        return rbObjRespondTo(this.body, methodName);
    }
  }

  methodMissing(methodName: string, ...args: unknown[]): any {
    switch (methodName) {
      case "toStr":
        throw new NoMethodError(
          `undefined method 'to_str' for an instance of Rack::BodyProxy`,
          "to_str",
          args,
          false,
          { receiver: this },
        );
      case "toAry":
        try {
          return rbFSend(this.body, methodName, ...args);
        } finally {
          this.close();
        }
      default:
        return rbFSend(this.body, methodName, ...args);
    }
  }
}

Rack.BodyProxy = BodyProxy;

Object.setPrototypeOf(
  BodyProxy.prototype,
  new Proxy(Object.create(Object.getPrototypeOf(BodyProxy.prototype) as object) as object, {
    get: (target, prop, receiver: BodyProxy) => {
      if (
        Reflect.has(target, prop) ||
        typeof prop !== "string" ||
        receiver === BodyProxy.prototype ||
        !receiver.respondToMissing(prop)
      ) {
        return Reflect.get(target, prop, receiver);
      }
      return (...args: unknown[]) => receiver.methodMissing(prop, ...args);
    },
  }),
);
