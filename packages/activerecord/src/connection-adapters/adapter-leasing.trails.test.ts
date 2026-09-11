import { describe, it, expect } from "vitest";
import { AbstractAdapter } from "./abstract-adapter.js";
import { withExecutionContext } from "./abstract/connection-pool/execution-context.js";
import { ActiveRecordError } from "../errors.js";

describe("AdapterLeasingTest", () => {
  it("expire from a different thread raises", async () => {
    const adapter = new AbstractAdapter({});
    adapter.lease();
    await withExecutionContext(async () => {
      expect(() => adapter.expire()).toThrow(ActiveRecordError);
      expect(() => adapter.expire()).toThrow(
        /^Cannot expire connection, it is owned by a different thread: #<Thread:0 run>\. Current thread: #<Thread:\d+ run>\.$/,
      );
    });
    expect(adapter.inUse).toBeTruthy();
    adapter.expire();
    expect(adapter.inUse).toBeFalsy();
  });

  it("lease from a different thread names the owner", async () => {
    const adapter = new AbstractAdapter({});
    adapter.lease();
    await withExecutionContext(async () => {
      expect(() => adapter.lease()).toThrow(
        /^Cannot lease connection, it is already in use by a different thread: #<Thread:0 run>\. Current thread: #<Thread:\d+ run>\.$/,
      );
    });
  });
});
