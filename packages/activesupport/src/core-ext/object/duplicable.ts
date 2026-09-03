export function isDuplicable(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "function") return false;
  if (typeof value === "symbol") return false;
  if (value instanceof WeakMap || value instanceof WeakSet) return false;
  if (typeof WeakRef !== "undefined" && value instanceof WeakRef) return false;
  return true;
}

export class Method {
  static isDuplicable(): false {
    return false;
  }
}

export class UnboundMethod {
  static isDuplicable(): false {
    return false;
  }
}

export namespace Singleton {
  export function isDuplicable(): false {
    return false;
  }
}
