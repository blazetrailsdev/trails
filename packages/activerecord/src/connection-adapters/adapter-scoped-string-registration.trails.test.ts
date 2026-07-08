/**
 * trails-only: importing the mysql2 adapter registers the adapter-scoped
 * `:string`/`:immutable_string`/`:unsigned_integer` cast types via
 * `Type.register(name, adapter: :mysql2)` (mysql2_adapter.rb:190-198). These
 * assert the registrations resolve through `Type.lookup(:string, adapter:
 * :mysql2)` — the path `Mysql2Adapter.initializeTypeMap` uses for
 * char/varchar/enum/set — without a live MySQL connection. Rails covers the
 * end-to-end map in mysql_type_lookup_test (adapter-gated in trails).
 */
import { it, expect } from "vitest";
// Side-effect import: loading the concrete adapter runs its module-level
// `Type.register(..., adapter: "mysql2")` calls.
import "./mysql2-adapter.js";
import { StringType, ImmutableStringType as ImmutableString } from "@blazetrails/activemodel";
import { lookup } from "../type.js";
import { UnsignedInteger } from "../type/unsigned-integer.js";

it("mysql2 :string coerces booleans to 1/0 and threads limit", () => {
  const type = lookup("string", { adapter: "mysql2", limit: 255 }) as StringType;
  expect(type).toBeInstanceOf(StringType);
  expect(type.limit).toBe(255);
  expect(type.trueString).toBe("1");
  expect(type.falseString).toBe("0");
});

it("mysql2 :immutable_string coerces booleans to 1/0", () => {
  const type = lookup("immutable_string", { adapter: "mysql2" }) as ImmutableString;
  expect(type).toBeInstanceOf(ImmutableString);
  expect(type.trueString).toBe("1");
  expect(type.falseString).toBe("0");
});

it("mysql2 :unsigned_integer resolves to UnsignedInteger", () => {
  const type = lookup("unsigned_integer", { adapter: "mysql2" });
  expect(type).toBeInstanceOf(UnsignedInteger);
});
