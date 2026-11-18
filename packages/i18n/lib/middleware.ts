import { rbProcCall, Thread } from "@blazetrails/ruby-compat";

import { Config } from "./config.js";

export class Middleware {
  private app: unknown;

  constructor(app: unknown) {
    this.app = app;
  }

  async call(env: unknown): Promise<unknown> {
    try {
      return await rbProcCall(this.app, env);
    } finally {
      Thread.current().threadVariableSet(":i18n_config", new Config());
    }
  }
}
