import { afterAll } from "vitest";
import { I18n, Logger, TopLevel, setTrailsRoot } from "@blazetrails/activesupport";
import { ActiveRecord, Base, DatabaseTasks, Migration, Migrator } from "@blazetrails/activerecord";
import { Trails } from "@blazetrails/trailties";
import { ActionController } from "@blazetrails/actionpack";
import { Base as ActionMailerBase } from "@blazetrails/actionmailer";
import { File } from "@blazetrails/ruby-compat";
import { ActiveStorage } from "@blazetrails/activestorage";
import { FixtureSet } from "@blazetrails/activestorage/testing/fixture-set";
import { fixtures } from "../../activerecord/test/support/use-fixtures.js";
import { richTexts } from "./fixtures/action_text/rich_texts.js";
import { messages } from "./fixtures/messages.js";
import { people } from "./fixtures/people.js";
import { reviews } from "./fixtures/reviews.js";

const configurations = Base.configurations();
Trails.env = "test";
await import("./dummy/config/environment.js");
export const app = Trails.application!;
await import("./support/engine.js");
const { RichText } = await import("../lib/rich-text.js");
const { Message } = await import("./dummy/app/models/message.js");
await import("./dummy/app/models/message-without-blanks-with-content-validation.js");
await import("./dummy/app/models/encrypted-message.js");
await import("./dummy/app/models/page.js");
const { Person } = await import("./dummy/app/models/person.js");
const { Review } = await import("./dummy/app/models/review.js");
Trails.logger = new Logger(null);
setTrailsRoot(TopLevel.Trails!.root()!.toString());
ActionController.Base.prependViewPath([File.expandPath("dummy/app/views", import.meta.dirname)]);
ActionMailerBase.prependViewPath([File.expandPath("dummy/app/views", import.meta.dirname)]);
await import("./dummy/app/controllers/messages-controller.js");
await import("./dummy/app/controllers/admin/messages-controller.js");

DatabaseTasks.root = TopLevel.Trails!.root()!.toString();

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
