import { describe, it, expect } from "vitest";
import { FrozenError } from "./frozen-error.js";
import { rbEql, rbEqual } from "./rb-equal.js";
import { rbHash } from "./rb-hash.js";
import { Struct } from "./struct.js";
import { TypeError } from "./type-error.js";

class Customer extends Struct.new("name", "zip") {
  declare name: unknown;
  declare zip: unknown;
}

class Other extends Struct.new("name", "zip") {}

describe("Struct", () => {
  it("answers its members", () => {
    expect(new Customer("Joe", 1).members()).toEqual(["name", "zip"]);
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

  it("answers true for a pair already being compared", () => {
    const joe = new Customer("Joe", null);
    const joe2 = new Customer("Joe", null);
    joe.zip = joe;
    joe2.zip = joe2;
    expect(rbEqual(joe, joe2)).toBe(true);
    expect(rbEql(joe, joe2)).toBe(true);
  });

  it("hashes by class and members", () => {
    expect(rbHash(new Customer("Joe", 1))).toBe(rbHash(new Customer("Joe", 1)));
    expect(rbHash(new Customer("Joe", 1))).not.toBe(rbHash(new Customer("Joe", 2)));
    expect(rbHash(new Customer("Joe", 1))).not.toBe(rbHash(new Other("Joe", 1)));
  });

  it("copies the members of the struct it is initialized from", () => {
    const copy = new Customer();
    expect(copy.initializeCopy(new Customer("Joe", 1))).toBe(copy);
    expect([copy.name, copy.zip]).toEqual(["Joe", 1]);
    expect(copy.initializeCopy(copy)).toBe(copy);
  });

  it("refuses to copy into a frozen struct or from another class", () => {
    const joe = new Customer("Joe", 1);
    expect(() => Object.freeze(new Customer()).initializeCopy(joe)).toThrow(FrozenError);
    const typeError = new TypeError("initialize_copy should take same class object");
    expect(() => new Other().initializeCopy(joe)).toThrow(typeError);
  });

  it("answers its members' values as a hash, through a block when given", () => {
    const joe = new Customer("Joe", 1);
    expect(joe.toH()).toEqual({ name: "Joe", zip: 1 });
    expect(joe.toH((k, v) => [k.toUpperCase(), String(v)])).toEqual({ NAME: "Joe", ZIP: "1" });
  });

  it("keeps the raw slot beneath a subclass reader, which reaches it as super", () => {
    class Lazy extends Struct.new("name", "zip") {
      get name(): unknown {
        return super.name ?? (this.name = "default");
      }
      set name(name: unknown) {
        super.name = name;
      }
    }
    const lazy = new Lazy(null, 1);
    expect(lazy.toH()).toEqual({ name: null, zip: 1 });
    expect(rbEqual(lazy, new Lazy(null, 1))).toBe(true);
    expect(lazy.name).toBe("default");
    expect(lazy.toH()).toEqual({ name: "default", zip: 1 });
  });

  it("does not share its slot with a copy, and refuses a write when frozen", () => {
    const joe = new Customer("Joe", 1);
    const copy = new Customer(null, null).initializeCopy(joe);
    copy.zip = 2;
    expect(joe.zip).toBe(1);
    Object.freeze(joe);
    expect(() => {
      joe.zip = 3;
    }).toThrow(FrozenError);
  });
});
