import type { Bytes } from "@blazetrails/ruby-compat";
import {
  ArgumentError,
  dasherize,
  extend,
  months,
  onLoad,
  type Deprecators,
} from "@blazetrails/activesupport";
import type { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import {
  FixtureSet,
  type FixtureSetHost,
  setApp,
  GlobalID,
  SignedGlobalID,
  Verifier,
} from "@blazetrails/globalid";
import { Trailtie as BaseTrailtie } from "../trailtie.js";
import { setRubyClassPath } from "../ruby-class-path-slot.js";

export interface GlobalIdConfig {
  app?: string;
  expiresIn?: number | null;
  verifier?: MessageVerifier;
}

export interface TrailtieApp {
  railtieName: string;
  config: { get(key: string): unknown; set(key: string, value: unknown): void };
  deprecators?: Deprecators;
  keyGenerator(): { generateKey(salt: string): string | Bytes };
}

export class Trailtie extends BaseTrailtie {
  static {
    BaseTrailtie.register(this);

    this.config.set("globalId", {} as GlobalIdConfig);
    this.config.eagerLoadNamespaces.push(GlobalID);

    this.initializer("global_id", (app) => {
      const defaultExpiresIn = months(1).toI();
      const defaultAppName = dasherize(
        (app as TrailtieApp).railtieName.replace("_application", ""),
      );

      const config = (app as TrailtieApp).config.get("globalId") as GlobalIdConfig;
      setApp((config.app ??= defaultAppName));
      SignedGlobalID.expiresIn =
        "expiresIn" in config ? (config.expiresIn ?? null) : defaultExpiresIn;

      this.config.afterInitialize(() => {
        setApp((config.app ??= defaultAppName));
        SignedGlobalID.expiresIn =
          "expiresIn" in config ? (config.expiresIn ?? null) : defaultExpiresIn;

        config.verifier ??= (() => {
          try {
            return new Verifier(
              (app as TrailtieApp).keyGenerator().generateKey("signed_global_ids"),
            );
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
    });

    this.initializer("web_console.deprecator", (app) => {
      (app as TrailtieApp).deprecators?.set("globalId", GlobalID.deprecator());
    });
  }
}

setRubyClassPath(Trailtie, "GlobalID::Railtie");
