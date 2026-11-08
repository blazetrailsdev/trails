import "./dummy-environment.js";
import "@blazetrails/trailties/all";
import { Engine } from "../engine.js";
import { app } from "./dummy/config/application.js";

for (const initializer of Engine.initializers.tsort()) {
  await initializer.bind(Engine.instance()).run(app);
}
