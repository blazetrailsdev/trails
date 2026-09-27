import { fileURLToPath } from "node:url";
import { Base, registerModel } from "@blazetrails/activerecord";
import { loadDatabaseConfig } from "@blazetrails/activerecord-cli";
import { User, Tweet, Follow, Like } from "./models/index.js";

const MODELS = [User, Tweet, Follow, Like];

let connected = false;

/**
 * Establish the connection (idempotent within a process).
 *
 * No config lives here — `loadDatabaseConfig` populates `Base.configurations`
 * from `config/database.ts`, as Rails' railtie does from `config/database.yml`,
 * and `Base.establishConnection()` with no arguments picks the current
 * `TRAILS_ENV`. To change databases, edit that file.
 */
export async function connect(): Promise<void> {
  if (connected) return;
  await loadDatabaseConfig(fileURLToPath(new URL("..", import.meta.url)));
  await Base.establishConnection();
  connected = true;
}

/**
 * Register the models (so `className:` / `through:` lookups resolve by name)
 * and reflect each one's columns from the live DB schema. The models declare
 * no attributes (see src/models/), so this must run after `connect()` and
 * after the tables exist (i.e. after migrating) before any read/write.
 * Rails does both implicitly on load/first-use; we do it eagerly here.
 */
export async function loadModelSchemas(): Promise<void> {
  for (const m of MODELS) registerModel(m);
  await Promise.all(MODELS.map((m) => m.loadSchema()));
}
