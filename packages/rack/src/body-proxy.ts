export class BodyProxy {
  private body: any;
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
      if (this.body && typeof this.body.close === "function") {
        this.body.close();
      }
    } finally {
      this.block();
    }
  }

  get closed(): boolean {
    return this._closed;
  }

  each(callback: (item: any) => void): void {
    if (Array.isArray(this.body)) {
      for (const item of this.body) callback(item);
    } else if (this.body && typeof this.body.each === "function") {
      this.body.each(callback);
    } else if (this.body && typeof this.body[Symbol.iterator] === "function") {
      for (const item of this.body) callback(item);
    }
  }

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

  respondTo(method: string): boolean {
    if (method === "toStr" || method === "to_str") return false;
    if (method === "toArray" || method === "to_ary") {
      return Array.isArray(this.body) || typeof this.body?.toArray === "function" || typeof this.body?.to_ary === "function";
    }
    if (method === "toPath" || method === "to_path") {
      return typeof this.body?.toPath === "function" || typeof this.body?.to_path === "function";
    }
    return typeof this.body?.[method] === "function";
  }

  /** Delegate method calls to the wrapped body */
  delegate(method: string, ...args: any[]): any {
    if (method === "toStr" || method === "to_str") {
      throw new Error("NoMethodError: undefined method 'to_str'");
    }
    if (method === "toArray" || method === "to_ary") {
      return this.toArray();
    }
    if (typeof this.body?.[method] === "function") {
      return this.body[method](...args);
    }
    throw new Error(`NoMethodError: undefined method '${method}'`);
  }
}
