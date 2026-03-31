import { describe, it, expect, beforeEach } from "vitest";
import { objectWith } from "./with.js";

class Record {
  publicAttr = "public";
  anotherPublicAttr = "another_public";

  get mixedAttr(): string {
    return this._mixedAttr;
  }

  private _mixedAttr = "mixed";
}

describe("WithTest", () => {
  let object: Record;

  beforeEach(() => {
    object = new Record();
  });

  it("sets and restore attributes around a block", () => {
    expect(object.publicAttr).toBe("public");
    expect(object.anotherPublicAttr).toBe("another_public");

    objectWith(object as any, { publicAttr: "changed", anotherPublicAttr: "changed_too" }, () => {
      expect(object.publicAttr).toBe("changed");
      expect(object.anotherPublicAttr).toBe("changed_too");
    });

    expect(object.publicAttr).toBe("public");
    expect(object.anotherPublicAttr).toBe("another_public");
  });

  it("restore attribute if the block raised", () => {
    expect(object.publicAttr).toBe("public");
    expect(object.anotherPublicAttr).toBe("another_public");

    expect(() => {
      objectWith(object as any, { publicAttr: "changed", anotherPublicAttr: "changed_too" }, () => {
        expect(object.publicAttr).toBe("changed");
        expect(object.anotherPublicAttr).toBe("changed_too");
        throw new Error("Oops");
      });
    }).toThrow("Oops");

    expect(object.publicAttr).toBe("public");
    expect(object.anotherPublicAttr).toBe("another_public");
  });

  it("restore attributes if one of the setter raised", () => {
    expect(object.publicAttr).toBe("public");
    expect(object.mixedAttr).toBe("mixed");

    expect(() => {
      objectWith(object as any, { publicAttr: "changed", mixedAttr: "changed_too" }, () => {
        // block should not execute when setter raises
      });
    }).toThrow();

    expect(object.publicAttr).toBe("public");
    expect(object.mixedAttr).toBe("mixed");
  });

  it("only works with public attributes", () => {
    // In TS, all properties on a plain object are accessible,
    // but we can test that read-only properties throw
    const readOnly = Object.freeze({ x: 1 });
    expect(() => {
      objectWith(readOnly as any, { x: 2 }, () => {});
    }).toThrow();
  });

  it("yields the instance to the block", () => {
    const result = objectWith(object as any, { publicAttr: "1" }, (o) => o.publicAttr);
    expect(result).toBe("1");
  });

  it("basic immediates don't respond to #with", () => {
    // In TS, primitives don't have a `with` method
    expect(typeof (null as any)?.with).toBe("undefined");
    expect(typeof (true as any).with).toBe("undefined");
    expect(typeof (false as any).with).toBe("undefined");
    expect(typeof (1 as any).with).toBe("undefined");
    expect(typeof (1.0 as any).with).toBe("undefined");
  });
});
