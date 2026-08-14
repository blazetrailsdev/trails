import * as nodePath from "node:path";
import { fileURLToPath } from "node:url";
import { Base, registerModel } from "@blazetrails/activerecord";
import { getCryptoAsync } from "@blazetrails/activesupport/crypto-adapter";
import { getFsAsync, getPathAsync } from "@blazetrails/activesupport/fs-adapter";
import { backend } from "@blazetrails/i18n";
import type { RackApp } from "@blazetrails/actionpack";
import { Application, Trails } from "@blazetrails/trailties";
import { User } from "../app/models/user.js";
import { Tweet } from "../app/models/tweet.js";
import { Follow } from "../app/models/follow.js";
import { Like } from "../app/models/like.js";
import { Hashtag } from "../app/models/hashtag.js";

const MODELS = [User, Tweet, Follow, Like, Hashtag];

/**
 * Rails' `class Application < Rails::Application` in `config/application.rb`.
 * Importing this file registers the subclass, so `Trails.application` is null
 * until it has been loaded — `trails server` performs that import before
 * calling `Trails.initialize()`.
 */
export class TwitterApp extends Application {
  /**
   * TODO(0104-twitter-app-full-stack-integration/generator-src-layout-vs-engine-paths):
   * `trails new` generates `src/app` and `src/config`, but the engine's path
   * set declares Rails' root-level `app/` and `config/`
   * (`engine/configuration.ts:70-89`), so nothing is found. Rails' `with:`
   * remap is the supported way to point a path at a different directory
   * (`railties/lib/rails/paths.rb`); one of the two layouts should win.
   */
  override async paths() {
    const paths = await super.paths();
    for (const name of ["app/views", "app/controllers", "app/models", "config/locales"]) {
      paths.add(name, { with: `src/${name}` });
    }
    paths.add("config/routes.ts", { with: "src/config/routes.ts" });
    return paths;
  }
}

Application.register(TwitterApp);

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
 * Boot the application and return its Rack endpoint.
 *
 * `Trails.initialize()` runs the Bootstrap → Engine → Finisher initializer
 * chain, and `app()` is `config.ru`'s `run Rails.application`.
 */
export async function boot(): Promise<RackApp> {
  await connect();
  const app = await Trails.initialize();
  return app.app();
}
