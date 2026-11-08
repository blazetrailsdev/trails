import { rbProcCall } from "@blazetrails/ruby-compat";
import {
  Callbacks as ASCallbacks,
  include,
  type FilterListEntry,
  type Extended,
  type Included,
} from "@blazetrails/activesupport";
import type { RackApp, RackEnv, RackResponse } from "@blazetrails/rack";

export class Callbacks {
  declare static defineCallbacks: Extended<typeof ASCallbacks.ClassMethods>["defineCallbacks"];
  declare static setCallback: Extended<typeof ASCallbacks.ClassMethods>["setCallback"];
  declare runCallbacks: Included<typeof ASCallbacks>["runCallbacks"];

  private app: RackApp | { call: RackApp };

  constructor(app: RackApp | { call: RackApp }) {
    this.app = app;
  }

  static before(...args: FilterListEntry[]): void {
    this.setCallback("call", "before", ...args);
  }

  static after(...args: FilterListEntry[]): void {
    this.setCallback("call", "after", ...args);
  }

  async call(env: RackEnv): Promise<RackResponse> {
    let result: RackResponse | undefined;
    let error: unknown = null;
    await this.runCallbacks("call", async () => {
      try {
        result = await (rbProcCall(this.app, env) as Promise<RackResponse>);
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
