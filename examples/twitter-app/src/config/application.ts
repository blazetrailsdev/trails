import { Base, registerModel } from "@blazetrails/activerecord";
import { getCryptoAsync } from "@blazetrails/activesupport/crypto-adapter";
import { Application as ServerApplication } from "@blazetrails/trailties/server";
import { User } from "../app/models/user.js";
import { Tweet } from "../app/models/tweet.js";
import { Follow } from "../app/models/follow.js";
import { Like } from "../app/models/like.js";

const MODELS = [User, Tweet, Follow, Like];

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
  // activesupport's crypto adapter only self-registers under CommonJS, so an
  // ESM app has to prime it through the async getter before anything reaches
  // `getCrypto()` synchronously — here, the signed session cookie.
  await getCryptoAsync();
  await Base.establishConnection();
  for (const m of MODELS) registerModel(m);
  await Promise.all(MODELS.map((m) => m.loadSchema()));
  connected = true;
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
