import { describe, expect, it } from "vitest";
import { HashWithIndifferentAccess } from "@blazetrails/activesupport";
import { Hash } from "@blazetrails/ruby-compat";
import "../index.js";
import { deserialize, serialize } from "../arguments.js";

describe("ActiveJob::Arguments with a Hash", () => {
  it.each([
    ["a plain object", { a: 1 }],
    ["a ruby-compat Hash", new Hash<string, number>().set("a", 1)],
    ["a HashWithIndifferentAccess", new HashWithIndifferentAccess({ a: 1 })],
  ])("maps %s over its [key, value] pairs", async (_name, hash) => {
    expect(serialize(hash)).toEqual([["a", 1]]);
    expect(await deserialize(serialize(hash))).toEqual([["a", 1]]);
  });
});
