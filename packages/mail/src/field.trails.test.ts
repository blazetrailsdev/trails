import { describe, expect, it } from "vitest";
import { Field, IndifferentHash } from "./index.js";

describe("Mail::Field", () => {
  it("inspects Ruby's ivars, without @field before the parse", () => {
    const field = new Field("X-A", "1");
    expect(field.inspect()).toMatch(
      /^#<Mail::Field 0x[0-9a-f]+ @name="X-A" @unparsed_value="1" @charset="utf-8">$/,
    );
  });

  it("does not parse on a then probe", () => {
    const field = new Field("To", "a@b.c");
    void (field as unknown as { then: unknown }).then;
    expect(field.inspect()).not.toContain("@field=");
  });
});

describe("Mail::IndifferentHash", () => {
  it("takes nil as the default, nests plain objects and answers a plain Hash from to_hash", () => {
    expect(new IndifferentHash(null).size).toEqual(0);
    expect(new IndifferentHash({ a: { b: 1 } }).get("a")).toBeInstanceOf(IndifferentHash);
    const hash = new IndifferentHash({ a: 1 }).toHash();
    expect(hash).not.toBeInstanceOf(IndifferentHash);
    expect(hash.get("a")).toEqual(1);
  });
});
