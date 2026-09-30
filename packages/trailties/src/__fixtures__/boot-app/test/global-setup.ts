import { Base } from "@blazetrails/activerecord";
import { env, setEnv } from "@blazetrails/ruby-compat";

export async function setup(): Promise<void> {
  if (env.TRAILS_ENV == null) setEnv("TRAILS_ENV", "test");
  await import("../config/environment.js");
  await import("../../../testing/maintain-test-schema.js");
}

export async function teardown(): Promise<void> {
  await Base.connectionHandler.clearAllConnectionsBang("all");
}
