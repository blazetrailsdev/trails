import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./fixture-set/file.js";
import * as m1 from "./fixture-set/model-metadata.js";
import * as m2 from "./fixture-set/render-context.js";
import * as m3 from "./fixture-set/table-row.js";
import * as m4 from "./fixture-set/table-rows.js";
import * as m5 from "./fixtures.js";

defineConstants([
  [() => m5.Fixture, "ActiveRecord::Fixture"],
  [() => m5.FixtureError, "ActiveRecord::Fixture::FixtureError"],
  [() => m5.FormatError, "ActiveRecord::Fixture::FormatError"],
  [() => m5.FixtureClassNotFound, "ActiveRecord::FixtureClassNotFound"],
  [() => m5.FixtureSet, "ActiveRecord::FixtureSet"],
  [() => m0.File, "ActiveRecord::FixtureSet::File"],
  [() => m1.ModelMetadata, "ActiveRecord::FixtureSet::ModelMetadata"],
  [() => m2.RenderContext, "ActiveRecord::FixtureSet::RenderContext"],
  [() => m3.TableRow, "ActiveRecord::FixtureSet::TableRow"],
  [() => m3.HasManyThroughProxy, "ActiveRecord::FixtureSet::TableRow::HasManyThroughProxy"],
  [() => m3.PrimaryKeyError, "ActiveRecord::FixtureSet::TableRow::PrimaryKeyError"],
  [() => m3.ReflectionProxy, "ActiveRecord::FixtureSet::TableRow::ReflectionProxy"],
  [() => m4.TableRows, "ActiveRecord::FixtureSet::TableRows"],
]);
