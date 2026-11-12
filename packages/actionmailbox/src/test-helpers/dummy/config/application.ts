import { Application } from "@blazetrails/trailties";
import "@blazetrails/trailties/all";

export class Dummy extends Application {
  static {
    Application.register(this, import.meta.dirname);

    this.config.loadDefaults("8.0");

    this.config.actionController.includeAllHelpers = false;
    this.config.activeRecord.tableNamePrefix = "prefix_";
    this.config.activeRecord.tableNameSuffix = "_suffix";
  }
}
