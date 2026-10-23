import "@blazetrails/trailties/all";
import { Executor } from "@blazetrails/activesupport";
import { Engine } from "../engine.js";

const app = { executor: class extends Executor {} };
for (const initializer of Engine.initializers.tsort()) {
  await initializer.bind(Engine.instance()).run(app);
}
