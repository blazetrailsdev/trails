/**
 * Trails-only compile-time tests: `afterInitialize` / `afterFind` are the two
 * AR callback chains trails runs synchronously (`strict: "sync"`), so their
 * registrars must reject `Promise`-returning callbacks at the type level. No
 * Rails counterpart — Ruby has no such distinction.
 *
 * These assertions are checked by `tsc`; the runtime body only exists so the
 * file participates in the typecheck the same way the rest of the suite does.
 */
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
    // Value-returning arrow, as used by test-helpers/models/bulb.ts.
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
