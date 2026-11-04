import "./i18n.js";
import { Trailtie as BaseTrailtie } from "../trailtie.js";
import {
  CurrentAttributes,
  deprecator,
  ExecutorTestHelper,
  include,
  onLoad,
  TopLevel,
  type Deprecation,
  type DeprecationBehavior,
} from "@blazetrails/activesupport";
import { Digest } from "@blazetrails/activesupport/digest";
import { Codec } from "@blazetrails/activesupport/messages/codec";
import type { TestCase } from "@blazetrails/activesupport/test-case";
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

export class Trailtie extends BaseTrailtie {
  static {
    BaseTrailtie.register(this);

    this.config.set("activeSupport", {} satisfies ActiveSupportConfig);

    this.initializer("active_support.deprecator", { before: "load_environment_config" }, (app) => {
      app.deprecators.set("activeSupport", deprecator());
    });

    this.initializer(
      "active_support.reset_all_current_attributes_instances",
      /** @missingRailsCall include — CONVERGEABLE active-support-railtie-test-helper-else-arm */
      (app) => {
        app.reloader.beforeClassUnload(() => CurrentAttributes.clearAll());
        app.executor.toRun(() => CurrentAttributes.resetAll());
        app.executor.toComplete(() => CurrentAttributes.resetAll());

        onLoad("active_support_test_case", function (this: typeof TestCase) {
          if (app.config.activeSupport.executorAroundTestCase) {
            include(this, ExecutorTestHelper);
          }
        });
      },
    );

    this.initializer("active_support.deprecation_behavior", (app) => {
      const activeSupport = app.config.activeSupport;
      const deprecators = app.deprecators;
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
      const klass = app.config.activeSupport.hashDigestClass;
      if (klass != null) {
        Digest.hashDigestClass = klass;
      }
    });

    this.initializer("active_support.set_default_message_serializer", (app) => {
      this.config.afterInitialize(() => {
        const messageSerializer = app.config.activeSupport.messageSerializer;
        if (messageSerializer != null) {
          Codec.defaultSerializer = (
            isSymbol(messageSerializer) ? symbolToS(messageSerializer) : messageSerializer
          ) as typeof Codec.defaultSerializer;
        }
      });
    });

    this.initializer("active_support.require_message_pack", async (app) => {
      const messageSerializer = app.config.activeSupport.messageSerializer;
      if (
        typeof messageSerializer === "string" &&
        messageSerializer.includes("message_pack") &&
        TopLevel.ActiveSupport!.MessagePack === undefined
      ) {
        await TopLevel.ActiveSupport!.loadPath["active_support/message_pack"]();
      }
    });
  }
}

Object.defineProperty(Trailtie, "name", { value: "ActiveSupport::Railtie" });
