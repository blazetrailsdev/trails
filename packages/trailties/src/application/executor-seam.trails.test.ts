// Trails-only integration coverage for the seam that runs
// `ActiveSupport::Executor` around a unit of work: `Rails::Application#executor`
// (`application.rb:122`) handed to `ActionDispatch::Executor`
// (`default_middleware_stack.rb:49`). Rails covers the two halves separately
// (`dispatch/executor_test.rb`, `asynchronous_queries_test.rb`); the wiring
// between them has no single Rails counterpart.
import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { Executor as ActionDispatchExecutor } from "@blazetrails/actionpack";
import type { RackEnv, RackResponse } from "@blazetrails/rack";
import { Base, Trailtie } from "@blazetrails/activerecord";
import { Application } from "../application.js";
import { Configuration } from "./configuration.js";
import { DefaultMiddlewareStack } from "./default-middleware-stack.js";
import { Root } from "../paths.js";

const SESSION_ERROR = "Can't perform asynchronous queries without a query session";

async function selectOneAsync(): Promise<unknown[]> {
  const connection = await Base.leaseConnection();
  const result = await connection.selectAll("SELECT 1 AS one", null, [], { async: true });
  return (await result.result()).toArray();
}

describe("ActionDispatch::Executor around a request (trails)", () => {
  class TestApplication extends Application {}
  let app: TestApplication;

  // The initializers register the executor hooks on `ActiveSupport::Executor`
  // itself, so running them per-test would stack a second copy of every hook.
  beforeAll(() => {
    Trailtie.runInitializers();
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
      sessionActiveInRequest = Base.asynchronousQueriesSession().active();
      rows = await selectOneAsync();
      return [200, {}, []] as unknown as RackResponse;
    }, app.executor);

    const [, , body] = await middleware.call({} as RackEnv);

    expect(sessionActiveInRequest).toBe(true);
    expect(rows).toEqual([{ one: 1 }]);

    // `ActionDispatch::Executor` defers `state.complete!` to the body's close
    // (`executor.rb:23`), so the session outlives `call` and dies with the body.
    expect(Base.asynchronousQueriesSession().active()).toBe(true);
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

    const [, , body] = await middleware.call({} as RackEnv);
    expect(enabledInRequest).toBe(true);

    (body as unknown as { close(): void }).close();
    expect(Base.connectionPool().queryCacheEnabled).toBe(false);
    expect(Base.connectionPool().queryCache.empty).toBe(true);
  });

  it("opens the session through the built default middleware stack", async () => {
    const paths = new Root("/app");
    paths.add("public");
    const config = new Configuration();
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

    const [status, , stackBody] = await stackApp({
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
    } as unknown as RackEnv);

    expect(status).toBe(200);
    expect(rows).toEqual([{ one: 1 }]);

    (stackBody as unknown as { close(): void }).close();
    expect(() => Base.asynchronousQueriesSession()).toThrow(SESSION_ERROR);
  });

  it("finalizes the session when the request raises", async () => {
    const middleware = new ActionDispatchExecutor(async () => {
      expect(Base.asynchronousQueriesSession().active()).toBe(true);
      throw new Error("lol borked");
    }, app.executor);

    await expect(middleware.call({} as RackEnv)).rejects.toThrow("lol borked");
    expect(() => Base.asynchronousQueriesSession()).toThrow(SESSION_ERROR);
  });
});

// `Class.new(ActiveSupport::Executor)` / `Class.new(ActiveSupport::Reloader)`
// (`application.rb:122-123`). Rails gets the per-app isolation for free from
// `Class.new` and has no test for it; trails' properties carry a written type,
// which a plain `Executor` would also satisfy.
describe("Rails::Application#executor and #reloader are per-application (trails)", () => {
  class TestApplication extends Application {}

  it("does not share callbacks between two applications", () => {
    const one = new TestApplication();
    const two = new TestApplication();

    expect(one.executor).not.toBe(two.executor);
    expect(one.reloader).not.toBe(two.reloader);

    const ran: string[] = [];
    one.executor.toRun(() => ran.push("one"));
    two.executor.wrap(() => {});

    expect(ran).toEqual([]);
    one.executor.wrap(() => {});
    expect(ran).toEqual(["one"]);
  });

  it("wires the reloader's executor to the application's own executor", () => {
    const app = new TestApplication();

    expect(app.reloader.executor).toBe(app.executor);
  });
});
