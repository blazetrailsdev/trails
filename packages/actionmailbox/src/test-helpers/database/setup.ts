import "@blazetrails/activestorage/test-helpers/database/setup";
import "../../constants.generated.js";
import "../../engine.js";
import { Base } from "@blazetrails/activerecord";
import { NullLogger, TopLevel } from "@blazetrails/activesupport";
import { Dir, File } from "@blazetrails/ruby-compat";
import { InboundEmail } from "../../inbound-email.js";
import { CreateActionMailboxTables } from "../../db/migrate/20180917164000_create_action_mailbox_tables.js";

Base.logger ??= new NullLogger();
TopLevel.Trails!.configuration!.activeStorage.serviceConfigurations!.test_email = {
  service: "Disk",
  root: File.join(Dir.tmpdir(), "storage_email"),
};
await CreateActionMailboxTables.migrate("up");
await InboundEmail.loadSchema();
import "../mailboxes/application-mailbox.js";
import "../mailboxes/messages-mailbox.js";
