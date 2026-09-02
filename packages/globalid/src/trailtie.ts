// Port of `GlobalID::Railtie` (`global_id/railtie.rb`). Trails railties are
// `Railtie` (activesupport) subclasses rather than `Rails::Railtie`; the
// initializer block is yielded the application, as `initializable.rb:31-33`
// and `:60-63` do.
import {
  ArgumentError,
  Trailtie as BaseTrailtie,
  dasherize,
  extend,
  months,
  onLoad,
  registerTrailtie,
  type Deprecators,
} from "@blazetrails/activesupport";
import { FixtureSet, type FixtureSetHost } from "./fixture-set.js";
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
  /** Rails: `delegate :railtie_name, to: :class` (`railtie.rb:220`) — a zero-arg
   * reader, so trails spells it a property (`trailties/src/trailtie.ts:115`). */
  railtieName: string;
  config: { globalId?: GlobalIdConfig };
  /** `app.deprecators[:global_id] = ... if app.respond_to?(:deprecators)`
   * (`railtie.rb:47`) — `Application#deprecators`
   * (`railties/lib/rails/application.rb:244-248`). Optional because the Ruby
   * carries the `respond_to?` guard. */
  deprecators?: Deprecators;
  keyGenerator(): { generateKey(salt: string): string | Buffer };
}

export class Trailtie extends BaseTrailtie {
  static {
    registerTrailtie(this);

    BaseTrailtie.config["globalId"] = {} as GlobalIdConfig;
    ((BaseTrailtie.config["eagerLoadNamespaces"] ??= []) as unknown[]).push(GlobalID);

    this.initializer("global_id", (app) => {
      Trailtie.initialize(app as TrailtieApp);
    });

    this.initializer("web_console.deprecator", (app) => {
      (app as TrailtieApp).deprecators?.set("globalId", GlobalID.deprecator());
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
   * The class body's `config.global_id = ActiveSupport::OrderedOptions.new`
   * and `config.eager_load_namespaces << GlobalID` (`railtie.rb:13-14`)
   * are seeded on activesupport's `Railtie.config`, the analogue of the
   * `@@`-level state `Railtie::Configuration` holds
   * (`railtie/configuration.rb:17-20`): trailties' `Configuration` reads its
   * `eagerLoadNamespaces` off that same array, so the namespace reaches the
   * app-facing list even though globalid cannot import trailties (trailties
   * depends on activerecord, which depends on globalid).
   *
   * `ActiveSupport.on_load(:active_record)` (`railtie.rb:36-39`) needs no arm:
   * `Base` includes `GlobalID::Identification` statically, because base.ts
   * already imports globalid.
   */
  static initialize(app: TrailtieApp): void {
    const config = (app.config.globalId ??= BaseTrailtie.config["globalId"] as GlobalIdConfig);
    const defaultExpiresIn = months(1).toI();
    const defaultAppName = dasherize(app.railtieName.replace("_application", ""));

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
        } catch (error) {
          if (error instanceof ArgumentError) return undefined;
          throw error;
        }
      })();
      SignedGlobalID.verifier = config.verifier;
    });

    onLoad("active_record_fixture_set", (fixtureSet: FixtureSetHost) => {
      extend(fixtureSet as object, FixtureSet);
    });
  }
}
