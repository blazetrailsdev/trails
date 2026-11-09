import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./generators/active-record/migration.js";

defineConstants([
  [() => m0.Migration, "ActiveRecord::Generators::Migration"],
  [() => m0.ClassMethods, "ActiveRecord::Generators::Migration::ClassMethods"],
]);
