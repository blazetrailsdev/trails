import { currentAdapter } from "../../support/adapter-helper.js";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Base } from "../../../lib/base.js";
import { SQLite3Adapter } from "../../../lib/connection-adapters/sqlite3-adapter.js";

let adapter: SQLite3Adapter;

describe.runIf(currentAdapter("SQLite3Adapter"))(
  "AbstractAdapter#isPreventingWrites with no connection descriptor",
  () => {
    beforeEach(() => {
      adapter = new SQLite3Adapter({ database: ":memory:" });
    });

    afterEach(async () => {
      await adapter.disconnectBang();
    });

    it("is not preventing writes inside an ambient Base scope", async () => {
      expect(adapter.connectionDescriptor).toBeUndefined();

      await Base.whilePreventingWrites(async () => {
        expect(adapter.isPreventingWrites()).toBe(false);
      });
    });

    it("still reports preventing writes for a standalone replica", async () => {
      const replica = new SQLite3Adapter({ database: ":memory:", replica: true } as never);
      try {
        expect(replica.connectionDescriptor).toBeUndefined();
        expect(replica.isPreventingWrites()).toBe(true);
      } finally {
        await replica.disconnectBang();
      }
    });
  },
);
