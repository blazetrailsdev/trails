import { EnvironmentInquirer, TopLevel } from "@blazetrails/activesupport";
import { ActiveRecord } from "@blazetrails/activerecord";
import { Application } from "@blazetrails/trailties";
import { Configuration } from "@blazetrails/trailties/trailtie/configuration";
import { Dir, File } from "@blazetrails/ruby-compat";

const configuration = new Configuration();
TopLevel.Trails = {
  ...TopLevel.Trails,
  env:
    TopLevel.Trails?.env ??
    new EnvironmentInquirer(String(ActiveRecord.ConnectionHandling.DEFAULT_ENV())),
  root: () => File.expandPath("..", import.meta.dirname),
  application: {
    routes: () => app.routes(),
    envConfig: () => ({}),
    credentials: () => app.credentials(),
    get executor() {
      return app.executor;
    },
  },
  configuration: {
    generators: configuration.appGenerators.bind(configuration),
    activeStorage: {
      service: "test",
      serviceConfigurations: {
        test: { service: "Disk", root: File.join(Dir.tmpdir(), "actionmailbox_storage") },
        local: { service: "Disk", root: File.join(Dir.tmpdir(), "actionmailbox_storage_local") },
        test_email: { service: "Disk", root: File.join(Dir.tmpdir(), "storage_email") },
      },
    },
  },
} as unknown as typeof TopLevel.Trails;

export class Dummy extends Application {
  static {
    Application.register(this, import.meta.dirname);
  }
}

export const app = Dummy.instance();
app.config.loadDefaults("8.0");
app.config.actionController.includeAllHelpers = false;
app.config.activeRecord.tableNamePrefix = "prefix_";
app.config.activeRecord.tableNameSuffix = "_suffix";
