import { describe, it, expect } from "vitest";
import { ArgumentError } from "@blazetrails/activesupport";
import { Table } from "@blazetrails/arel";
import { AliasTracker } from "./alias-tracker.js";

describe("AliasTracker.create", () => {
  it("uses the connection's tableAliasLength method (MySQL would give 256)", () => {
    const connection = { tableAliasLength: () => 256 };
    const pool = { withConnectionSync: (block: (c: unknown) => unknown) => block(connection) };
    const tracker = AliasTracker.create(pool, "posts", []);
    expect(
      String(tracker.aliasedTableFor(new Table("posts"), null, () => "a".repeat(200)).name),
    ).toBe("a".repeat(200));
  });
});

describe("AliasTracker.initialCountFor", () => {
  it("raises ArgumentError when a join is not an Arel join node", () => {
    expect(() =>
      AliasTracker.initialCountFor(undefined as never, "posts", ["JOIN posts ON 1=1"]),
    ).toThrow(new ArgumentError("joins list should be initialized by list of Arel::Nodes::Join"));
  });
});
