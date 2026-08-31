// Port of `GlobalID::Railtie` (`global_id/railtie.rb`). Trails railties are
// `Railtie` (activesupport) subclasses rather than `Rails::Railtie`, so the
// initializer bodies read their `app` off `Railtie.config` — the same shape
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
import { SignedGlobalID } from "./signed-global-id.js";
import { Verifier } from "./verifier.js";

/** Mirrors `config.global_id = ActiveSupport::OrderedOptions.new` (`railtie.rb:13`). */
export interface GlobalIdConfig {
  app?: string;
  expiresIn?: number | null;
  verifier?: MessageVerifier;
}

/** The `|app|` the `global_id` initializer is yielded (`railtie.rb:16`). */
export interface TrailtieApp {
  railtieName(): string;
  config: { globalId: GlobalIdConfig };
  keyGenerator(): { generateKey(salt: string): string | Buffer };
}

export class Trailtie extends BaseRailtie {
  static {
    registerRailtie(this);

    this.initializer("global_id", () => {
      Trailtie.initialize(Trailtie.config["app"] as TrailtieApp);
    });
  }

  /**
   * Mirrors the `initializer 'global_id'` block (`railtie.rb:16-42`). The
   * `after_initialize` half is registered on the `after_initialize` load hook,
   * which `Application#initialize` fires (`application.ts`).
   *
   * `ActiveSupport.on_load(:active_record)` (`railtie.rb:36-39`) has no arm
   * here: `Base` includes `GlobalID::Identification` statically
   * (`activerecord/src/base.ts`), because base.ts already imports globalid.
   */
  static initialize(app: TrailtieApp): void {
    const defaultExpiresIn = months(1).toI();
    const defaultAppName = dasherize(app.railtieName().replace("_application", ""));

    setApp((app.config.globalId.app ??= defaultAppName));
    SignedGlobalID.expiresIn = fetchExpiresIn(app.config.globalId, defaultExpiresIn);

    onLoad("after_initialize", () => {
      setApp((app.config.globalId.app ??= defaultAppName));
      SignedGlobalID.expiresIn = fetchExpiresIn(app.config.globalId, defaultExpiresIn);

      app.config.globalId.verifier ??= deriveVerifier(app);
      SignedGlobalID.verifier = app.config.globalId.verifier;
    });
  }
}

/**
 * Ruby's `app.config.global_id.fetch(:expires_in, default)` returns the stored
 * value whenever the key is present — including a stored `nil`, which is how
 * `config.global_id.expires_in = nil` disables expiration.
 */
function fetchExpiresIn(config: GlobalIdConfig, defaultExpiresIn: number): number | null {
  return "expiresIn" in config ? (config.expiresIn ?? null) : defaultExpiresIn;
}

/** Mirrors `railtie.rb:29-33` — a missing secret_key_base leaves the verifier unset. */
function deriveVerifier(app: TrailtieApp): MessageVerifier | undefined {
  try {
    return new Verifier(app.keyGenerator().generateKey("signed_global_ids"));
  } catch {
    return undefined;
  }
}
