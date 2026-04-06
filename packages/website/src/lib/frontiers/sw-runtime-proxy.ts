/**
 * Proxy for runtime-level operations (CLI, persistence) via the service worker.
 * Separated from SwAdapterProxy which handles DB introspection only.
 */

import type { CliResult } from "./trail-cli.js";
import type { SwClient } from "./sw-client.js";

export class SwRuntimeProxy {
  constructor(private client: SwClient) {}

  async exec(command: string): Promise<CliResult> {
    const resp = await this.client.send({ type: "exec", command });
    return resp.result;
  }

  async exportDB(): Promise<Uint8Array> {
    const resp = await this.client.send({ type: "db:export" });
    return resp.data;
  }

  async importDB(data: Uint8Array): Promise<void> {
    await this.client.send({ type: "db:import", data });
  }
}
