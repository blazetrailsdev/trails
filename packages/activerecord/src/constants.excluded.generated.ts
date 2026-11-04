import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./encryption/encrypted-fixtures.js";
import * as m1 from "./fixture-set/file.js";
import * as m2 from "./fixture-set/model-metadata.js";
import * as m3 from "./fixture-set/render-context.js";
import * as m4 from "./fixture-set/table-row.js";
import * as m5 from "./fixture-set/table-rows.js";
import * as m6 from "./fixtures.js";

defineConstants([
  [() => m0.EncryptedFixtures, "ActiveRecord::Encryption::EncryptedFixtures"],
  [() => m6.Fixture, "ActiveRecord::Fixture"],
  [() => m6.FixtureError, "ActiveRecord::Fixture::FixtureError"],
  [() => m6.FormatError, "ActiveRecord::Fixture::FormatError"],
  [() => m6.FixtureClassNotFound, "ActiveRecord::FixtureClassNotFound"],
  [() => m6.FixtureSet, "ActiveRecord::FixtureSet"],
  [() => m1.File, "ActiveRecord::FixtureSet::File"],
  [() => m2.ModelMetadata, "ActiveRecord::FixtureSet::ModelMetadata"],
  [() => m3.RenderContext, "ActiveRecord::FixtureSet::RenderContext"],
  [() => m4.TableRow, "ActiveRecord::FixtureSet::TableRow"],
  [() => m4.HasManyThroughProxy, "ActiveRecord::FixtureSet::TableRow::HasManyThroughProxy"],
  [() => m4.PrimaryKeyError, "ActiveRecord::FixtureSet::TableRow::PrimaryKeyError"],
  [() => m4.ReflectionProxy, "ActiveRecord::FixtureSet::TableRow::ReflectionProxy"],
  [() => m5.TableRows, "ActiveRecord::FixtureSet::TableRows"],
]);
