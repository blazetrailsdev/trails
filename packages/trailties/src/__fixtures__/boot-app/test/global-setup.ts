import { env, setEnv } from "@blazetrails/ruby-compat";

export async function setup(): Promise<void> {
  if (env.TRAILS_ENV == null) setEnv("TRAILS_ENV", "test");
  await import("../config/environment.js");
  await import("../../../testing/maintain-test-schema.js");
}
