import { GeneratorBase } from "../../base.js";

type DescHost = { desc(description?: string | null): Promise<string | null> };

/** @noRailsEquivalent CONVERGEABLE generator-classes-pair-in-constant-residue */
export class ApplicationRecordGenerator extends GeneratorBase {
  static override async desc(description: string | null = null): Promise<string | null> {
    return await (this as unknown as { ormGenerator(): DescHost }).ormGenerator().desc(description);
  }
}

Object.defineProperty(ApplicationRecordGenerator, "name", {
  value: "Trails::Generators::ApplicationRecordGenerator",
});
ApplicationRecordGenerator.hookFor("orm", { required: true, desc: "ORM to be invoked" });
