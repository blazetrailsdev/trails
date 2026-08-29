import { describe, it, expect } from "vitest";
import { Base } from "./index.js";
import { fixtures } from "./test-fixtures.js";

describe("_returningColumnsForInsert memoization", () => {
  fixtures([]);

  class Topic extends Base {}

  const schemaHost = Topic as unknown as {
    _returningColumnsForInsert(connection: {
      returnValueAfterInsert(column: { name: string }): Promise<boolean>;
    }): Promise<string[]>;
    resetColumnInformation(): void;
  };

  it("does not let a subclass reuse the base's memo", async () => {
    class Parent extends Base {
      static tableName = "topics";
    }
    class Child extends Parent {}
    const sentinel = ["LEAKED_FROM_BASE"];
    (
      Parent as unknown as { _returningColumnsForInsertCache?: string[] }
    )._returningColumnsForInsertCache = sentinel;

    const connection = {
      returnValueAfterInsert: async (column: { name: string }) => column.name === "id",
    };
    const child = Child as unknown as typeof schemaHost;

    expect(await child._returningColumnsForInsert(connection)).not.toEqual(sentinel);
    expect(
      (Parent as unknown as { _returningColumnsForInsertCache?: string[] })
        ._returningColumnsForInsertCache,
    ).toBe(sentinel);
  });

  it("computes the auto-populated filter only once per class", async () => {
    await Topic.loadSchema();
    let calls = 0;
    const connection = {
      async returnValueAfterInsert(column: { name: string }) {
        calls += 1;
        return column.name === "id";
      },
    };

    expect(await schemaHost._returningColumnsForInsert(connection)).toEqual(["id"]);
    const first = calls;
    expect(first).toBeGreaterThan(0);

    expect(await schemaHost._returningColumnsForInsert(connection)).toEqual(["id"]);
    expect(calls).toBe(first);
  });

  it("recomputes after resetColumnInformation", async () => {
    await Topic.loadSchema();
    let calls = 0;
    const connection = {
      async returnValueAfterInsert(column: { name: string }) {
        calls += 1;
        return column.name === "id";
      },
    };

    await schemaHost._returningColumnsForInsert(connection);
    const first = calls;

    void schemaHost.resetColumnInformation();
    await Topic.loadSchema();

    expect(await schemaHost._returningColumnsForInsert(connection)).toEqual(["id"]);
    expect(calls).toBeGreaterThan(first);
  });

  it("resetting a base clears a descendant's memo", async () => {
    class Reply extends Topic {}
    const sub = Reply as unknown as typeof schemaHost;

    void schemaHost.resetColumnInformation();
    await Reply.loadSchema();

    let calls = 0;
    const connection = {
      async returnValueAfterInsert(column: { name: string }) {
        calls += 1;
        return column.name === "id";
      },
    };

    await sub._returningColumnsForInsert(connection);
    const afterSubMemo = calls;
    expect(afterSubMemo).toBeGreaterThan(0);
    expect(Object.prototype.hasOwnProperty.call(Reply, "_returningColumnsForInsertCache")).toBe(
      true,
    );
    await sub._returningColumnsForInsert(connection);
    expect(calls).toBe(afterSubMemo);

    void schemaHost.resetColumnInformation();
    await Reply.loadSchema();

    const memoized = await sub._returningColumnsForInsert(connection);
    Reflect.deleteProperty(Reply, "_returningColumnsForInsertCache");
    expect(memoized).toEqual(await sub._returningColumnsForInsert(connection));
  });
});
