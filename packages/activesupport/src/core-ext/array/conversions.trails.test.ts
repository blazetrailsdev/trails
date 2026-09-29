import { describe, it, expect } from "vitest";

import { toXml } from "../../array-utils.js";
import { HashWithIndifferentAccess } from "../../hash-with-indifferent-access.js";

describe("Array#to_xml root", () => {
  class Animal {}
  class Dog extends Animal {}

  it("pluralizes first.class when later elements are subclasses of it", () => {
    const xml = toXml([new Animal(), new Dog()], { skipInstruct: true, indent: 0 });
    expect(xml.startsWith('<animals type="array">')).toBe(true);
  });

  it("answers objects when a later element is a superclass of first.class", () => {
    const xml = toXml([new Dog(), new Animal()], { skipInstruct: true, indent: 0 });
    expect(xml.startsWith('<objects type="array">')).toBe(true);
  });

  it("does not treat distinct classes sharing a name as the same class", () => {
    const A = class Twin {};
    const B = class Twin {};
    const xml = toXml([new A(), new B()], { skipInstruct: true, indent: 0 });
    expect(xml.startsWith('<objects type="array">')).toBe(true);
  });

  it("treats an HWIA first element as not Hash", () => {
    const xml = toXml(
      [new HashWithIndifferentAccess({ a: 1 }), new HashWithIndifferentAccess({ b: 2 })],
      { skipInstruct: true, indent: 0 },
    );
    expect(xml.startsWith('<objects type="array">')).toBe(false);
  });

  it("keeps Integer and Float apart for JS numbers", () => {
    const xml = toXml([1, 1.5], { skipInstruct: true, indent: 0 });
    expect(xml.startsWith('<objects type="array">')).toBe(true);
  });
});
