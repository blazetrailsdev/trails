import "./i18n.js";
import { Trailtie as BaseTrailtie } from "../trailtie.js";
import {
  deprecator,
  TopLevel,
  type Deprecation,
  type Deprecators,
  type DeprecationBehavior,
} from "@blazetrails/activesupport";
import { Digest } from "@blazetrails/activesupport/digest";
import { Codec } from "@blazetrails/activesupport/messages/codec";
import { isSymbol, symbolToS } from "@blazetrails/ruby-compat";

type HashDigestClass = typeof Digest.hashDigestClass;

type DeprecationCallable = (...args: unknown[]) => void;
type BehaviorSetting = DeprecationBehavior | DeprecationBehavior[] | DeprecationCallable | null;
type DisallowedBehaviorSetting = DeprecationBehavior | DeprecationCallable | null;

export interface ActiveSupportConfig {
  hashDigestClass?: HashDigestClass;
  reportDeprecations?: boolean;
  deprecation?: BehaviorSetting;
  disallowedDeprecation?: DisallowedBehaviorSetting;
  disallowedDeprecationWarnings?: Deprecation["disallowedWarnings"];
  executorAroundTestCase?: boolean | null;
  messageSerializer?: string | typeof Codec.defaultSerializer | null;
}

declare module "../trailtie/configuration.js" {
  interface Configuration {
    activeSupport: ActiveSupportConfig;
  }
}

/** @noRailsEquivalent PERMANENT */
interface TrailtieApp {
  config: { get(key: string): unknown };
  deprecators: Deprecators;
}

export class Trailtie extends BaseTrailtie {
  static {
    BaseTrailtie.register(this);

    this.config.set("activeSupport", {} satisfies ActiveSupportConfig);

    this.initializer("active_support.deprecator", { before: "load_environment_config" }, (app) => {
      (app as TrailtieApp).deprecators.set("activeSupport", deprecator());
    });

    this.initializer("active_support.deprecation_behavior", (app) => {
      const activeSupport = (app as TrailtieApp).config.get("activeSupport") as ActiveSupportConfig;
      const deprecators = (app as TrailtieApp).deprecators;
      if (activeSupport.reportDeprecations === false) {
        deprecators.setSilenced(true);
        deprecators.setBehavior("silence");
        deprecators.setDisallowedBehavior("silence");
      } else {
        const deprecation = activeSupport.deprecation;
        if (deprecation != null) {
          deprecators.setBehavior(deprecation);
        }

        const disallowedDeprecation = activeSupport.disallowedDeprecation;
        if (disallowedDeprecation != null) {
          deprecators.setDisallowedBehavior(disallowedDeprecation);
        }

        const disallowedWarnings = activeSupport.disallowedDeprecationWarnings;
        if (disallowedWarnings != null) {
          deprecators.setDisallowedWarnings(disallowedWarnings);
        }
      }
    });

    this.initializer("active_support.set_hash_digest_class", (app) => {
      const klass = ((app as TrailtieApp).config.get("activeSupport") as ActiveSupportConfig)
        .hashDigestClass;
      if (klass != null) {
        Digest.hashDigestClass = klass;
      }
    });

    this.initializer("active_support.set_default_message_serializer", (app) => {
      this.config.afterInitialize(() => {
        const messageSerializer = (
          (app as TrailtieApp).config.get("activeSupport") as ActiveSupportConfig
        ).messageSerializer;
        if (messageSerializer != null) {
          Codec.defaultSerializer = (
            isSymbol(messageSerializer) ? symbolToS(messageSerializer) : messageSerializer
          ) as typeof Codec.defaultSerializer;
        }
      });
    });

    this.initializer(
      "active_support.require_message_pack",
      { after: "finisher_hook" },
      async (app) => {
        const messageSerializer = (
          (app as TrailtieApp).config.get("activeSupport") as ActiveSupportConfig
        ).messageSerializer;
        if (
          typeof messageSerializer === "string" &&
          messageSerializer.includes("message_pack") &&
          TopLevel.ActiveSupport!.MessagePack === undefined
        ) {
          await TopLevel.ActiveSupport!.loadPath["active_support/message_pack"]();
        }
      },
    );
  }
}

Object.defineProperty(Trailtie, "name", { value: "ActiveSupport::Railtie" });
