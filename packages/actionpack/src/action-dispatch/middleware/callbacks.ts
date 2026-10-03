import {
  Callbacks as ASCallbacks,
  include,
  type BeforeCallback,
  type AfterCallback,
  type Extended,
  type Included,
} from "@blazetrails/activesupport";
import type { RackApp, RackEnv, RackResponse } from "@blazetrails/rack";

export class Callbacks {
  declare static defineCallbacks: Extended<typeof ASCallbacks.ClassMethods>["defineCallbacks"];
  declare static setCallback: Extended<typeof ASCallbacks.ClassMethods>["setCallback"];
  declare static resetCallbacks: Extended<typeof ASCallbacks.ClassMethods>["resetCallbacks"];
  declare runCallbacks: Included<typeof ASCallbacks>["runCallbacks"];

  private app: RackApp;

  constructor(app: RackApp) {
    this.app = app;
  }

  static before(args: BeforeCallback): void {
    this.setCallback("call", "before", args);
  }

  static after(args: AfterCallback): void {
    this.setCallback("call", "after", args);
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

include(Callbacks, ASCallbacks);

Callbacks.defineCallbacks("call");
