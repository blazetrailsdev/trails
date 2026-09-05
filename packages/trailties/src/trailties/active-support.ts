import { Trailtie as BaseTrailtie } from "../trailtie.js";
import { setRubyClassPath } from "../ruby-class-path-slot.js";
import {
  deprecator,
  type Deprecation,
  type Deprecators,
  type DeprecationBehavior,
} from "@blazetrails/activesupport";
import { Digest } from "@blazetrails/activesupport/digest";

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
}

/** @noRailsEquivalent PERMANENT */
interface TrailtieApp {
  config: { get(key: string): unknown };
  deprecators: Deprecators;
}

export class Trailtie extends BaseTrailtie {
  static {
    BaseTrailtie.register(this);

    this.config.set("activeSupport", {});

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

    this.initializer("active_support.set_hash_digest_class", () => {
      const klass = (this.config.get("activeSupport") as ActiveSupportConfig).hashDigestClass;
      if (klass) {
        Digest.hashDigestClass = klass;
      }
    });
  }
}

setRubyClassPath(Trailtie, "ActiveSupport::Railtie");
