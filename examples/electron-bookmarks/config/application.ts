import "./boot.ts";

import { Bundler, constSet, TopLevel } from "@blazetrails/ruby-compat";
import { Trails } from "@blazetrails/trailties";

import "@blazetrails/trailties/trailties/active-record";
import "@blazetrails/trailties/trailties/action-controller";
import "@blazetrails/trailties/trailties/action-view";
import "@blazetrails/trailties/test-unit/trailtie";
import "@blazetrails/actioncable/engine";
import "@blazetrails/turbo/engine";

await Bundler.require(...Trails.groups());

export const ReadingList = constSet(TopLevel, "ReadingList", {});

export class Application extends Trails.Application {
  static {
    constSet(ReadingList, "Application", this);
    Trails.Application.register(this, import.meta.dirname);

    this.config.loadDefaults("8.0");

    this.config.autoloadLib({ ignore: ["assets", "tasks"] });

    this.config.timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  }
}

declare module "@blazetrails/trailties" {
  interface ApplicationRegistry {
    application: Application;
  }
}
