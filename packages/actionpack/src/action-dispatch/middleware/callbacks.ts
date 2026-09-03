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

  static before(args: BeforeCallback): void {
    this.beforeCallback("call", args);
  }

  static after(args: AfterCallback): void {
    this.afterCallback("call", args);
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
