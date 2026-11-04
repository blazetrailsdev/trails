import { afterAll } from "vitest";
import { Base as ActiveJobBase } from "@blazetrails/activejob";
import {
  runLoadHooks,
  EnvironmentInquirer,
  getEnv,
  NullLogger,
  TopLevel,
} from "@blazetrails/activesupport";
import { GlobalID } from "@blazetrails/globalid";
import { Configuration } from "@blazetrails/trailties/trailtie/configuration";
import { ActiveRecord, Base, DatabaseTasks, HashConfig } from "@blazetrails/activerecord";
import { Application } from "@blazetrails/trailties";
import { Trailtie as ActiveSupportRailtie } from "@blazetrails/trailties/trailties/active-support";
import { Trailtie as ActiveRecordRailtie } from "@blazetrails/trailties/trailties/active-record";
import { Trailtie as GlobalIDRailtie } from "@blazetrails/trailties/trailties/global-id";
import { Trailtie as ActionViewRailtie } from "@blazetrails/trailties/trailties/action-view";
import { Trailtie as ActionControllerRailtie } from "@blazetrails/trailties/trailties/action-controller";
import { File, Dir } from "@blazetrails/ruby-compat";
import "../../constants.generated.js";
import { ImageMagick } from "../../analyzer/image-analyzer/image-magick.js";
import { Vips } from "../../analyzer/image-analyzer/vips.js";
import { VideoAnalyzer } from "../../analyzer/video-analyzer.js";
import { AudioAnalyzer } from "../../analyzer/audio-analyzer.js";
import { MuPDFPreviewer } from "../../previewer/mupdf-previewer.js";
import { PopplerPDFPreviewer } from "../../previewer/poppler-pdf-previewer.js";
import { VideoPreviewer } from "../../previewer/video-previewer.js";
import { Attachment } from "../../attachment.js";
import { ActiveStorage } from "../../active-storage.js";
import { Blob } from "../../blob.js";
import { Engine } from "../../engine.js";
import "../../service/configurator.js";
import { ActiveStorageCreateUsers } from "./create-users-migration.js";
import { ActiveStorageCreateGroups } from "./create-groups-migration.js";

ActiveStorage.logger = new NullLogger();
ActiveJobBase.setQueueAdapter("test");
ActiveStorage.analyzers = [Vips, ImageMagick, VideoAnalyzer, AudioAnalyzer];
ActiveStorage.previewers = [PopplerPDFPreviewer, MuPDFPreviewer, VideoPreviewer];

const envName = String(ActiveRecord.ConnectionHandling.DEFAULT_ENV());

const configuration = new Configuration();
TopLevel.Trails = {
  ...TopLevel.Trails,
  env: TopLevel.Trails?.env ?? new EnvironmentInquirer(envName),
  root: () => File.expandPath("..", import.meta.dirname),
  application: {
    routes: () => app.routes(),
    envConfig: () => ({}),
    get executor() {
      return app.executor;
    },
  },
  configuration: {
    generators: configuration.appGenerators.bind(configuration),
    activeStorage: {
      service: "local",
      serviceConfigurations: {
        local: { service: "Disk", root: File.join(Dir.tmpdir(), "active_storage_blobs") },
        local_public: {
          service: "Disk",
          root: File.join(Dir.tmpdir(), "active_storage_public_blobs"),
          public: true,
        },
        disk_mirror_1: { service: "Disk", root: Dir.mktmpdir("active_storage_tests_1") },
        disk_mirror_2: { service: "Disk", root: Dir.mktmpdir("active_storage_tests_2") },
        disk_mirror_3: { service: "Disk", root: Dir.mktmpdir("active_storage_tests_3") },
        mirror: {
          service: "Mirror",
          primary: "local",
          mirrors: ["disk_mirror_1", "disk_mirror_2", "disk_mirror_3"],
        },
      },
    },
  },
} as unknown as typeof TopLevel.Trails;

class Dummy extends Application {}
Application.register(Dummy, import.meta.dirname);
export const app = Dummy.instance();
app.config.loadDefaults("8.0");
for (const railtie of [
  ActiveSupportRailtie,
  GlobalIDRailtie,
  ActionViewRailtie,
  ActionControllerRailtie,
  Engine,
]) {
  for (const initializer of railtie.initializers) {
    await initializer.bind(railtie.instance()).run(app);
  }
}

for (const initializer of ActiveRecordRailtie.initializers) {
  if (initializer.name !== "active_record.set_executor_hooks") continue;
  await initializer.bind(ActiveRecordRailtie.instance()).run(app);
}

await import("../../config/routes.js");

runLoadHooks("after_initialize", app);
ActiveStorage.logger = new NullLogger();
ActiveStorage.trackVariants = true;

GlobalID.setApp("ActiveStorageExampleApp");

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
