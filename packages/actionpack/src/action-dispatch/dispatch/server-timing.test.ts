import { afterEach, beforeEach, describe, it } from "vitest";
import { Notifications, assertMatch, assertNoMatch } from "@blazetrails/activesupport";
import { Lint, MockRequest, bodyFromString } from "@blazetrails/rack";
import type { RackApp, RackEnv, RackResponse } from "@blazetrails/rack";
import { rbFSend } from "@blazetrails/ruby-compat";
import { Base } from "../../action-controller/base.js";
import { SERVER_TIMING } from "../constants.js";
import { controllerConstants } from "../http/request.js";
import type { MiddlewareFactory } from "../middleware/stack.js";
import { ServerTiming } from "../middleware/server-timing.js";
import { RouteSet } from "../routing/route-set.js";
import { IntegrationTest } from "../testing/integration.js";
import "../../test-helpers/abstract-unit.js";

describe("ServerTimingTest", () => {
  class TestController extends Base {
    index(): void {
      this.head("ok");
    }

    async show(): Promise<void> {
      await Notifications.instrument("custom.event", {}, () => true);
      this.head("ok");
    }

    async create(): Promise<void> {
      await Notifications.instrument("custom.event", {}, () => {
        throw new Error();
      });
    }
  }
  controllerConstants.set("server_timing_test/test", TestController);

  let middlewares: MiddlewareFactory[];
  let headerName: string;
  let t: IntegrationTest;

  beforeEach(({ task }) => {
    middlewares = [
      Lint as MiddlewareFactory,
      ServerTiming as MiddlewareFactory,
      Lint as MiddlewareFactory,
    ];
    headerName = SERVER_TIMING;
    t = new IntegrationTest(task.name);
  });

  afterEach(() => {
    ServerTiming.unsubscribe();
  });

  function withTestRouteSet(): void {
    const set = new RouteSet();
    set.draw(function () {
      this.scope({ module: "server_timing_test" }, () => {
        this.get("/", { to: "test#index" });
        this.get("/id", { to: "test#show" });
        this.post("/", { to: "test#create" });
      });
    });
    t.app = IntegrationTest.buildApp(set, (middleware) => {
      for (const m of middlewares) middleware.use(m);
    });
  }

  it("server timing header is included in the response", async () => {
    withTestRouteSet();
    await t.get("/");
    assertMatch(/\w+/, t.response.headers.get(headerName) as string);
  });

  it("includes default action controller events duration", async () => {
    withTestRouteSet();
    await t.get("/");
    assertMatch(
      /start_processing.action_controller;dur=\w+/,
      t.response.headers.get(headerName) as string,
    );
    assertMatch(
      /process_action.action_controller;dur=\w+/,
      t.response.headers.get(headerName) as string,
    );
  });

  it("includes custom active support events duration", async () => {
    withTestRouteSet();
    await t.get("/id");
    assertMatch(/custom.event;dur=\w+/, t.response.headers.get(headerName) as string);
  });

  it("events are tracked by thread", async () => {
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => (release = resolve));

    const stubApp = async (env: RackEnv): Promise<RackResponse> => {
      await (env["action_dispatch.test"] as () => Promise<void>)();
      return [200, {}, bodyFromString("ok")];
    };
    const app = new Lint(new ServerTiming(new Lint(stubApp as RackApp) as never) as never);

    const t1 = rbFSend(
      app,
      "call",
      MockRequest.envFor("", { "action_dispatch.test": () => barrier }),
    ) as Promise<RackResponse>;
    const proc = async () => {
      await Notifications.instrument("custom.event", {}, () => true);
    };
    const t2 = rbFSend(
      app,
      "call",
      MockRequest.envFor("", { "action_dispatch.test": proc }),
    ) as Promise<RackResponse>;
    const headers2 = (await t2)[1];
    release();
    const headers1 = (await t1)[1];

    assertMatch(/custom.event;dur=\w+/, headers2[headerName] as string);
    assertNoMatch(/custom.event;dur=\w+/, (headers1[headerName] ?? "") as string);
  });

  it("does not overwrite existing header values", async () => {
    middlewares.push(
      class {
        constructor(private app: RackApp) {}

        async call(env: RackEnv): Promise<RackResponse> {
          const [status, headers, body] = (await rbFSend(this.app, "call", env)) as RackResponse;
          const headerName = SERVER_TIMING;
          headers[headerName] = [headers[headerName], `entry;desc="description"`]
            .filter((v) => v != null)
            .join(", ");
          return [status, headers, body];
        }
      } as MiddlewareFactory,
    );

    withTestRouteSet();
    await t.get("/");
    assertMatch(/entry;desc="description"/, t.response.headers.get(headerName) as string);
    assertMatch(
      /start_processing.action_controller;dur=\w+/,
      t.response.headers.get(headerName) as string,
    );
  });
});
