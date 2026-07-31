import { describe, it, expect } from "vitest";
import { Base } from "./index.js";
import { afterFind, afterInitialize } from "./callbacks.js";

class SyncOnlyCallbackModel extends Base {
  static override tableName = "developers";
  declare name: string;
}

describe("sync-only callback registrar types", () => {
  it("rejects async callbacks and accepts every sync form", () => {
    const asyncArrow = async (record: SyncOnlyCallbackModel) => {
      record.name = "async";
    };
    const promiseReturning = (record: SyncOnlyCallbackModel) => Promise.resolve(record.name);

    // @ts-expect-error async callbacks are not allowed on the sync initialize chain
    afterInitialize(SyncOnlyCallbackModel, asyncArrow);
    // @ts-expect-error async callbacks are not allowed on the sync find chain
    afterFind(SyncOnlyCallbackModel, asyncArrow);
    // @ts-expect-error thenable-returning callbacks are not allowed either
    afterInitialize(SyncOnlyCallbackModel, promiseReturning);
    // @ts-expect-error thenable-returning callbacks are not allowed either
    afterFind(SyncOnlyCallbackModel, promiseReturning);
    // @ts-expect-error inline async arrows are rejected the same way
    afterInitialize(SyncOnlyCallbackModel, async () => {});

    const seen: string[] = [];

    afterInitialize(SyncOnlyCallbackModel, () => {
      seen.push("statement-body");
    });
    afterInitialize(SyncOnlyCallbackModel, (record) => (record.name = "red"));
    afterInitialize(SyncOnlyCallbackModel, () => false);
    afterFind(SyncOnlyCallbackModel, function (record) {
      seen.push(record.name);
      return;
    });
    afterFind(SyncOnlyCallbackModel, (record) => record.name);

    expect(seen).toEqual([]);
  });
});
