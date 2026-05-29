import { Base, registerModel } from "@blazetrails/activerecord";
import { User, Tweet, Follow, Like } from "./models/index.js";

const MODELS = [User, Tweet, Follow, Like];

let connected = false;

/**
 * Establish the connection (idempotent within a process).
 *
 * No config lives here — `Base.establishConnection()` with no arguments
 * reads `config/database.ts` for the current `TRAILS_ENV`, exactly like
 * Rails reads `config/database.yml`. To change databases, edit that file.
 */
export async function connect(): Promise<void> {
  if (connected) return;
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
