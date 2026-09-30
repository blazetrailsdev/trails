import { include } from "@blazetrails/activesupport";
import { NamedBase, type NamedBaseOptions } from "../../named-base.js";
import { ModelHelpers, type ModelHelpersOptions } from "../../model-helpers.js";

export interface ModelGeneratorOptions extends NamedBaseOptions, ModelHelpersOptions {}

export class ModelGenerator extends NamedBase {}

Object.defineProperty(ModelGenerator, "name", { value: "Rails::Generators::ModelGenerator" });
include(ModelGenerator, ModelHelpers);
ModelGenerator.hookFor("orm", { required: true, desc: "ORM to be invoked" });
