/**
 * JoinDependency seeds its AliasTracker with the base model's connection
 * `table_alias_length`, so a MySQL join chain caps aliases at 256 (not the
 * hardcoded 64 default). Rails builds the tracker inside `pool.with_connection`
 * (alias_tracker.rb:24), so the cap is always the connection's value.
 *
 * trails-specific: exercises the sync connection-length threading with a stub
 * connection, which has no Rails analog.
 */
import { describe, it, expect } from "vitest";
import { Table } from "@blazetrails/arel";
import { JoinDependency } from "./join-dependency.js";
import { AliasTracker } from "./alias-tracker.js";

type BaseModelArg = ConstructorParameters<typeof JoinDependency>[0];

function stubBaseModel(tableAliasLength: number): BaseModelArg {
  return {
    tableName: "posts",
    arelTable: new Table("posts"),
    connection: { tableAliasLength: () => tableAliasLength },
  } as unknown as BaseModelArg;
}

function trackerOf(jd: JoinDependency): AliasTracker {
  return (jd as unknown as { _aliasTracker: AliasTracker })._aliasTracker;
}

describe("JoinDependency AliasTracker seeding", () => {
  it("caps aliases at the base connection's tableAliasLength (256 on MySQL)", () => {
    const jd = new JoinDependency(stubBaseModel(256));
    const tracker = trackerOf(jd);
    tracker.aliasNameFor("posts"); // claim once so a repeat aliases + truncates
    expect(tracker.aliasNameFor("a".repeat(300))).toBe("a".repeat(256));
  });

  it("caps aliases at the base connection's tableAliasLength (63 on PostgreSQL)", () => {
    const jd = new JoinDependency(stubBaseModel(63));
    const tracker = trackerOf(jd);
    tracker.aliasNameFor("posts");
    expect(tracker.aliasNameFor("a".repeat(200))).toBe("a".repeat(63));
  });
});
