import * as nodePath from "node:path";
import { fileURLToPath } from "node:url";
import { Base, registerModel } from "@blazetrails/activerecord";
import { getCryptoAsync } from "@blazetrails/activesupport/crypto-adapter";
import { getFsAsync, getPathAsync } from "@blazetrails/activesupport/fs-adapter";
import { backend } from "@blazetrails/i18n";
import { Application as ServerApplication } from "@blazetrails/trailties/server";
import { User } from "../app/models/user.js";
import { Tweet } from "../app/models/tweet.js";
import { Follow } from "../app/models/follow.js";
import { Like } from "../app/models/like.js";
import { Hashtag } from "../app/models/hashtag.js";

const MODELS = [User, Tweet, Follow, Like, Hashtag];

let connected = false;

/**
 * Establish the connection and reflect each model's columns.
 *
 * No config lives here — `Base.establishConnection()` with no arguments reads
 * `config/database.ts` for the current `TRAILS_ENV`, exactly as Rails reads
 * `config/database.yml`. The models declare no attributes (see
 * `app/models/`), so `loadSchema` must run after the tables exist.
 */
export async function connect(): Promise<void> {
  if (connected) return;
  // TODO(0104-twitter-app-full-stack-integration/esm-adapters-need-explicit-priming):
  // activesupport's adapters only self-register under CommonJS, so an ESM app
  // has to prime each through its async getter before anything reaches the
  // sync accessor: crypto for the signed session cookie, fs and path for
  // `ActionDispatch::Static`.
  await Promise.all([getCryptoAsync(), getFsAsync(), getPathAsync()]);
  await loadLocales();
  await Base.establishConnection();
  for (const m of MODELS) registerModel(m);
  await Promise.all(MODELS.map((m) => m.loadSchema()));
  connected = true;
}

/**
 * Load `config/locales/*.json` into the I18n backend.
 *
 * Rails does this from an initializer over `config.i18n.load_path`; trails has
 * no such initializer yet, so the app loads its own.
 */
async function loadLocales(): Promise<void> {
  const fs = await getFsAsync();
  const path = await getPathAsync();
  const here = nodePath.dirname(fileURLToPath(import.meta.url));
  const dir = path.resolve(here, "locales");
  for (const entry of fs.readdirSync(dir)) {
    if (!entry.endsWith(".json")) continue;
    const data = JSON.parse(fs.readFileSync(path.join(dir, entry), "utf-8"));
    for (const [locale, translations] of Object.entries(data)) {
      backend().storeTranslations(locale, translations as Record<string, unknown>);
    }
  }
}

/**
 * Boot the application and return the Rack app.
 *
 * TODO(0104-twitter-app-full-stack-integration/boot-app-through-trailties-application):
 * this should be `class Application extends Trailties.Application` and boot
 * through the initializer chain. It isn't, because two different classes are
 * named `Application` and only the bespoke one in `trailties/src/server/`
 * can serve a request — `Trailties.Application` never splices `Finisher`, so
 * it builds no middleware stack and loads no routes.
 */
export async function boot(cwd: string): Promise<ServerApplication> {
  await connect();
  const app = new ServerApplication({ cwd });
  await app.initialize();
  return app;
}
