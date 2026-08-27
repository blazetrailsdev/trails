import type { AbstractAdapter } from "../connection-adapters/abstract-adapter.js";
import { Base } from "../index.js";

export async function ambientConnection(): Promise<AbstractAdapter> {
  return (await Base.leaseConnection()) as unknown as AbstractAdapter;
}

export async function withRocketTables(
  conn: AbstractAdapter,
  body: () => Promise<void>,
): Promise<void> {
  await conn.createTable("rockets", { force: true }, (t) => {
    t.string("name");
  });
  await conn.createTable("astronauts", { force: true }, (t) => {
    t.string("name");
    t.references("rocket", { type: "bigint" });
    t.references("favorite_rocket");
  });
  try {
    await body();
  } finally {
    await conn.dropTable("astronauts", "rockets", { ifExists: true });
  }
}

export async function withCompositeRocketTables(
  conn: AbstractAdapter,
  body: () => Promise<void>,
): Promise<void> {
  await conn.createTable("rockets", { primaryKey: ["tenant_id", "id"], force: true }, (t) => {
    t.integer("tenant_id");
    t.integer("id");
  });
  await conn.createTable("astronauts", { force: true }, (t) => {
    t.integer("rocket_id");
    t.integer("rocket_tenant_id");
  });
  try {
    await body();
  } finally {
    await conn.dropTable("astronauts", { ifExists: true });
    await conn.dropTable("rockets", { ifExists: true });
  }
}
