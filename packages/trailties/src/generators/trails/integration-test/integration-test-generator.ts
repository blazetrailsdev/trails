import { NamedBase } from "../../named-base.js";

export class IntegrationTestGenerator extends NamedBase {}

Object.defineProperty(IntegrationTestGenerator, "name", {
  value: "Trails::Generators::IntegrationTestGenerator",
});
IntegrationTestGenerator.hookFor("integrationTool", { as: "integration" });
