import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Notifications } from "@blazetrails/activesupport";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import { ActiveRecord } from "@blazetrails/activerecord";
import { setVerboseQueryLogs } from "@blazetrails/activerecord/active-record";
import { include } from "@blazetrails/ruby-compat";
import type { Generation, Rack } from "../../support/isolation/abstract-unit.js";
import "../../support/isolation/abstract-unit.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
interface NotificationsTest extends Generation {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class NotificationsTest extends TestCase {
  instrument(...args: Parameters<typeof Notifications.instrument>) {
    return Notifications.instrument(...args);
  }

  wait() {
    return Notifications.notifier.wait();
  }
}
include(NotificationsTest, Isolation);
registerSpecType(/^NotificationsTest$/, NotificationsTest);

describe("NotificationsTest", { timeout: 120_000 }, () => {
  let t: NotificationsTest;

  beforeEach(async () => {
    t = new NotificationsTest("test");
    await t.buildApp();
  });

  afterEach(() => t.teardownApp());

  it("trails log_subscribers are added", async () => {
    await t.addToConfig(`
        this.config.colorizeLogging = false;
`);

    await import(`${await t.appPath()}/config/environment.ts`);
    const { MockLogger } = await import("@blazetrails/activesupport/log-subscriber/test-helper");

    const logger = new MockLogger();
    ActiveRecord.Base.logger = logger as never;
    setVerboseQueryLogs(false);

    t.instrument("sql.active_record", { name: "SQL", sql: "SHOW tables" });
    t.wait();

    expect(logger.logged(":debug").length).toBe(1);
    expect(logger.logged(":debug").at(-1)).toMatch(/SHOW tables/);
  });

  it("trails load_config_initializer event is instrumented", async () => {
    await t.appFile("config/initializers/foo.ts", "");

    const events: unknown[][] = [];
    const callback = (..._: unknown[]) => events.push(_);
    await Notifications.subscribed(callback, "load_config_initializer.railties", () =>
      (t as unknown as Rack).app(),
    );

    expect(events.map((e) => e[0])).toEqual(["load_config_initializer.railties"]);
    expect((events[0].at(-1) as { initializer: string }).initializer).toContain(
      "config/initializers/foo.ts",
    );
  });
});
