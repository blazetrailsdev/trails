import { it, expect } from "vitest";
import "./mysql2-adapter.js";
import { StringType, ImmutableStringType as ImmutableString } from "@blazetrails/activemodel";
import { lookup } from "../type.js";
import { UnsignedInteger } from "../type/unsigned-integer.js";

it("mysql2 :string coerces booleans to 1/0 and threads limit", () => {
  const type = lookup("string", { adapter: "mysql2", limit: 255 }) as StringType;
  expect(type).toBeInstanceOf(StringType);
  expect(type.limit).toBe(255);
  expect(type.true).toBe("1");
  expect(type.false).toBe("0");
});

it("mysql2 :immutable_string coerces booleans to 1/0", () => {
  const type = lookup("immutable_string", { adapter: "mysql2" }) as ImmutableString;
  expect(type).toBeInstanceOf(ImmutableString);
  expect(type.true).toBe("1");
  expect(type.false).toBe("0");
});

it("mysql2 :unsigned_integer resolves to UnsignedInteger", () => {
  const type = lookup("unsigned_integer", { adapter: "mysql2" });
  expect(type).toBeInstanceOf(UnsignedInteger);
});
