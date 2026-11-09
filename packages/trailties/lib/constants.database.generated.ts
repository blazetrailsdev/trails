import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./generators/database.js";

defineConstants([
  [() => m0.Database, "Trails::Generators::Database"],
  [() => m0.MariaDBMySQL2, "Trails::Generators::Database::MariaDBMySQL2"],
  [() => m0.MySQL2, "Trails::Generators::Database::MySQL2"],
  [() => m0.PostgreSQL, "Trails::Generators::Database::PostgreSQL"],
  [() => m0.SQLite3, "Trails::Generators::Database::SQLite3"],
]);
