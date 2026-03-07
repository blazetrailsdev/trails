import type { RackApp } from "./mock-request.js";

export class Config {
  private app: RackApp;
  private block: (env: Record<string, any>) => void;

  constructor(app: RackApp, block: (env: Record<string, any>) => void) {
    this.app = app;
    this.block = block;
  }

  async call(env: Record<string, any>): Promise<[number, Record<string, string>, any]> {
    this.block(env);
    return this.app(env);
  }
}
