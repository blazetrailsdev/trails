import { rbFSend } from "@blazetrails/ruby-compat";
import { BodyProxy } from "@blazetrails/rack";
import type { RackApp, RackEnv, RackResponse } from "@blazetrails/rack";
import type { BacktraceCleaner } from "@blazetrails/activesupport";
import { Request } from "../http/request.js";
import { ExceptionWrapper } from "./exception-wrapper.js";

export interface ExecutorState {
  completeBang(): unknown;
}

export interface ErrorReporterLike {
  report(error: unknown, opts: { handled: boolean; source: string }): void;
}

export interface ExecutorLike {
  runBang(opts?: { reset?: boolean }): ExecutorState | PromiseLike<ExecutorState>;
  errorReporter(): ErrorReporterLike;
}

export class Executor {
  private app: RackApp;
  private executor: ExecutorLike;

  constructor(app: RackApp, executor: ExecutorLike) {
    this.app = app;
    this.executor = executor;
  }

  async call(env: RackEnv): Promise<RackResponse> {
    const state = await this.executor.runBang({ reset: true });
    let returned = false;
    try {
      const response = await (rbFSend(this.app, "call", env) as ReturnType<typeof this.app>);

      if (env["action_dispatch.report_exception"]) {
        const error = env["action_dispatch.exception"];
        this.executor.errorReporter().report(error, {
          handled: false,
          source: "application.action_dispatch",
        });
      }

      const [status, headers, body] = response;
      const wrapped = new BodyProxy(body, () => state.completeBang());
      returned = true;
      return [status, headers, wrapped];
    } catch (error) {
      const request = new Request(env);
      const backtraceCleaner = request.getHeader("action_dispatch.backtrace_cleaner") as
        | BacktraceCleaner
        | null
        | undefined;
      const wrapper = new ExceptionWrapper(backtraceCleaner ?? null, error as Error);
      this.executor.errorReporter().report(wrapper.unwrappedException, {
        handled: false,
        source: "application.action_dispatch",
      });
      throw error;
    } finally {
      if (!returned) state.completeBang();
    }
  }
}
