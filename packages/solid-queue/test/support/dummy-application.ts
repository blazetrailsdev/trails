import { rbForkPayload, setEnv } from "@blazetrails/ruby-compat";

setEnv("TRAILS_ENV", "test");

if (rbForkPayload() == null) {
  await import("./dummy-environment.js");
  await import("@blazetrails/trailties/all");
  const { Trailtie: ActiveJobTrailtie } =
    await import("@blazetrails/trailties/trailties/active-job");
  await import("../../lib/active-job/queue-adapters/solid-queue-adapter.js");
  const { Engine } = await import("../../lib/engine.js");
  const { app } = await import("./dummy/config/application.js");

  for (const railtie of [ActiveJobTrailtie, Engine]) {
    for (const initializer of railtie.initializers.tsort()) {
      await initializer.bind(railtie.instance()).run(app);
    }
  }
}
