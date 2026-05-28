import { BodyProxy } from "@blazetrails/rack";
import {
  QueryCache,
  ConnectionPool,
  Executor,
  AsynchronousQueriesTracker,
} from "@blazetrails/activerecord";

/**
 * Middleware that wraps the request in an executor cycle and returns a
 * BodyProxy so connection clearing happens after the response body is consumed.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::ConnectionManagement
 * (superseded by executor hooks in Rails 5.1+, but the test contract remains)
 */
export function ConnectionManagement(
  app: (env: Record<string, unknown>) => [number, Record<string, unknown>, unknown],
): (env: Record<string, unknown>) => [number, Record<string, unknown>, BodyProxy] {
  const executor = new Executor();
  QueryCache.installExecutorHooks(executor);
  AsynchronousQueriesTracker.installExecutorHooks(executor);
  ConnectionPool.installExecutorHooks(executor);

  return function (env: Record<string, unknown>): [number, Record<string, unknown>, BodyProxy] {
    const [status, headers, body] = executor.wrap(() => app(env));
    return [status, headers, new BodyProxy(body, () => {})];
  };
}
