import type { RackHeaders } from "./index.js";
import { hasKey, rbFSend } from "@blazetrails/ruby-compat";
import { CONTENT_TYPE } from "./constants.js";
import type { RackApp } from "./mock-request.js";

export class Cascade {
  apps: (RackApp | { call: RackApp })[];
  private cascadeFor: Record<number, boolean>;

  constructor(apps: (RackApp | { call: RackApp })[], cascadeFor: number[] = [404, 405]) {
    this.apps = [];
    apps.forEach((app) => this.add(app));

    this.cascadeFor = {};
    for (const s of cascadeFor) this.cascadeFor[s] = true;
  }

  async call(env: Record<string, any>): Promise<[number, RackHeaders, any]> {
    if (this.apps.length === 0) {
      return [404, { [CONTENT_TYPE]: "text/plain" }, []];
    }
    let result: any = null;
    let lastBody: any = null;

    for (const app of this.apps) {
      if (lastBody && typeof lastBody.close === "function") lastBody.close();
      result = await rbFSend(app, "call", env);
      if (!hasKey(this.cascadeFor, Number(result[0]))) return result;
      lastBody = result[2];
    }
    return result;
  }

  add(app: RackApp | { call: RackApp }): void {
    this.apps.push(app);
  }

  isInclude(app: RackApp | { call: RackApp }): boolean {
    return this.apps.includes(app);
  }
}
