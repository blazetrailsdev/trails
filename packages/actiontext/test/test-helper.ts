import { afterAll } from "vitest";
import "./support/engine.js";
import { I18n, Logger, TopLevel, runLoadHooks, setTrailsRoot } from "@blazetrails/activesupport";
import { ActiveRecord, Base, DatabaseTasks, Migration, Migrator } from "@blazetrails/activerecord";
import { Application, Trails } from "@blazetrails/trailties";
import { Trailtie as ActiveSupportRailtie } from "@blazetrails/trailties/trailties/active-support";
import { Trailtie as ActiveRecordRailtie } from "@blazetrails/trailties/trailties/active-record";
import { Trailtie as GlobalIDRailtie } from "@blazetrails/trailties/trailties/global-id";
import { Trailtie as ActionViewRailtie } from "@blazetrails/trailties/trailties/action-view";
import { Trailtie as ActionControllerRailtie } from "@blazetrails/trailties/trailties/action-controller";
import { ActionController } from "@blazetrails/actionpack";
import { Dir, File } from "@blazetrails/ruby-compat";
import { ActiveStorage, Registry } from "@blazetrails/activestorage";
import { FixtureSet } from "@blazetrails/activestorage/testing/fixture-set";
import { fixtures } from "../../activerecord/test/support/use-fixtures.js";
import { RichText } from "../lib/rich-text.js";
import { richTexts } from "./fixtures/action_text/rich_texts.js";
import { messages } from "./fixtures/messages.js";
import { people } from "./fixtures/people.js";
import { reviews } from "./fixtures/reviews.js";
import { Message } from "./dummy/app/models/message.js";
import "./dummy/app/models/message-without-blanks-with-content-validation.js";
import "./dummy/app/models/encrypted-message.js";
import "./dummy/app/models/page.js";
import { Person } from "./dummy/app/models/person.js";
import { Review } from "./dummy/app/models/review.js";

class Dummy extends Application {}
Application.register(Dummy, File.expandPath("dummy", import.meta.dirname));
export const app = Dummy.instance();
Trails.application = app;
Trails.logger = new Logger(null);
app.config.setRoot(File.expandPath("dummy", import.meta.dirname));
app.config.loadDefaults("8.0");
setTrailsRoot(TopLevel.Trails!.root()!);
const configurations = Base.configurations();

for (const railtie of [
  ActiveSupportRailtie,
  GlobalIDRailtie,
  ActiveRecordRailtie,
  ActionViewRailtie,
  ActionControllerRailtie,
]) {
  for (const initializer of railtie.initializers) {
    await initializer.bind(railtie.instance()).run(app);
  }
}
const routes = app.routes();
routes.clearBang();
routes.disableClearAndFinalize = true;
await import("./dummy/config/routes.js");
await import("@blazetrails/activestorage/config/routes.js");
routes.disableClearAndFinalize = false;
routes.finalizeBang();
app.routes().defineMountedHelper("main_app");
runLoadHooks("after_initialize", app);

const { Engine } = await import("../lib/engine.js");
for (const initializer of Engine.initializers) {
  if (["action_text.helper", "action_text.renderer"].includes(initializer.name)) {
    await initializer.bind(Engine.instance()).run(app);
  }
}
ActionController.Base.prependViewPath([File.expandPath("dummy/app/views", import.meta.dirname)]);
await import("./dummy/app/controllers/messages-controller.js");
await import("./dummy/app/controllers/admin/messages-controller.js");

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
await RichText.loadSchema();

I18n.config().enforceAvailableLocales = false;

FixtureSet.fileFixturePath = File.expandPath("fixtures", import.meta.dirname) + "/files";

ActiveRecord.Encryption.configure({
  primaryKey: "test master key",
  deterministicKey: "test deterministic key",
  keyDerivationSalt: "testing key derivation salt",
  supportUnencryptedData: true,
});

(Trails.configuration as unknown as { activeStorage: unknown }).activeStorage = {
  service: "local",
};
const blob = ActiveStorage.Blob as unknown as { services: Registry; service: unknown };
blob.services = new Registry({ local: { service: "Disk", root: Dir.mktmpdir("action_text") } });
blob.service = blob.services.fetch("local");

afterAll(async () => {
  await Base.establishConnection(configurations.configsFor({ envName: "arunit", name: "primary" }));
  Base.configurations(configurations);
});

export function fixturesAll(): Record<string, unknown> {
  return fixtures({
    messages: [Message, messages],
    people: [Person, people],
    reviews: [Review, reviews],
    action_text_rich_texts: [RichText, richTexts()],
  });
}

export async function createFileBlob({
  filename,
  contentType,
  metadata = null,
}: {
  filename: string;
  contentType: string;
  metadata?: unknown;
}) {
  return await (
    ActiveStorage.Blob as unknown as {
      createAndUploadBang(
        options: object,
      ): Promise<InstanceType<NonNullable<typeof ActiveStorage.Blob>>>;
    }
  ).createAndUploadBang({
    io: new FixtureSet().fileFixture(filename).open(),
    filename: filename,
    contentType: contentType,
    metadata: metadata,
  });
}
