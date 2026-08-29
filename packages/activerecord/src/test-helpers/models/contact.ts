import { Base } from "../../base.js";
import { ConnectionNotEstablished } from "../../errors.js";
import { FakeActiveRecordAdapter } from "../../support/fake-adapter.js";
import type { MergeColumnOptions } from "../../support/fake-adapter.js";

type ContactFakeColumnsHost = typeof Base & { column: typeof column };

function fakeConnection(klass: typeof Base): FakeActiveRecordAdapter {
  const connection = klass.connectionPool().leaseConnectionSync();
  if (!(connection instanceof FakeActiveRecordAdapter)) {
    throw new ConnectionNotEstablished(
      `${klass.name} expected the "fake" adapter, got ${connection.constructor.name}`,
    );
  }
  return connection;
}

function column(
  this: typeof Base,
  name: string,
  sqlType: string | null = null,
  options: MergeColumnOptions = {},
): void {
  fakeConnection(this).mergeColumn(this.tableName, name, sqlType, options);
}

async function extended(base: ContactFakeColumnsHost): Promise<void> {
  await base.establishConnection({ adapter: "fake" });

  const connection = fakeConnection(base);
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
