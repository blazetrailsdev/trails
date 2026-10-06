import { describe, it, expect, afterEach } from "vitest";
import { MemoryStore, Notifications } from "@blazetrails/activesupport";
import { rateLimiting } from "./rate-limiting.js";
import { Base } from "../base.js";
import { API } from "../api.js";
import { Request } from "../../action-dispatch/request.js";
import { Response } from "../../action-dispatch/response.js";

const makeRequest = () =>
  new Request({
    REQUEST_METHOD: "GET",
    PATH_INFO: "/show",
    HTTP_HOST: "localhost",
    REMOTE_ADDR: "1.2.3.4",
  });

afterEach(() => {
  Notifications.unsubscribeAll();
});

describe("rateLimit integration through Base.beforeAction / dispatch", () => {
  it("triggers head(429) and short-circuits the action body once the limit is exceeded", async () => {
    const store = new MemoryStore();
    let actionRan = 0;

    class LimitedController extends Base {
      async show() {
        actionRan += 1;
        this.head(200);
      }
    }
    LimitedController.rateLimit({ to: 1, within: 60, store });

    const r1 = new LimitedController();
    await r1.dispatch("show", makeRequest(), new Response());
    expect(r1.status).toBe(200);
    expect(actionRan).toBe(1);

    const r2 = new LimitedController();
    await r2.dispatch("show", makeRequest(), new Response());
    expect(r2.status).toBe(429);
    expect(actionRan).toBe(1);
    expect(store.read("rate-limit:limited:1.2.3.4")).toBe(2);
  });

  it("instruments a rate_limit.action_controller event when the limit is exceeded", async () => {
    const events: Array<Record<string, unknown>> = [];
    Notifications.subscribe("rate_limit.action_controller", (event) => {
      events.push(event.payload);
    });

    class InstrumentedController extends Base {
      async show() {
        this.head(200);
      }
    }
    InstrumentedController.rateLimit({ to: 0, within: 60, store: new MemoryStore() });

    const c = new InstrumentedController();
    await c.dispatch("show", makeRequest(), new Response());
    expect(events).toHaveLength(1);
    expect(events[0].request).toBe(c.request);
  });

  it("is also wired onto ActionController::API (Rails api.rb:125 includes RateLimiting)", async () => {
    class PingApi extends API {
      async show() {
        this.head(200);
      }
    }
    PingApi.rateLimit({ to: 0, within: 60, store: new MemoryStore() });

    const c = new PingApi();
    await c.dispatch("show", makeRequest(), new Response());
    expect(c.status).toBe(429);
  });

  it("a prototype-method override of rateLimiting wins through rateLimit/beforeAction dispatch", async () => {
    const overrideCalls: string[] = [];

    class MethodOverrideController extends Base {
      async show() {
        this.head(200);
      }
      async rateLimiting(args: Parameters<typeof rateLimiting>[0]): Promise<void> {
        overrideCalls.push("method-override");
        await rateLimiting.call(this, args);
      }
    }
    MethodOverrideController.rateLimit({ to: 1, within: 60, store: new MemoryStore() });

    const c = new MethodOverrideController();
    await c.dispatch("show", makeRequest(), new Response());
    expect(overrideCalls).toEqual(["method-override"]);
  });
});
