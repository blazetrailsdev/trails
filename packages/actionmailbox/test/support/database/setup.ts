import { afterAll } from "vitest";
import { Base, DatabaseTasks } from "@blazetrails/activerecord";
import { setEnv } from "@blazetrails/ruby-compat";
import "@blazetrails/actionmailer/test-case";
import "@blazetrails/actionmailer/test-helper";
import "@blazetrails/activejob/test-helper";
import { Trails } from "@blazetrails/trailties";

const configurations = Base.configurations();
const previousEnv = Trails.env;
setEnv("TRAILS_ENV", "test");
Trails.env = "test";

await import("../../dummy/config/environment.js");

DatabaseTasks.root = Trails.root()!;
await DatabaseTasks.purge(Base.configurations().configsFor({ envName: "test", name: "primary" })!);

const { CreateActiveStorageTables } =
  await import("@blazetrails/activestorage/db/migrate/20170806125915_create_active_storage_tables");
const { CreateActionMailboxTables } =
  await import("../../../lib/db/migrate/20180917164000_create_action_mailbox_tables.js");
const { Attachment } = await import("@blazetrails/activestorage/attachment");
const { Blob } = await import("@blazetrails/activestorage/blob");
const { InboundEmail } = await import("../../../lib/inbound-email.js");

await CreateActiveStorageTables.migrate("up");
await CreateActionMailboxTables.migrate("up");
await Blob.loadSchema();
await Attachment.loadSchema();
await InboundEmail.loadSchema();

await import("../mailboxes/application-mailbox.js");
await import("../mailboxes/messages-mailbox.js");

afterAll(async () => {
  Trails.env = previousEnv;
  Base.configurations(configurations);
  await Base.establishConnection(configurations.configsFor({ envName: "arunit", name: "primary" }));
});
