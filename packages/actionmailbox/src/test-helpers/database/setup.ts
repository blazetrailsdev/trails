import "@blazetrails/activestorage/test-helpers/database/setup";
import "../../constants.generated.js";
import "../../engine.js";
import { Base } from "@blazetrails/activerecord";
import { NullLogger } from "@blazetrails/activesupport";
import { InboundEmail } from "../../inbound-email.js";
import { CreateActionMailboxTables } from "../../db/migrate/20180917164000_create_action_mailbox_tables.js";

Base.logger ??= new NullLogger();
await CreateActionMailboxTables.migrate("up");
await InboundEmail.loadSchema();
import "../mailboxes/application-mailbox.js";
import "../mailboxes/messages-mailbox.js";
