import { describe, expect, it } from "vitest";
import { Duration, HashWithIndifferentAccess, days, years } from "@blazetrails/activesupport";
import { Hash } from "@blazetrails/ruby-compat";
import "../index.js";
import { deserialize, serialize } from "../arguments.js";

async function performRoundTrip(args: unknown[]): Promise<unknown[]> {
  return deserialize(JSON.parse(JSON.stringify(serialize(args))));
}

describe("ArgumentSerializationTest", () => {
  it("serializes ActiveSupport::Duration - 1 day verbatim", async () => {
    const [duration] = (await performRoundTrip([days(1)])) as Duration[];
    expect(duration).toBeInstanceOf(Duration);
    expect(duration.value).toBe(days(1).value);
    expect(duration.parts.days).toBe(1);
  });

  it("should maintain a functional duration", async () => {
    const [duration] = (await performRoundTrip([years(1)])) as Duration[];
    expect(typeof duration.parts).toBe("object");
    expect(duration.plus(years(1)).equals(years(2))).toBe(true);
  });
});

describe("ActiveJob::Arguments with a Hash", () => {
  it("maps a plain-object Hash over its [key, value] pairs", async () => {
    const serialized = serialize({ a: 1, b: "x" });
    expect(serialized).toEqual([
      ["a", 1],
      ["b", "x"],
    ]);
    expect(await deserialize(serialized)).toEqual(serialized);
  });

  it("maps a ruby-compat Hash over its [key, value] pairs", async () => {
    const serialized = serialize(new Hash<string, number>().set("a", 1));
    expect(serialized).toEqual([["a", 1]]);
    expect(await deserialize(serialized)).toEqual([["a", 1]]);
  });

  it("maps a HashWithIndifferentAccess over its [key, value] pairs", async () => {
    const serialized = serialize(new HashWithIndifferentAccess({ a: 1 }));
    expect(serialized).toEqual([["a", 1]]);
    expect(await deserialize(serialized)).toEqual([["a", 1]]);
  });
});
