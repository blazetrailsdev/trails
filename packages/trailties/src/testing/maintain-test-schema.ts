import { Base, Migration } from "@blazetrails/activerecord";
import { PendingMigrationError } from "@blazetrails/activerecord/migration";
import { exit, stdout } from "@blazetrails/ruby-compat";
import { Trails } from "../rails.js";

try {
  await Migration.maintainTestSchemaBang();
} catch (e) {
  if (!(e instanceof PendingMigrationError)) throw e;
  stdout.write(`${e.toString().trim()}\n`);
  exit(1);
}

if (Trails.configuration!.eagerLoad) {
  for (const model of Base.descendants) {
    if (!model.abstractClass && (await model.tableExists())) await model.loadSchema();
  }
}
