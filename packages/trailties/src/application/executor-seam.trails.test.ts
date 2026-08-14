// Trails-only integration coverage for the seam that runs
// `ActiveSupport::Executor` around a unit of work: `Rails::Application#executor`
// (`application.rb:122`) handed to `ActionDispatch::Executor`
// (`default_middleware_stack.rb:49`). Rails covers the two halves separately
// (`dispatch/executor_test.rb`, `asynchronous_queries_test.rb`); the wiring
// between them has no single Rails counterpart.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Executor as ActionDispatchExecutor } from "@blazetrails/actionpack";
import type { RackEnv, RackResponse } from "@blazetrails/rack";
import { Base, Trailtie } from "@blazetrails/activerecord";
import { Application } from "../application.js";

const SESSION_ERROR = "Can't perform asynchronous queries without a query session";

async function selectOneAsync(): Promise<unknown[]> {
  const connection = await Base.leaseConnection();
  const result = await connection.selectAll("SELECT 1 AS one", null, [], { async: true });
  return (await result.result()).toArray();
}

describe("ActionDispatch::Executor around a request (trails)", () => {
  class TestApplication extends Application {}
  let app: TestApplication;

  beforeEach(async () => {
    Trailtie.runInitializers();
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

  it("finalizes the session when the request raises", async () => {
    const middleware = new ActionDispatchExecutor(async () => {
      expect(Base.asynchronousQueriesSession().active()).toBe(true);
      throw new Error("lol borked");
    }, app.executor);

    await expect(middleware.call({} as RackEnv)).rejects.toThrow("lol borked");
    expect(() => Base.asynchronousQueriesSession()).toThrow(SESSION_ERROR);
  });
});
