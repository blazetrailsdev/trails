import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./generators/migration.js";

defineConstants([
  [() => m0.Migration, "Trails::Generators::Migration"],
  [() => m0.ClassMethods, "Trails::Generators::Migration::ClassMethods"],
]);
