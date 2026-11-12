import "../../constants.generated.js";
import "../dummy/config/environment.js";
import { CreateActiveStorageTables } from "@blazetrails/activestorage/db/migrate/20170806125915_create_active_storage_tables";
import { Attachment } from "@blazetrails/activestorage/attachment";
import { Blob } from "@blazetrails/activestorage/blob";
import { InboundEmail } from "../../inbound-email.js";
import { CreateActionMailboxTables } from "../../db/migrate/20180917164000_create_action_mailbox_tables.js";

await CreateActiveStorageTables.migrate("up");
await CreateActionMailboxTables.migrate("up");
await Blob.loadSchema();
await Attachment.loadSchema();
await InboundEmail.loadSchema();
import "../mailboxes/application-mailbox.js";
import "../mailboxes/messages-mailbox.js";
