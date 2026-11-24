import { Bundler, constSet, TopLevel } from "@blazetrails/ruby-compat";
import { Trails } from "@blazetrails/trailties";

import "@blazetrails/trailties/trailties/active-record";
import "@blazetrails/trailties/trailties/action-controller";
import "@blazetrails/trailties/trailties/action-view";
import "@blazetrails/trailties/test-unit/trailtie";
import "@blazetrails/actioncable/engine";
import "@blazetrails/turbo/engine";
import "@blazetrails/stimulus/engine";
import "@blazetrails/activestorage/engine";
import "@blazetrails/actiontext/engine";

await Bundler.require(...Trails.groups());

export const Writebook = constSet(TopLevel, "Writebook", {});

export class Application extends Trails.Application {
  static {
    constSet(Writebook, "Application", this);
    Trails.Application.register(this, import.meta.dirname);

    this.config.loadDefaults("8.0");

    this.config.autoloadLib({ ignore: ["trails-ext", "assets", "tasks"] });

    this.config.timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  }
}

declare module "@blazetrails/trailties" {
  interface ApplicationRegistry {
    application: Application;
  }
}
