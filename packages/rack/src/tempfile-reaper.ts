import { RACK_TEMPFILES } from "./constants.js";
import type { RackApp } from "./mock-request.js";

export class TempfileReaper {
  private app: RackApp;

  constructor(app: RackApp) {
    this.app = app;
  }

  async call(env: Record<string, any>): Promise<[number, Record<string, string>, any]> {
    env[RACK_TEMPFILES] = env[RACK_TEMPFILES] || [];

    // If rack.response_finished is available, register cleanup callback
    if (Array.isArray(env["rack.response_finished"])) {
      env["rack.response_finished"].push((cbEnv: Record<string, any>) => {
        this.closeTempfiles(cbEnv);
      });
    }

    let response: [number, Record<string, string>, any];
    try {
      response = await this.app(env);
    } catch (e) {
      this.closeTempfiles(env);
      throw e;
    }

    const [status, headers, body] = response;

    // Wrap body to clean up tempfiles on close
    const self = this;
    const wrappedBody = {
      [Symbol.iterator]: body[Symbol.iterator]?.bind(body),
      each: body.each?.bind(body),
      close() {
        if (body && typeof body.close === "function") body.close();
        self.closeTempfiles(env);
      },
      forEach: body.forEach?.bind(body),
      map: body.map?.bind(body),
    };

    // For arrays, copy array-like behavior
    if (Array.isArray(body)) {
      Object.defineProperty(wrappedBody, "length", { get: () => body.length });
      for (let i = 0; i < body.length; i++) {
        (wrappedBody as any)[i] = body[i];
      }
    }

    return [status, headers, wrappedBody];
  }

  private closeTempfiles(env: Record<string, any>): void {
    const tempfiles = env[RACK_TEMPFILES];
    if (!Array.isArray(tempfiles)) return;
    for (const tf of tempfiles) {
      if (typeof tf.close === "function") tf.close();
      // Ruby uses close! (bang), mapped here
      if (typeof tf["close!"] === "function") tf["close!"]();
    }
  }
}
