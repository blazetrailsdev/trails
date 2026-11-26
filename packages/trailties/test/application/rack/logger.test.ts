import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Notifications } from "@blazetrails/activesupport";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import type { MockLogger } from "@blazetrails/activesupport/log-subscriber/test-helper";
import { Methods } from "@blazetrails/rack-test";
import { include } from "@blazetrails/ruby-compat/include";
import { Application } from "../../../lib/application.js";
import { Trails } from "../../../lib/trails.js";
import type { Generation, Rack } from "../../support/isolation/abstract-unit.js";
import "../../support/isolation/abstract-unit.js";

class LoggerTest extends TestCase {
  /** @internal */
  _logs: string | null = null;

  logs(): string {
    return (this._logs ??= (Trails.logger as unknown as MockLogger).logged(":info").join("\n"));
  }

  wait() {
    return Notifications.notifier.wait();
  }
}
include(LoggerTest, Isolation);
include(LoggerTest, Methods);
registerSpecType(/^LoggerTest$/, LoggerTest);

type Verb = (path: string, params?: unknown, env?: Record<string, unknown>) => Promise<unknown>;
type Host = Generation & Omit<Rack, "get"> & LoggerTest & { get: Verb; head: Verb; post: Verb };

describe("LoggerTest", { timeout: 120_000 }, () => {
  let t: Host;

  beforeEach(async () => {
    t = new LoggerTest("test") as unknown as Host;
    await t.buildApp();
    await t.addToConfig(`
          const { MockLogger } = await import("@blazetrails/activesupport/log-subscriber/test-helper");
          Trails.application!.config.logger = new MockLogger();
`);

    await import(`${await t.appPath()}/config/environment.ts`);
  });

  afterEach(async () => {
    await t.teardownApp();
    Trails.application = null;
    Application.appClass = null;
  });

  it("logger logs proper HTTP GET verb and path", async () => {
    await t.get("/blah");
    await t.wait();
    expect(t.logs()).toMatch('Started GET "/blah"');
  });

  it("logger logs proper HTTP HEAD verb and path", async () => {
    await t.head("/blah");
    await t.wait();
    expect(t.logs()).toMatch('Started HEAD "/blah"');
  });

  it("logger logs HTTP verb override", async () => {
    await t.post("/", { _method: "put" });
    await t.wait();
    expect(t.logs()).toMatch('Started PUT "/"');
  });

  it("logger logs HEAD requests", async () => {
    await t.post("/", { _method: "head" });
    await t.wait();
    expect(t.logs()).toMatch('Started HEAD "/"');
  });

  it("logger logs correct remote IP address", async () => {
    await t.get("/", {}, { REMOTE_ADDR: "127.0.0.1", HTTP_X_FORWARDED_FOR: "1.2.3.4" });
    await t.wait();
    expect(t.logs()).toMatch('Started GET "/" for 1.2.3.4');
  });
});
