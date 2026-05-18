/**
 * ActionDispatch::Executor
 *
 * Wraps the request in an ActiveSupport::Executor#run! / state.complete! cycle,
 * reporting unhandled exceptions through the executor's error reporter.
 */

import { BodyProxy } from "@blazetrails/rack";
import type { RackApp, RackEnv, RackResponse } from "@blazetrails/rack";
import { ExceptionWrapper } from "./exception-wrapper.js";

export interface ExecutorState {
  complete(): void;
}

export interface ErrorReporterLike {
  report(error: unknown, opts: { handled: boolean; source: string }): void;
}

export interface ExecutorLike {
  run(opts?: { reset?: boolean }): ExecutorState;
  errorReporter: ErrorReporterLike;
}

export class Executor {
  private app: RackApp;
  private executor: ExecutorLike;

  constructor(app: RackApp, executor: ExecutorLike) {
    this.app = app;
    this.executor = executor;
  }

  async call(env: RackEnv): Promise<RackResponse> {
    const state = this.executor.run({ reset: true });
    let returned = false;
    try {
      const response = await this.app(env);

      if (env["action_dispatch.report_exception"]) {
        const error = env["action_dispatch.exception"];
        this.executor.errorReporter.report(error, {
          handled: false,
          source: "application.action_dispatch",
        });
      }

      const [status, headers, body] = response;
      const wrapped = new BodyProxy(body, () => state.complete());
      returned = true;
      return [status, headers, wrapped] as unknown as RackResponse;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const wrapper = new ExceptionWrapper(err);
      this.executor.errorReporter.report(wrapper.exception, {
        handled: false,
        source: "application.action_dispatch",
      });
      throw err;
    } finally {
      if (!returned) state.complete();
    }
  }
}
