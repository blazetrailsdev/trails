import { describe, it, beforeEach, expect } from "vitest";
import { Notifications } from "@blazetrails/activesupport";
import type { NotificationEvent } from "@blazetrails/activesupport";
import { describeIfMysqlAdapter, leaseMysqlAdapter, Mysql2Adapter } from "./test-helper.js";

describeIfMysqlAdapter("AbstractMysqlAdapter advisory locks", () => {
  let adapter: Mysql2Adapter;
  beforeEach(async () => {
    adapter = await leaseMysqlAdapter();
  });

  describe("notification stream", () => {
    it("instruments GET_LOCK and RELEASE_LOCK with the quoted name and timeout", async () => {
      const logged: string[] = [];
      const sub = Notifications.subscribe("sql.active_record", (event: NotificationEvent) => {
        logged.push(event.payload.sql as string);
      });
      try {
        expect(await adapter.getAdvisoryLock("trails'lock", 0)).toBe(true);
        expect(await adapter.releaseAdvisoryLock("trails'lock")).toBe(true);
      } finally {
        Notifications.unsubscribe(sub);
      }
      const quoted = adapter.quote("trails'lock");
      expect(logged).toContain(`SELECT GET_LOCK(${quoted}, 0)`);
      expect(logged).toContain(`SELECT RELEASE_LOCK(${quoted})`);
    });
  });
});
