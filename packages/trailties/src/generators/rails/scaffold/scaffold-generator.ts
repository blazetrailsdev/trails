import { ResourceGenerator } from "../resource/resource-generator.js";

export class ScaffoldGenerator extends ResourceGenerator {}

Object.defineProperty(ScaffoldGenerator, "name", { value: "Rails::Generators::ScaffoldGenerator" });
ScaffoldGenerator.removeHookFor("resourceController");
ScaffoldGenerator.removeClassOption("actions");
ScaffoldGenerator.classOption("api", {
  type: "boolean",
  desc: "Generate API-only controller and tests, with no view templates",
});
ScaffoldGenerator.classOption("resourceRoute", { type: "boolean" });
ScaffoldGenerator.hookFor("scaffoldController", { required: true });
