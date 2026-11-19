import "./dummy-environment.js";
import "@blazetrails/trailties/all";
import { Trailtie as ActiveJobTrailtie } from "@blazetrails/trailties/trailties/active-job";
import "../../lib/active-job/queue-adapters/solid-queue-adapter.js";
import { Engine } from "../../lib/engine.js";
import { app } from "./dummy/config/application.js";

for (const railtie of [ActiveJobTrailtie, Engine]) {
  for (const initializer of railtie.initializers.tsort()) {
    await initializer.bind(railtie.instance()).run(app);
  }
}
