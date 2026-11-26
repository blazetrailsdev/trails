import { afterAll } from "vitest";
import { Base } from "@blazetrails/activerecord";
import { DatabaseTasks } from "@blazetrails/activerecord/tasks/database-tasks.js";
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

DatabaseTasks.root = Trails.root()!.toString();
await DatabaseTasks.purge(Base.configurations().configsFor({ envName: "test", name: "primary" })!);

const { CreateActiveStorageTables } =
  await import("@blazetrails/activestorage/db/migrate/20170806125915_create_active_storage_tables");
const { CreateActionMailboxTables } =
  await import("../../../lib/db/migrate/20180917164000_create_action_mailbox_tables.js");
const { Attachment } =
  await import("@blazetrails/activestorage/app/models/active-storage/attachment");
const { Blob } = await import("@blazetrails/activestorage/app/models/active-storage/blob");
const { InboundEmail } = await import("../../../lib/app/models/action-mailbox/inbound-email.js");

await CreateActiveStorageTables.migrate("up");
await CreateActionMailboxTables.migrate("up");
await Blob.loadSchema();
await Attachment.loadSchema();
await InboundEmail.loadSchema();

await import("../../dummy/app/mailboxes/application-mailbox.js");
await import("../../dummy/app/mailboxes/messages-mailbox.js");

afterAll(async () => {
  Trails.env = previousEnv;
  Base.configurations(configurations);
  await Base.establishConnection(configurations.configsFor({ envName: "arunit", name: "primary" }));
});
