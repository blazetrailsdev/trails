/**
 * ActionDispatch::Callbacks
 *
 * Provides callbacks to be executed before and after dispatching the request.
 */

import {
  CallbacksMixin,
  type BeforeCallback,
  type AfterCallback,
} from "@blazetrails/activesupport";
import type { RackApp, RackEnv, RackResponse } from "@blazetrails/rack";

class CallbacksBase extends CallbacksMixin() {}
CallbacksBase.defineCallbacks("call");

export class Callbacks extends CallbacksBase {
  private app: RackApp;

  constructor(app: RackApp) {
    super();
    this.app = app;
  }

  static before(callback: BeforeCallback): void {
    this.beforeCallback("call", callback);
  }

  static after(callback: AfterCallback): void {
    this.afterCallback("call", callback);
  }

  async call(env: RackEnv): Promise<RackResponse> {
    let result: RackResponse | undefined;
    let error: unknown = null;
    await this.runCallbacks("call", async () => {
      try {
        result = await this.app(env);
      } catch (e) {
        error = e;
      }
    });
    if (error) throw error;
    return result!;
  }
}
