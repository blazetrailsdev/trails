import { describe, it, expect } from "vitest";
import { Duration } from "@blazetrails/activesupport";
import { ImmutableStringType } from "./immutable-string.js";

describe("ImmutableStringType (trails)", () => {
  it("serialize sends a Numeric and a Duration to to_s, and passes other objects through", () => {
    const type = new ImmutableStringType();
    const object = {},
      array = [true];
    expect(type.serialize(123)).toBe("123");
    expect(type.serialize(Duration.seconds(5))).toBe(String(Duration.seconds(5)));
    expect(type.serialize(object)).toBe(object);
    expect(type.serialize(array)).toBe(array);
  });

  it("serialize strips a Symbol's leading colon but leaves a String alone", () => {
    // immutable_string.rb:53 sends ::Symbol through `to_s`, and `:bob.to_s` is
    // "bob". A trails Symbol carries its colon, so the colon is what separates
    // that arm from the `else` (identity) one a String takes.
    const type = new ImmutableStringType();
    expect(type.serialize(":bob")).toBe("bob");
    expect(type.serialize("bob")).toBe("bob");
  });

  it("serialize maps booleans to the configured true/false strings", () => {
    const type = new ImmutableStringType({ true: "aye", false: "nay" });
    expect(type.serialize(true)).toBe("aye");
    expect(type.serialize(false)).toBe("nay");
  });
});
