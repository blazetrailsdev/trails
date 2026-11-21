import { ArgumentError, TypeError } from "@blazetrails/ruby-compat";
import { describe, expect, it } from "vitest";
import { PG } from "../lib/index.js";

describe("PG::TypeMapByOid", () => {
  const tmWritable = new PG.TypeMapByOid();

  it("should check format when adding coders", () => {
    const textdecInt = new PG.TextDecoder.Integer(undefined, { name: "INT4", oid: 23 });
    textdecInt.format = 2;
    expect(() => tmWritable.addCoder(textdecInt)).toThrow(ArgumentError);
    textdecInt.format = -1;
    expect(() => tmWritable.addCoder(textdecInt)).toThrow(ArgumentError);
  });

  it("should check coder type when adding coders", () => {
    expect(() => tmWritable.addCoder("dummy" as never)).toThrow(TypeError);
  });
});
