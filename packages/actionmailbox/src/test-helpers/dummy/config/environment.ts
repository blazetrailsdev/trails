import { afterAll } from "vitest";
import { Base as ActiveJobBase } from "@blazetrails/activejob";
import { ActiveRecord, Base, DatabaseTasks } from "@blazetrails/activerecord";
import { NullLogger, TopLevel, runLoadHooks, setTrailsRoot } from "@blazetrails/activesupport";
import { Engine as ActiveStorageEngine } from "@blazetrails/activestorage/engine";
import { Trailtie as ActiveSupportRailtie } from "@blazetrails/trailties/trailties/active-support";
import { Trailtie as ActiveRecordRailtie } from "@blazetrails/trailties/trailties/active-record";
import { Trailtie as GlobalIDRailtie } from "@blazetrails/trailties/trailties/global-id";
import { Trailtie as ActionViewRailtie } from "@blazetrails/trailties/trailties/action-view";
import { Trailtie as ActionControllerRailtie } from "@blazetrails/trailties/trailties/action-controller";
import { Engine } from "../../../engine.js";
import { app } from "./application.js";

ActiveJobBase.setQueueAdapter("test");
setTrailsRoot(TopLevel.Trails!.root()!);
const envName = String(ActiveRecord.ConnectionHandling.DEFAULT_ENV());
const configurations = Base.configurations();

for (const railtie of [
  ActiveSupportRailtie,
  ActiveRecordRailtie,
  GlobalIDRailtie,
  ActionViewRailtie,
  ActionControllerRailtie,
  ActiveStorageEngine,
  Engine,
]) {
  for (const initializer of railtie.initializers) {
    await initializer.bind(railtie.instance()).run(app);
  }
}

DatabaseTasks.root = TopLevel.Trails!.root()!;
await DatabaseTasks.purge(Base.configurations().configsFor({ envName, name: "primary" })!);

await import("./routes.js");
await import("../../../config/routes.js");

runLoadHooks("after_initialize", app);
Base.logger ??= new NullLogger();

afterAll(async () => {
  await Base.establishConnection(configurations.configsFor({ envName: "arunit", name: "primary" }));
  Base.configurations(configurations);
});
