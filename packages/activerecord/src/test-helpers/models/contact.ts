import { Base } from "../../base.js";
import { ConnectionNotEstablished } from "../../errors.js";
import { FakeActiveRecordAdapter } from "../../support/fake-adapter.js";
import type { MergeColumnOptions } from "../../support/fake-adapter.js";

type ContactFakeColumnsHost = typeof Base & { column: typeof column };

async function fakeConnection(klass: typeof Base): Promise<FakeActiveRecordAdapter> {
  const connection = await klass.leaseConnection();
  if (!(connection instanceof FakeActiveRecordAdapter)) {
    throw new ConnectionNotEstablished(
      `${klass.name} expected the "fake" adapter, got ${connection.constructor.name}`,
    );
  }
  return connection;
}

async function column(
  this: typeof Base,
  name: string,
  sqlType: string | null = null,
  options: MergeColumnOptions = {},
): Promise<void> {
  (await fakeConnection(this)).mergeColumn(this.tableName, name, sqlType, options);
}

async function extended(base: ContactFakeColumnsHost): Promise<void> {
  await base.establishConnection({ adapter: "fake" });

  const connection = await fakeConnection(base);
  connection.dataSources = [base.tableName];
  connection.primaryKeys = { [base.tableName]: "id" };

  await base.column("id", "integer");
  await base.column("name", "string");
  await base.column("age", "integer");
  await base.column("avatar", "binary");
  await base.column("created_at", "datetime");
  await base.column("awesome", "boolean");
  await base.column("preferences", "string");
  await base.column("alternative_id", "integer");

  base.serialize("preferences");

  base.belongsTo("alternative", { className: "Contact" });
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Contact extends Base {
  declare age: number | null;
  declare avatar: Uint8Array | null;
  declare awesome: boolean | null;
  declare name: string;

  static column = column;
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Contact {
  get alternative(): Contact | null | Promise<Contact | null>;
  set alternative(value: Contact | null);
}

await extended(Contact);

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ContactSti extends Base {
  static column = column;

  get type(): string {
    return "ContactSti";
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface ContactSti {
  get alternative(): Contact | null | Promise<Contact | null>;
  set alternative(value: Contact | null);
}

await extended(ContactSti);
await ContactSti.column("type", "string");
