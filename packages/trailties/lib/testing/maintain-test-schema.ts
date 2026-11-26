import { Base, Migration } from "@blazetrails/activerecord";
import { PendingMigrationError } from "@blazetrails/activerecord/migration";
import { stdout } from "@blazetrails/ruby-compat";
import { exit } from "@blazetrails/ruby-compat/process-adapter";
import { Trails } from "../trails.js";

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
