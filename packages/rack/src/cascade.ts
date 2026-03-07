import { CONTENT_TYPE } from "./constants.js";
import type { RackApp } from "./mock-request.js";

export class Cascade {
  apps: RackApp[];
  private cascadeFor: Record<number, boolean>;

  constructor(apps: RackApp[], cascadeFor: number[] = [404, 405]) {
    this.apps = [...apps];
    this.cascadeFor = {};
    for (const s of cascadeFor) this.cascadeFor[s] = true;
  }

  async call(env: Record<string, any>): Promise<[number, Record<string, string>, any]> {
    if (this.apps.length === 0) {
      return [404, { [CONTENT_TYPE]: "text/plain" }, []];
    }
    let result: any = null;
    let lastBody: any = null;

    for (const app of this.apps) {
      if (lastBody && typeof lastBody.close === "function") lastBody.close();
      result = await app(env);
      if (!this.cascadeFor[result[0]]) return result;
      lastBody = result[2];
    }
    return result;
  }

  add(app: RackApp): void {
    this.apps.push(app);
  }

  includeApp(app: RackApp): boolean {
    return this.apps.includes(app);
  }
}
