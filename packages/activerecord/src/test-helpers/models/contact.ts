// vendor/rails/activerecord/test/models/contact.rb
import { Base } from "../../base.js";
import { ConnectionNotEstablished } from "../../errors.js";
import { FakeActiveRecordAdapter } from "../../support/fake-adapter.js";
import type { MergeColumnOptions } from "../../support/fake-adapter.js";

type ContactFakeColumnsHost = typeof Base & { column: typeof column };

// Rails' `lease_connection` is synchronous; trails' is async, so a class-body
// caller takes the sync escape hatch.
function leaseConnection(klass: typeof Base): FakeActiveRecordAdapter {
  const connection = klass.connectionPool().leaseConnectionSync();
  if (!(connection instanceof FakeActiveRecordAdapter)) {
    throw new ConnectionNotEstablished(
      `${klass.name} expected the "fake" adapter, got ${connection.constructor.name}`,
    );
  }
  return connection;
}

/** Mirrors: ContactFakeColumns#column */
function column(
  this: typeof Base,
  name: string,
  sqlType: string | null = null,
  options: MergeColumnOptions = {},
): void {
  leaseConnection(this).mergeColumn(this.tableName, name, sqlType, options);
}

/** Mirrors: ContactFakeColumns.extended */
async function extended(base: ContactFakeColumnsHost): Promise<void> {
  await base.establishConnection({ adapter: "fake" });

  const connection = leaseConnection(base);
  connection.dataSources = [base.tableName];
  connection.primaryKeys = { [base.tableName]: "id" };

  base.column("id", "integer");
  base.column("name", "string");
  base.column("age", "integer");
  base.column("avatar", "binary");
  base.column("created_at", "datetime");
  base.column("awesome", "boolean");
  base.column("preferences", "string");
  base.column("alternative_id", "integer");

  base.serialize("preferences");

  base.belongsTo("alternative", { className: "Contact" });
}

export class Contact extends Base {
  declare alternative: Contact | null;
  declare loadBelongsTo: (name: "alternative") => Promise<Contact | null>;

  static column = column;
}

await extended(Contact);

export class ContactSti extends Base {
  declare alternative: Contact | null;
  declare loadBelongsTo: (name: "alternative") => Promise<Contact | null>;

  static column = column;

  get type(): string {
    return "ContactSti";
  }
}

await extended(ContactSti);
ContactSti.column("type", "string");

// Rails reflects the fake adapter's columns lazily, on the first `columns`
// read. trails' synchronous reflection sees only an already-warm schema cache,
// so warm it here — after the last `column` call — while we can still await.
await Contact.loadSchema();
await ContactSti.loadSchema();
