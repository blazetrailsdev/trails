// Port of `GlobalID::Railtie` (`global_id/railtie.rb`). Trails railties are
// `Railtie` (activesupport) subclasses rather than `Rails::Railtie`, so the
// initializer bodies read their `app` off `Railtie.config` — the shape
// activemodel's Trailtie uses.
import {
  Railtie as BaseRailtie,
  dasherize,
  months,
  onLoad,
  registerRailtie,
} from "@blazetrails/activesupport";
import type { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { setApp } from "./config.js";
import { GlobalID } from "./global-id.js";
import { SignedGlobalID } from "./signed-global-id.js";
import { Verifier } from "./verifier.js";

/** Mirrors `config.global_id = ActiveSupport::OrderedOptions.new` (`railtie.rb:13`). */
export interface GlobalIdConfig {
  app?: string;
  expiresIn?: number | null;
  verifier?: MessageVerifier;
}

/** The `|app|` the `global_id` initializer is yielded (`railtie.rb:16`).
 *
 * Ruby's `app.config.global_id` resolves through `Railtie::Configuration`'s
 * `@@options` (`railtie/configuration.rb:96-108`) to the very hash
 * `railtie.rb:13` seeded, so `globalId` is optional here and defaults to that
 * same seed rather than being a slot each app has to build. */
export interface TrailtieApp {
  railtieName(): string;
  config: { globalId?: GlobalIdConfig };
  keyGenerator(): { generateKey(salt: string): string | Buffer };
}

export class Trailtie extends BaseRailtie {
  static {
    registerRailtie(this);

    Trailtie.config["globalId"] = {} as GlobalIdConfig;
    ((Trailtie.config["eagerLoadNamespaces"] ??= []) as unknown[]).push(GlobalID);

    this.initializer("global_id", () => {
      Trailtie.initialize(Trailtie.config["app"] as TrailtieApp);
    });

    this.initializer("web_console.deprecator", () => {
      BaseRailtie.deprecators["globalId"] = GlobalID.deprecator();
    });
  }

  /**
   * Mirrors the `initializer 'global_id'` block (`railtie.rb:16-42`). Its
   * `config.after_initialize` half is registered on the `after_initialize`
   * load hook, which `Application#initialize` fires.
   *
   * `expires_in` is read the way Ruby's
   * `app.config.global_id.fetch(:expires_in, default)` reads it — a stored
   * `nil` wins over the default, which is how
   * `config.global_id.expires_in = nil` disables expiration.
   *
   * The verifier derivation rescues any error where Rails rescues
   * `ArgumentError` (`railtie.rb:31-32`): `Application#keyGenerator` raises a
   * plain `Error` for a missing `secret_key_base`, so there is no narrower
   * class to name until trailties grows one.
   *
   * The class body's `config.global_id = ActiveSupport::OrderedOptions.new`
   * and `config.eager_load_namespaces << GlobalID` (`railtie.rb:13-14`) are
   * seeded on `Railtie.config`. `Railtie::Configuration` itself lives in
   * trailties, which globalid cannot import — trailties depends on
   * activerecord, which depends on globalid — so an activesupport-level
   * Railtie's own `config` is the shared bag both lines land in.
   *
   * `ActiveSupport.on_load(:active_record)` (`railtie.rb:36-39`) needs no arm:
   * `Base` includes `GlobalID::Identification` statically, because base.ts
   * already imports globalid. `on_load(:active_record_fixture_set)`
   * (`railtie.rb:41`) awaits a `GlobalID::FixtureSet` port.
   */
  static initialize(app: TrailtieApp): void {
    const config = (app.config.globalId ??= Trailtie.config["globalId"] as GlobalIdConfig);
    const defaultExpiresIn = months(1).toI();
    const defaultAppName = dasherize(app.railtieName().replace("_application", ""));

    setApp((config.app ??= defaultAppName));
    SignedGlobalID.expiresIn =
      "expiresIn" in config ? (config.expiresIn ?? null) : defaultExpiresIn;

    onLoad("after_initialize", () => {
      setApp((config.app ??= defaultAppName));
      SignedGlobalID.expiresIn =
        "expiresIn" in config ? (config.expiresIn ?? null) : defaultExpiresIn;

      config.verifier ??= (() => {
        try {
          return new Verifier(app.keyGenerator().generateKey("signed_global_ids"));
        } catch {
          return undefined;
        }
      })();
      SignedGlobalID.verifier = config.verifier;
    });
  }
}
