import { rbFSend } from "@blazetrails/ruby-compat";
import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { Executor as ActionDispatchExecutor } from "@blazetrails/actionpack";
import type { RackResponse } from "@blazetrails/rack";
import { Base } from "@blazetrails/activerecord";
import { Trailtie } from "../../lib/trailties/active-record.js";
import { runTrailtieInitializers } from "../support/trailtie-initializers.js";
import { Deprecators, Logger } from "@blazetrails/activesupport";
import { Trails } from "../../lib/trails.js";
import { Application } from "../../lib/application.js";
import { Configuration } from "../../lib/application/configuration.js";
import { DefaultMiddlewareStack } from "../../lib/application/default-middleware-stack.js";
import { Root } from "../../lib/paths.js";
import { useInMemoryDatabaseUrl } from "../support/in-memory-database-url.js";

const SESSION_ERROR = "Can't perform asynchronous queries without a query session";

async function selectOneAsync(): Promise<unknown[]> {
  const connection = await Base.leaseConnection();
  const result = await connection.selectAll("SELECT 1 AS one", null, [], { async: true });
  return (await result.result()).toArray();
}

describe("ActionDispatch::Executor around a request (trails)", () => {
  useInMemoryDatabaseUrl();

  class TestApplication extends Application {}
  let app: TestApplication;

  beforeAll(async () => {
    await runTrailtieInitializers(Trailtie, {
      deprecators: new Deprecators(),
      config: Object.assign(new Configuration("/nonexistent-app"), { filterParameters: [] }),
      credentials: async () => ({ config: async () => ({}), dig: () => undefined }),
    });
  });

  beforeEach(async () => {
    app = new TestApplication();
    await Base.establishConnection({ adapter: "sqlite3", database: ":memory:" });
  });

  afterEach(async () => {
    await Base.removeConnection();
  });

  it("opens a query session for the request body and finalizes it on close", async () => {
    expect(() => Base.asynchronousQueriesSession()).toThrow(SESSION_ERROR);

    let sessionActiveInRequest: boolean | null = null;
    let rows: unknown[] | null = null;
    const middleware = new ActionDispatchExecutor(async () => {
      sessionActiveInRequest = Base.asynchronousQueriesSession().isActive();
      rows = await selectOneAsync();
      return [200, {}, []] as unknown as RackResponse;
    }, app.executor);

    const [, , body] = await middleware.call({});

    expect(sessionActiveInRequest).toBe(true);
    expect(rows).toEqual([{ one: 1 }]);

    expect(Base.asynchronousQueriesSession().isActive()).toBe(true);
    (body as unknown as { close(): void }).close();
    expect(() => Base.asynchronousQueriesSession()).toThrow(SESSION_ERROR);
  });

  it("enables the query cache for the request body and clears it on close", async () => {
    const pool = Base.connectionPool();
    expect(pool.queryCacheEnabled).toBe(false);

    let enabledInRequest: boolean | null = null;
    const middleware = new ActionDispatchExecutor(async () => {
      const connection = await Base.leaseConnection();
      await connection.selectAll("SELECT 1 AS one", null, []);
      enabledInRequest = Base.connectionPool().queryCacheEnabled;
      return [200, {}, []] as unknown as RackResponse;
    }, app.executor);

    const [, , body] = await middleware.call({});
    expect(enabledInRequest).toBe(true);

    (body as unknown as { close(): void }).close();
    expect(Base.connectionPool().queryCacheEnabled).toBe(false);
    expect(Base.connectionPool().queryCache.empty).toBe(true);
  });

  it("opens the session through the built default middleware stack", async () => {
    const paths = new Root("/app");
    paths.add("public");
    const config = new Configuration("/app");
    config.publicFileServer.enabled = false;
    const stack = new DefaultMiddlewareStack(
      { config, executor: app.executor, reloader: app.reloader },
      config,
      paths,
    ).buildStack();

    let rows: unknown[] | null = null;
    const stackApp = stack.build(async () => {
      rows = await selectOneAsync();
      return [200, {}, []] as unknown as RackResponse;
    });

    const logger = Trails.logger;
    Trails.logger = new Logger(null);
    const [status, , stackBody] = await (
      rbFSend(stackApp, "call", {
        REQUEST_METHOD: "GET",
        PATH_INFO: "/",
      }) as Promise<RackResponse>
    ).finally(() => {
      Trails.logger = logger;
    });

    expect(status).toBe(200);
    expect(rows).toEqual([{ one: 1 }]);

    (stackBody as unknown as { close(): void }).close();
    expect(() => Base.asynchronousQueriesSession()).toThrow(SESSION_ERROR);
  });

  it("finalizes the session when the request raises", async () => {
    const middleware = new ActionDispatchExecutor(async () => {
      expect(Base.asynchronousQueriesSession().isActive()).toBe(true);
      throw new Error("lol borked");
    }, app.executor);

    await expect(middleware.call({})).rejects.toThrow("lol borked");
    expect(() => Base.asynchronousQueriesSession()).toThrow(SESSION_ERROR);
  });
});

describe("Trails::Application#executor and #reloader are per-application (trails)", () => {
  class TestApplication extends Application {}

  it("does not share callbacks between two applications", async () => {
    const one = new TestApplication();
    const two = new TestApplication();

    expect(one.executor).not.toBe(two.executor);
    expect(one.reloader).not.toBe(two.reloader);

    const ran: string[] = [];
    one.executor.toRun(() => ran.push("one"));
    await two.executor.wrap(() => {});

    expect(ran).toEqual([]);
    await one.executor.wrap(() => {});
    expect(ran).toEqual(["one"]);
  });

  it("wires the reloader's executor to the application's own executor", () => {
    const app = new TestApplication();

    expect(app.reloader.executor).toBe(app.executor);
  });
});
