import { afterAll } from "vitest";
import { Base as ActiveJobBase } from "@blazetrails/activejob";
import {
  runLoadHooks,
  setTrailsRoot,
  EnvironmentInquirer,
  NullLogger,
  TopLevel,
} from "@blazetrails/activesupport";
import { GlobalID } from "@blazetrails/globalid";
import { Configuration } from "@blazetrails/trailties/trailtie/configuration";
import { ActiveRecord, Base, DatabaseTasks } from "@blazetrails/activerecord";
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
setTrailsRoot(TopLevel.Trails!.root);
const configurations = Base.configurations();

for (const railtie of [
  ActiveSupportRailtie,
  ActiveRecordRailtie,
  GlobalIDRailtie,
  ActionViewRailtie,
  ActionControllerRailtie,
  Engine,
]) {
  for (const initializer of railtie.initializers) {
    await initializer.bind(railtie.instance()).run(app);
  }
}

DatabaseTasks.root = TopLevel.Trails!.root();
await DatabaseTasks.purge(Base.configurations().configsFor({ envName, name: "primary" })!);

await import("../../config/routes.js");

runLoadHooks("after_initialize", app);
ActiveStorage.logger = new NullLogger();
ActiveStorage.trackVariants = true;

GlobalID.setApp("ActiveStorageExampleApp");

await Base.connectsTo({
  database: { writing: ":primary", reading: ":replica" },
});
await Base.connectionPool().migrationContext.migrate();
await ActiveStorageCreateUsers.migrate("up");
await ActiveStorageCreateGroups.migrate("up");
await Blob.loadSchema();
await Attachment.loadSchema();

afterAll(async () => {
  await Base.establishConnection(configurations.configsFor({ envName: "arunit", name: "primary" }));
  Base.configurations(configurations);
});
