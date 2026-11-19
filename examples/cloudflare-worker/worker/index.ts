import { Base } from "@blazetrails/activerecord";
import "@blazetrails/activerecord/connection-adapters/postgresql-adapter.js";
import { setEnv } from "@blazetrails/ruby-compat";
import { Trails } from "@blazetrails/trailties";
import { requestToRackEnvWithBody, rackResponseToFetchResponse } from "./rack-bridge.ts";

interface Env {
  HYPERDRIVE: { connectionString: string };
}

let booted: Promise<typeof Trails.application> | undefined;
// Reading a Hyperdrive binding is I/O, which workerd refuses at module scope.
function boot(env: Env) {
  return (booted ??= (async () => {
    setEnv("DATABASE_URL", env.HYPERDRIVE.connectionString);
    await import("../.trails/entry.generated.js");
    return Trails.application;
  })());
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const app = await boot(env);
    try {
      return rackResponseToFetchResponse(await app.call(await requestToRackEnvWithBody(request)));
    } finally {
      // A socket opened during one request cannot be used by another, so no connection outlives
      // its request. Hyperdrive pools the connections to Postgres.
      await Base.connectionHandler.clearAllConnectionsBang();
    }
  },
};
