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
import { ConnectionNotDefined, ConnectionTimeoutError } from "../errors.js";

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

  it("threads the connection length through the suffix-truncation branch (256 - 2)", () => {
    const jd = new JoinDependency(stubBaseModel(256));
    const tracker = trackerOf(jd);
    const candidate = "a".repeat(300);
    // First claim keeps the full 256-slice; the repeat aliases through
    // `truncate` (slice to tableAliasLength - 2) with a `_2` suffix.
    expect(tracker.aliasNameFor(candidate)).toBe("a".repeat(256));
    expect(tracker.aliasNameFor(candidate)).toBe(`${"a".repeat(254)}_2`);
  });

  it("falls back to the default cap when the base connection getter throws", () => {
    const noConnModel = {
      tableName: "posts",
      arelTable: new Table("posts"),
      get connection(): never {
        throw new ConnectionNotDefined("No connection pool for posts");
      },
    } as unknown as BaseModelArg;
    const jd = new JoinDependency(noConnModel);
    const tracker = trackerOf(jd);
    // maxIdentifierLength default is 64.
    expect(tracker.aliasNameFor("a".repeat(200))).toBe("a".repeat(64));
  });

  it("propagates a genuine connection error instead of swallowing it", () => {
    const brokenModel = {
      tableName: "posts",
      arelTable: new Table("posts"),
      get connection(): never {
        throw new Error("adapter blew up");
      },
    } as unknown as BaseModelArg;
    expect(() => new JoinDependency(brokenModel)).toThrow("adapter blew up");
  });

  it("propagates a connection error that is not a no-connection error", () => {
    // ConnectionTimeoutError is a ConnectionNotEstablished but not a
    // ConnectionNotDefined, so it is a genuine failure that must not be
    // swallowed into the default alias cap.
    const timingOutModel = {
      tableName: "posts",
      arelTable: new Table("posts"),
      get connection(): never {
        throw new ConnectionTimeoutError("could not obtain a connection");
      },
    } as unknown as BaseModelArg;
    expect(() => new JoinDependency(timingOutModel)).toThrow(ConnectionTimeoutError);
  });
});
