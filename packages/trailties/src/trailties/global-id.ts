import {
  ArgumentError,
  dasherize,
  extend,
  include,
  months,
  onLoad,
} from "@blazetrails/activesupport";
import type { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import {
  FixtureSet,
  type FixtureSetHost,
  GlobalID,
  Identification,
  SignedGlobalID,
  Verifier,
} from "@blazetrails/globalid";
import { Trailtie as BaseTrailtie } from "../trailtie.js";

export interface GlobalIdConfig {
  app?: string;
  expiresIn?: number | null;
  verifier?: MessageVerifier;
}

export class Trailtie extends BaseTrailtie {
  static {
    BaseTrailtie.register(this);

    this.config.set("globalId", {} as GlobalIdConfig);
    this.config.eagerLoadNamespaces.push(GlobalID);

    this.initializer("global_id", (app) => {
      const defaultExpiresIn = months(1).toI();
      const defaultAppName = dasherize(app.railtieName.replace("_application", ""));

      const config = app.config.get("globalId") as GlobalIdConfig;
      GlobalID.setApp((config.app ??= defaultAppName));
      SignedGlobalID.expiresIn =
        "expiresIn" in config ? (config.expiresIn ?? null) : defaultExpiresIn;

      this.config.afterInitialize(() => {
        GlobalID.setApp((config.app ??= defaultAppName));
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

      onLoad("active_record", (base: new (...args: never[]) => unknown) => {
        include(base, Identification);
      });

      onLoad("active_record_fixture_set", (fixtureSet: FixtureSetHost) => {
        extend(fixtureSet as object, FixtureSet);
      });
    });

    this.initializer("web_console.deprecator", (app) => {
      app.deprecators?.set("globalId", GlobalID.deprecator());
    });
  }
}

Object.defineProperty(Trailtie, "name", { value: "GlobalID::Railtie" });
