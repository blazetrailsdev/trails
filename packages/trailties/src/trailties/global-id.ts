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

export interface GlobalIdConfig {
  app?: string;
  expiresIn?: number | null;
  verifier?: MessageVerifier;
}

export interface TrailtieApp {
  railtieName: string;
  config: { globalId?: GlobalIdConfig };
  deprecators?: Deprecators;
  keyGenerator(): { generateKey(salt: string): string | Buffer };
}

export class Trailtie extends BaseTrailtie {
  static {
    BaseTrailtie.register(this);

    this.config.set("globalId", {} as GlobalIdConfig);
    this.config.eagerLoadNamespaces.push(GlobalID);

    this.initializer("global_id", (app) => {
      Trailtie.initialize(app as TrailtieApp);
    });

    this.initializer("web_console.deprecator", (app) => {
      (app as TrailtieApp).deprecators?.set("globalId", GlobalID.deprecator());
    });
  }

  static initialize(app: TrailtieApp): void {
    const config = (app.config.globalId ??= Trailtie.config.get("globalId") as GlobalIdConfig);
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
