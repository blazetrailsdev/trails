import "./i18n.js";
import { Trailtie as BaseTrailtie } from "../trailtie.js";
import {
  CurrentAttributes,
  deprecator,
  ExecutionContext,
  Executor,
  findZoneBang,
  include,
  IsolatedExecutionState,
  MissingKeyError,
  onLoad,
  setZoneDefault,
  TopLevel,
  type Deprecation,
  type DeprecationBehavior,
} from "@blazetrails/activesupport";
import { ActiveSupport } from "@blazetrails/activesupport";
import { Store } from "@blazetrails/activesupport/cache/store";
import {
  findBeginningOfWeekBang,
  setBeginningOfWeekDefault,
} from "@blazetrails/activesupport/core-ext/date/calculations";
import { Digest } from "@blazetrails/activesupport/digest";
import { KeyGenerator } from "@blazetrails/activesupport/key-generator";
import { MessageEncryptor } from "@blazetrails/activesupport/message-encryptor";
import { Metadata } from "@blazetrails/activesupport/messages/metadata";
import { Codec } from "@blazetrails/activesupport/messages/codec";
import type { TestCase } from "@blazetrails/activesupport/test-case";
import {
  exit,
  isSymbol,
  rbFSend,
  rbObjRespondTo,
  STDERR,
  symbolToS,
} from "@blazetrails/ruby-compat";

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
  toTimePreservesTimezone?: string;
  isolationLevel?: typeof IsolatedExecutionState.isolationLevel;
  raiseOnInvalidCacheExpirationTime?: boolean;
  useAuthenticatedMessageEncryption?: boolean | null;
  keyGeneratorHashDigestClass?: typeof KeyGenerator.hashDigestClass | null;
  useMessageSerializerForMetadata?: boolean;
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

    this.initializer("active_support.isolation_level", (app) => {
      this.config.afterInitialize(() => {
        const level = app.config.activeSupport.isolationLevel;
        delete app.config.activeSupport.isolationLevel;
        if (level != null) {
          IsolatedExecutionState.isolationLevel = level;
        }
      });
    });

    this.initializer("active_support.raise_on_invalid_cache_expiration_time", (app) => {
      this.config.afterInitialize(() => {
        if (app.config.activeSupport.raiseOnInvalidCacheExpirationTime) {
          Store.raiseOnInvalidCacheExpirationTime = true;
        }
      });
    });

    this.initializer("active_support.set_authenticated_message_encryption", (app) => {
      this.config.afterInitialize(() => {
        if (app.config.activeSupport.useAuthenticatedMessageEncryption != null) {
          MessageEncryptor.useAuthenticatedMessageEncryption =
            app.config.activeSupport.useAuthenticatedMessageEncryption;
        }
      });
    });

    this.initializer("active_support.reset_execution_context", (app) => {
      app.reloader.beforeClassUnload(() => ExecutionContext.clear());
      app.executor.toRun(() => ExecutionContext.clear());
      app.executor.toComplete(() => ExecutionContext.clear());
    });

    this.initializer("active_support.reset_all_current_attributes_instances", (app) => {
      app.reloader.beforeClassUnload(() => CurrentAttributes.clearAll());
      app.executor.toRun(() => CurrentAttributes.resetAll());
      app.executor.toComplete(() => CurrentAttributes.resetAll());

      onLoad("active_support_test_case", function (this: typeof TestCase) {
        if (app.config.activeSupport.executorAroundTestCase) {
          include(this, Executor.TestHelper);
        } else {
          include(this, CurrentAttributes.TestHelper);

          include(this, ExecutionContext.TestHelper);
        }
      });
    });

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

    /**
     * @missingRailsCall get — CONVERGEABLE initialize-time-zone-checks-tzinfo-data-source
     * @missingRailsCall exception — CONVERGEABLE initialize-time-zone-checks-tzinfo-data-source
     * @missingRailsCall eager_load_namespaces — CONVERGEABLE initialize-time-zone-checks-tzinfo-data-source
     */
    this.initializer("active_support.initialize_time_zone", (app) => {
      setZoneDefault(findZoneBang(app.config.timeZone));
    });

    this.initializer("active_support.to_time_preserves_timezone", (app) => {
      this.config.afterInitialize(() => {
        ActiveSupport.setToTimePreservesTimezone(
          app.config.activeSupport.toTimePreservesTimezone ?? null,
        );
      });
    });

    this.initializer("active_support.initialize_beginning_of_week", (app) => {
      const beginningOfWeekDefault = findBeginningOfWeekBang(app.config.beginningOfWeek);

      setBeginningOfWeekDefault(beginningOfWeekDefault);
    });

    this.initializer("active_support.require_master_key", async (app) => {
      if ("requireMasterKey" in app.config && app.config.requireMasterKey) {
        try {
          await (await app.credentials()).key();
        } catch (error) {
          if (!(error instanceof MissingKeyError)) throw error;
          STDERR.puts(error.message);
          exit(1);
        }
      }
    });

    this.initializer("active_support.set_configs", (app) => {
      for (const [key, v] of Object.entries(app.config.activeSupport)) {
        const k = `${key}=`;
        if (rbObjRespondTo(ActiveSupport, k)) rbFSend(ActiveSupport, k, v);
      }
    });

    this.initializer("active_support.set_hash_digest_class", (app) => {
      this.config.afterInitialize(() => {
        const klass = app.config.activeSupport.hashDigestClass;
        if (klass != null) {
          Digest.hashDigestClass = klass;
        }
      });
    });

    this.initializer("active_support.set_key_generator_hash_digest_class", (app) => {
      this.config.afterInitialize(() => {
        const klass = app.config.activeSupport.keyGeneratorHashDigestClass;
        if (klass != null) {
          KeyGenerator.hashDigestClass = klass;
        }
      });
    });

    this.initializer("active_support.set_default_message_serializer", (app) => {
      this.config.afterInitialize(() => {
        const messageSerializer = app.config.activeSupport.messageSerializer;
        const setDefaultSerializer = (): void => {
          if (messageSerializer != null) {
            Codec.defaultSerializer = (
              isSymbol(messageSerializer) ? symbolToS(messageSerializer) : messageSerializer
            ) as typeof Codec.defaultSerializer;
          }
        };
        if (
          typeof messageSerializer === "string" &&
          messageSerializer.includes("message_pack") &&
          TopLevel.ActiveSupport!.MessagePack === undefined
        ) {
          return TopLevel.ActiveSupport!.loadPath["active_support/message_pack"]().then(
            setDefaultSerializer,
          );
        }
        setDefaultSerializer();
        return undefined;
      });
    });

    this.initializer("active_support.set_use_message_serializer_for_metadata", (app) => {
      this.config.afterInitialize(() => {
        Metadata.useMessageSerializerForMetadata =
          app.config.activeSupport.useMessageSerializerForMetadata ?? false;
      });
    });
  }
}

Object.defineProperty(Trailtie, "name", { value: "ActiveSupport::Railtie" });
