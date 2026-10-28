import { NamedBase } from "../../named-base.js";

export class MigrationGenerator extends NamedBase {
  static isExitOnFailure(): boolean {
    return true;
  }
}

Object.defineProperty(MigrationGenerator, "name", {
  value: "Rails::Generators::MigrationGenerator",
});
MigrationGenerator.argument("attributes", {
  type: "array",
  default: [],
  banner: "field[:type][:index] field[:type][:index]",
});
MigrationGenerator.hookFor("orm", { required: true, desc: "ORM to be invoked" });
