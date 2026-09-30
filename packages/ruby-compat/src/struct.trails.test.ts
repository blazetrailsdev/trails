import { describe, it, expect } from "vitest";
import { include } from "./include.js";
import { rbEql, rbEqual } from "./rb-equal.js";
import { rbHash } from "./rb-hash.js";
import { Struct, type StructInstance } from "./struct.js";

class Base {}

class Customer extends Base {
  constructor(
    public name: unknown,
    public zip: unknown,
  ) {
    super();
  }
}
include(Customer, Struct.new("name", "zip"));

class Other extends Base {
  constructor(
    public name: unknown,
    public zip: unknown,
  ) {
    super();
  }
}
include(Other, Struct.new("name", "zip"));

describe("Struct", () => {
  it("answers its members", () => {
    expect((new Customer("Joe", 1) as Customer & StructInstance).members()).toEqual([
      "name",
      "zip",
    ]);
  });

  it("is == and eql? to a struct of the same class and members", () => {
    expect(rbEqual(new Customer("Joe", 1), new Customer("Joe", 1))).toBe(true);
    expect(rbEql(new Customer("Joe", 1), new Customer("Joe", 1))).toBe(true);
    expect(rbEqual(new Customer("Joe", 1), new Customer("Joe", 2))).toBe(false);
    expect(rbEqual(new Customer("Joe", 1), new Other("Joe", 1))).toBe(false);
    expect(rbEqual(new Customer("Joe", 1), { name: "Joe", zip: 1 })).toBe(false);
  });

  it("compares members with == for == and with eql? for eql?", () => {
    const zip = (code: number) => ({
      code,
      equals: (other: { code: number }) => other.code === code,
    });
    expect(rbEqual(new Customer("Joe", zip(1)), new Customer("Joe", zip(1)))).toBe(true);
    expect(rbEql(new Customer("Joe", zip(1)), new Customer("Joe", zip(1)))).toBe(false);
  });

  it("hashes by class and members", () => {
    expect(rbHash(new Customer("Joe", 1))).toBe(rbHash(new Customer("Joe", 1)));
    expect(rbHash(new Customer("Joe", 1))).not.toBe(rbHash(new Customer("Joe", 2)));
    expect(rbHash(new Customer("Joe", 1))).not.toBe(rbHash(new Other("Joe", 1)));
  });
});
