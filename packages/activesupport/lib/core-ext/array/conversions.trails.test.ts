import { describe, it, expect } from "vitest";

import { toXml } from "../../array-utils.js";
import { HashWithIndifferentAccess } from "../../hash-with-indifferent-access.js";

const root = (array: unknown[]) =>
  /^<([\w-]+)/.exec(toXml(array, { skipInstruct: true, indent: 0 }))![1];

describe("Array#to_xml root", () => {
  class Animal {}
  class Dog extends Animal {}

  it("pluralizes first.class only when every element is_a? it", () => {
    expect(root([new Animal(), new Dog()])).toBe("animals");
    expect(root([new Dog(), new Animal()])).toBe("objects");
    expect(root([new (class Twin {})(), new (class Twin {})()])).toBe("objects");
    expect(root([1, 1.5])).toBe("objects");
  });

  it("treats an HWIA first element as not Hash", () => {
    const hwia = new HashWithIndifferentAccess({ a: 1 });
    expect(root([hwia, new HashWithIndifferentAccess({ b: 2 })])).not.toBe("objects");
  });
});
