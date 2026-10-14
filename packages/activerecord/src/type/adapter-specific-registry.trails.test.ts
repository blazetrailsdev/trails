import { describe, it, expect } from "vitest";
import { ArgumentError, StringType } from "@blazetrails/activemodel";
import { assertRaises } from "@blazetrails/activesupport";
import { rbObjDup } from "@blazetrails/ruby-compat";
import { AdapterSpecificRegistry } from "./adapter-specific-registry.js";

describe("AdapterSpecificRegistry#initializeCopy", () => {
  it("a dup'd registry does not share its registrations", async () => {
    const registry = new AdapterSpecificRegistry();
    registry.register("foo", StringType);

    const dup = rbObjDup(registry);
    dup.register("bar", StringType);

    expect(dup.lookup("foo")).toBeInstanceOf(StringType);
    expect(dup.lookup("bar")).toBeInstanceOf(StringType);
    await assertRaises([ArgumentError], {}, () => registry.lookup("bar"));
  });
});
