import { isBlank } from "../object/blank.js";

export class Array {
  static from<T>(self: T[], position: number): T[] {
    const start = position < 0 ? self.length + position : position;
    if (start < 0 || start > self.length) return [];
    return self.slice(start);
  }

  static to<T>(self: T[], position: number): T[] {
    if (position >= 0) {
      return self.slice(0, position + 1);
    } else {
      const end = self.length + position;
      return end < 0 ? [] : self.slice(0, end + 1);
    }
  }

  static including<T>(self: T[], ...elements: (T | T[])[]): T[] {
    return self.concat(elements.flat(1) as T[]);
  }

  static excluding<T>(self: T[], ...elements: (T | T[])[]): T[] {
    const removed = elements.flat(1) as T[];
    return self.filter((element) => !removed.some((other) => eql(element, other)));
  }

  static without<T>(self: T[], ...elements: (T | T[])[]): T[] {
    return Array.excluding(self, ...elements);
  }

  static second<T>(self: T[]): T | undefined {
    return self[1];
  }

  static third<T>(self: T[]): T | undefined {
    return self[2];
  }

  static fourth<T>(self: T[]): T | undefined {
    return self[3];
  }

  static fifth<T>(self: T[]): T | undefined {
    return self[4];
  }

  static fortyTwo<T>(self: T[]): T | undefined {
    return self[41];
  }

  static thirdToLast<T>(self: T[]): T | undefined {
    return self.at(-3);
  }

  static secondToLast<T>(self: T[]): T | undefined {
    return self.at(-2);
  }

  static compactBlankBang<T>(self: T[]): T[] {
    for (let i = self.length - 1; i >= 0; i--) {
      if (isBlank(self[i])) self.splice(i, 1);
    }
    return self;
  }
}

function eql(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (!globalThis.Array.isArray(a) || !globalThis.Array.isArray(b)) return false;
  return a.length === b.length && a.every((element, i) => eql(element, b[i]));
}
