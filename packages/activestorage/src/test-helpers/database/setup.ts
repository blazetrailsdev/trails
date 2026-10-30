import { afterAll } from "vitest";
import { EnvironmentInquirer, getEnv, onLoad, TopLevel } from "@blazetrails/activesupport";
import { GlobalID, Identification } from "@blazetrails/globalid";
import { Configuration } from "@blazetrails/trailties/trailtie/configuration";
import { ActiveRecord, Base, DatabaseTasks, HashConfig } from "@blazetrails/activerecord";
import { Engine } from "@blazetrails/trailties/engine";
import { File, Dir, include } from "@blazetrails/ruby-compat";
import "../../class-paths.generated.js";
import { ActiveStorage } from "../../active-storage.js";
import { Model } from "../../attached/model.js";
import { Attachment } from "../../attachment.js";
import { ActiveRecordExtensions } from "../../reflection.js";
import { Blob } from "../../blob.js";
import { Registry } from "../../service/registry.js";
import "../../service/configurator.js";
import { ActiveStorageCreateUsers } from "./create-users-migration.js";
import { ActiveStorageCreateGroups } from "./create-groups-migration.js";

const envName = String(ActiveRecord.ConnectionHandling.DEFAULT_ENV());

const configuration = new Configuration();
TopLevel.Trails = {
  ...TopLevel.Trails,
  env: TopLevel.Trails?.env ?? new EnvironmentInquirer(envName),
  configuration: {
    generators: configuration.appGenerators.bind(configuration),
    activeStorage: { service: "local" },
  },
} as unknown as typeof TopLevel.Trails;

class ActiveStorageEngine extends Engine {
  static {
    Engine.register(this, import.meta.dirname);
    this.isolateNamespace(ActiveStorage as never);
  }
}
void ActiveStorageEngine;

GlobalID.setApp("ActiveStorageExampleApp");

onLoad("active_record", function (this: typeof Base) {
  include(this, Model);
  include(this, ActiveRecordExtensions);
  include(this, Identification);
});

Blob.services = new Registry({
  local: { service: "Disk", root: File.join(Dir.tmpdir(), "active_storage_blobs") },
});
Blob.service = Blob.services.fetch("local");

const configurations = Base.configurations();
const arunit = configurations.configsFor({ envName: "arunit", name: "primary" })!;

function databaseName(): string {
  const database = String(arunit.database);
  if (database === ":memory:") {
    const worker = getEnv("VITEST_POOL_ID") ?? "1";
    return `${import.meta.dirname}/../../../tmp/test_activestorage_${worker}.sqlite3`;
  }
  const dot = database.lastIndexOf(".");
  if (arunit.adapter !== "sqlite3" || dot < database.lastIndexOf("/")) {
    return `${database}_activestorage`;
  }
  return `${database.slice(0, dot)}_activestorage${database.slice(dot)}`;
}

const dummy = {
  ...arunit.configurationHash,
  database: databaseName(),
  migrationsPaths: `${import.meta.dirname}/../../db/migrate`,
};
const primary = new HashConfig(envName, "activestorage_primary", dummy);
const replica = new HashConfig(envName, "activestorage_replica", { ...dummy, replica: true });
Base.configurations([...configurations.configurations, primary, replica]);
DatabaseTasks.root = import.meta.dirname;
await DatabaseTasks.purge(primary);

await Base.connectsTo({
  database: { writing: ":activestorage_primary", reading: ":activestorage_replica" },
});
await Base.connectionPool().migrationContext.migrate();
await ActiveStorageCreateUsers.migrate("up");
await ActiveStorageCreateGroups.migrate("up");
await Blob.loadSchema();
await Attachment.loadSchema();

afterAll(async () => {
  await Base.establishConnection(arunit);
  Base.configurations(configurations);
});
