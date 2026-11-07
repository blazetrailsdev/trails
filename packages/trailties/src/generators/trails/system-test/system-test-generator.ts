import { NamedBase } from "../../named-base.js";

export class SystemTestGenerator extends NamedBase {}

Object.defineProperty(SystemTestGenerator, "name", {
  value: "Trails::Generators::SystemTestGenerator",
});
SystemTestGenerator.hookFor("systemTests", { as: "system" });
