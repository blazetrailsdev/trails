// Trails-only integration coverage for the seam that runs
// `ActiveSupport::Executor` around a unit of work: `Rails::Application#executor`
// (`application.rb:122`) handed to `ActionDispatch::Executor`
// (`default_middleware_stack.rb:49`). Rails' own suites cover the two halves
// separately (`actionpack/test/dispatch/executor_test.rb`,
// `activerecord/test/cases/asynchronous_queries_test.rb`); what has no single
// Rails counterpart is the wiring between them, which only exists once an
// application assembles the stack.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Executor as ActionDispatchExecutor } from "@blazetrails/actionpack";
import type { RackEnv, RackResponse } from "@blazetrails/rack";
import { Base, Trailtie, asynchronousQueriesTracker } from "@blazetrails/activerecord";
import { Application } from "../application.js";

const SESSION_ERROR = "Can't perform asynchronous queries without a query session";

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
    expect(() => asynchronousQueriesTracker().currentSession).toThrow(SESSION_ERROR);

    let sessionActiveInRequest: boolean | null = null;
    let rows: unknown[] | null = null;
    const middleware = new ActionDispatchExecutor(async () => {
      sessionActiveInRequest = asynchronousQueriesTracker().currentSession.active();
      const connection = await Base.leaseConnection();
      const result = await connection.selectAll("SELECT 1 AS one", null, [], { async: true });
      rows = (await result.result()).toArray();
      return [200, {}, []] as unknown as RackResponse;
    }, app.executor);

    const [, , body] = await middleware.call({} as RackEnv);

    expect(sessionActiveInRequest).toBe(true);
    expect(rows).toEqual([{ one: 1 }]);

    // `ActionDispatch::Executor` defers `state.complete!` to the body's close
    // (`executor.rb:23`), so the session outlives `call` and dies with the body.
    expect(asynchronousQueriesTracker().currentSession.active()).toBe(true);
    (body as unknown as { close(): void }).close();
    expect(() => asynchronousQueriesTracker().currentSession).toThrow(SESSION_ERROR);
  });

  it("finalizes the session when the request raises", async () => {
    const middleware = new ActionDispatchExecutor(async () => {
      expect(asynchronousQueriesTracker().currentSession.active()).toBe(true);
      throw new Error("lol borked");
    }, app.executor);

    await expect(middleware.call({} as RackEnv)).rejects.toThrow("lol borked");
    expect(() => asynchronousQueriesTracker().currentSession).toThrow(SESSION_ERROR);
  });
});
