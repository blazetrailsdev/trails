import { afterAll } from "vitest";
import { I18n, TopLevel, runLoadHooks, setTrailsRoot } from "@blazetrails/activesupport";
import { ActiveRecord, Base, DatabaseTasks, Migration, Migrator } from "@blazetrails/activerecord";
import { Application, Trails } from "@blazetrails/trailties";
import { Trailtie as ActiveSupportRailtie } from "@blazetrails/trailties/trailties/active-support";
import { Trailtie as ActiveRecordRailtie } from "@blazetrails/trailties/trailties/active-record";
import { Trailtie as GlobalIDRailtie } from "@blazetrails/trailties/trailties/global-id";
import { File } from "@blazetrails/ruby-compat";
import { FixtureSet } from "@blazetrails/activestorage/fixture-set";
import "./dummy/app/models/message.js";
import "./dummy/app/models/message-without-blanks-with-content-validation.js";
import "./dummy/app/models/encrypted-message.js";
import "./dummy/app/models/page.js";
import "./dummy/app/models/person.js";
import "./dummy/app/models/review.js";

class Dummy extends Application {}
Application.register(Dummy, File.expandPath("dummy", import.meta.dirname));
export const app = Dummy.instance();
Trails.application = app;
app.config.setRoot(File.expandPath("dummy", import.meta.dirname));
app.config.loadDefaults("8.0");
setTrailsRoot(TopLevel.Trails!.root()!);
const configurations = Base.configurations();

for (const railtie of [ActiveSupportRailtie, GlobalIDRailtie, ActiveRecordRailtie]) {
  for (const initializer of railtie.initializers) {
    await initializer.bind(railtie.instance()).run(app);
  }
}
runLoadHooks("after_initialize", app);

DatabaseTasks.root = TopLevel.Trails!.root()!;

await DatabaseTasks.purge(
  Base.configurations().configsFor({
    envName: String(ActiveRecord.ConnectionHandling.DEFAULT_ENV()),
    name: "primary",
  })!,
);

Migrator.migrationsPaths = [File.expandPath("dummy/db/migrate", import.meta.dirname)];
await Base.establishConnection();
await Base.connectionPool().migrationContext.migrate();
await Migration.maintainTestSchemaBang();

I18n.config().enforceAvailableLocales = false;

FixtureSet.fileFixturePath = File.expandPath("fixtures", import.meta.dirname) + "/files";

ActiveRecord.Encryption.configure({
  primaryKey: "test master key",
  deterministicKey: "test deterministic key",
  keyDerivationSalt: "testing key derivation salt",
  supportUnencryptedData: true,
});

afterAll(async () => {
  await Base.establishConnection(configurations.configsFor({ envName: "arunit", name: "primary" }));
  Base.configurations(configurations);
});
