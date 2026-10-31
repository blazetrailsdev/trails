import { afterAll } from "vitest";
import { EnvironmentInquirer, getEnv, TopLevel } from "@blazetrails/activesupport";
import { GlobalID } from "@blazetrails/globalid";
import { Configuration } from "@blazetrails/trailties/trailtie/configuration";
import { RouteSet } from "@blazetrails/actionpack";
import { ActiveRecord, Base, DatabaseTasks, HashConfig } from "@blazetrails/activerecord";
import { Application } from "@blazetrails/trailties";
import { Trailtie as GlobalIDRailtie } from "@blazetrails/trailties/trailties/global-id";
import { File, Dir } from "@blazetrails/ruby-compat";
import "../../class-paths.generated.js";
import { Attachment } from "../../attachment.js";
import { ActiveStorage } from "../../active-storage.js";
import { Blob } from "../../blob.js";
import { Engine } from "../../engine.js";
import { Registry } from "../../service/registry.js";
import "../../service/configurator.js";
import { ActiveStorageCreateUsers } from "./create-users-migration.js";
import { ActiveStorageCreateGroups } from "./create-groups-migration.js";

const envName = String(ActiveRecord.ConnectionHandling.DEFAULT_ENV());

const routes = new RouteSet();
routes.draw(function () {
  this.scope("/rails/active_storage", function () {
    this.get("/disk/:encoded_key/*filename", {
      to: "active_storage/disk#show",
      as: "rails_disk_service",
    });
  });
});

const configuration = new Configuration();
TopLevel.Trails = {
  ...TopLevel.Trails,
  env: TopLevel.Trails?.env ?? new EnvironmentInquirer(envName),
  application: { routes: () => routes },
  configuration: {
    generators: configuration.appGenerators.bind(configuration),
    activeStorage: { service: "local" },
  },
} as unknown as typeof TopLevel.Trails;

class Dummy extends Application {}
Application.register(Dummy, import.meta.dirname);
const app = Dummy.instance();
for (const railtie of [GlobalIDRailtie, Engine]) {
  for (const initializer of railtie.initializers) {
    await initializer.bind(railtie.instance()).run(app);
  }
}

ActiveStorage.trackVariants = true;
ActiveStorage.contentTypesToServeAsBinary = [
  "text/html",
  "image/svg+xml",
  "application/postscript",
  "application/x-shockwave-flash",
  "text/xml",
  "application/xml",
  "application/xhtml+xml",
  "application/mathml+xml",
  "text/cache-manifest",
];
ActiveStorage.contentTypesAllowedInline = [
  "image/webp",
  "image/avif",
  "image/png",
  "image/gif",
  "image/jpeg",
  "image/tiff",
  "image/bmp",
  "image/vnd.adobe.photoshop",
  "image/vnd.microsoft.icon",
  "application/pdf",
];

GlobalID.setApp("ActiveStorageExampleApp");

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
