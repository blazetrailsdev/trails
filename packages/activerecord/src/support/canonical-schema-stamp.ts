/** @internal */
import { getEnv } from "@blazetrails/activesupport";
import type { AbstractAdapter as DatabaseAdapter } from "../connection-adapters/abstract-adapter.js";
import { InternalMetadata } from "../internal-metadata.js";
import { TEST_SCHEMA } from "../test-helpers/test-schema.js";
import { RUN_TOKEN_ENV } from "./run-token.js";

function stampFor(runToken: string): string {
  return `canonical-schema:${runToken}`;
}

const ADAPTER_SPECIFIC_TABLES_KEY = "adapter_specific_tables";

const VALUE_CHUNK_LENGTH = 255;

function chunkKey(index: number): string {
  return `${ADAPTER_SPECIFIC_TABLES_KEY}_${index}`;
}

const BOOKKEEPING_TABLE_NAMES: ReadonlySet<string> = new Set([
  "schema_migrations",
  "ar_internal_metadata",
]);

const CANONICAL_TABLE_NAMES: ReadonlySet<string> = new Set(Object.keys(TEST_SCHEMA));

async function adapterSpecificHalf(adapter: DatabaseAdapter): Promise<string[]> {
  return (await adapter.tables()).filter(
    (name) => !BOOKKEEPING_TABLE_NAMES.has(name) && !CANONICAL_TABLE_NAMES.has(name),
  );
}

export async function adapterSpecificTables(adapter: DatabaseAdapter): Promise<string[] | null> {
  const metadata = new InternalMetadata(adapter.pool);
  if (!(await metadata.tableExists())) return null;
  const count = await metadata.get(ADAPTER_SPECIFIC_TABLES_KEY);
  if (count == null || !/^\d+$/.test(count)) return null;
  let encoded = "";
  for (let index = 0; index < Number(count); index++) {
    const chunk = await metadata.get(chunkKey(index));
    if (chunk == null) return null;
    encoded += chunk;
  }
  try {
    const parsed: unknown = JSON.parse(encoded);
    return Array.isArray(parsed) ? (parsed as string[]) : null;
  } catch {
    return null;
  }
}

export async function stampCanonicalSchema(
  adapter: DatabaseAdapter,
  runToken = getEnv(RUN_TOKEN_ENV),
  laid?: readonly string[],
): Promise<void> {
  if (!runToken) return;
  const metadata = new InternalMetadata(adapter.pool);
  await metadata.createTableAndSetFlags("test", stampFor(runToken));
  const snapshot = laid ?? (await adapterSpecificHalf(adapter));
  const encoded = JSON.stringify([...snapshot].sort());
  const chunks: string[] = [];
  for (let at = 0; at < encoded.length; at += VALUE_CHUNK_LENGTH) {
    chunks.push(encoded.slice(at, at + VALUE_CHUNK_LENGTH));
  }
  for (const [index, chunk] of chunks.entries()) {
    await metadata.set(chunkKey(index), chunk);
  }
  await metadata.set(ADAPTER_SPECIFIC_TABLES_KEY, String(chunks.length));
}

export async function canonicalSchemaUpToDate(adapter: DatabaseAdapter): Promise<boolean> {
  const runToken = getEnv(RUN_TOKEN_ENV);
  if (!runToken) return false;
  const metadata = new InternalMetadata(adapter.pool);
  if (!(await metadata.tableExists())) return false;
  return (await metadata.get("schema_sha1")) === stampFor(runToken);
}

export function canonicalSchemaStamp(runToken: string): string {
  return stampFor(runToken);
}
