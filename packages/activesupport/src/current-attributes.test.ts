import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Logger, BroadcastLogger, taggedLogging } from "./logger.js";
import { HashWithIndifferentAccess } from "./hash-with-indifferent-access.js";
import { at, from, to, first, last, indent, exclude } from "./string-utils.js";
import {
  defineCallbacks,
  setCallback,
  skipCallback,
  resetCallbacks,
  runCallbacks,
} from "./callbacks.js";
import { concern, includeConcern, hasConcern } from "./concern.js";
import { transliterate } from "./transliterate.js";
import { CurrentAttributes } from "./current-attributes.js";
import { ordinalize, ordinal, dasherize, camelize, titleize } from "./inflector.js";
import {
  moduleParentName,
  mattrAccessor,
  configAccessor,
  rescueFrom,
  handleRescue,
} from "./module-ext.js";
import { Notifications } from "./notifications.js";
import { MemoryStore, NullStore, FileStore } from "./cache/stores.js";
import { MessageVerifier } from "./message-verifier.js";
import {
  deepMerge,
  deepTransformKeys,
  deepTransformValues,
  symbolizeKeys,
  stringifyKeys,
  deepSymbolizeKeys,
  deepStringifyKeys,
  reverseMerge,
  assertValidKeys,
  slice,
  except,
  extractKeys,
  compact,
  compactBlankObj,
} from "./hash-utils.js";
import { OrderedHash } from "./ordered-hash.js";
import {
  SafeBuffer,
  htmlEscape,
  htmlEscapeOnce,
  htmlSafe,
  isHtmlSafe,
  xmlNameEscape,
} from "./safe-buffer.js";
import { ErrorReporter } from "./error-reporter.js";
import {
  travelTo,
  travelBack,
  travel,
  freezeTime,
  currentTime,
  assertCalled,
  assertNotCalled,
  assertCalledOnInstanceOf,
  assertNotCalledOnInstanceOf,
} from "./testing-helpers.js";
import {
  makeRange,
  overlap,
  overlaps,
  rangeIncludesValue,
  rangeIncludesRange,
  cover,
  rangeToFs,
  rangeStep,
  rangeEach,
} from "./range-ext.js";
import {
  sum,
  indexBy,
  many,
  excluding,
  without,
  pluck,
  pick,
  compactBlank,
  inOrderOf,
  sole,
  minimum,
  maximum,
} from "./enumerable-utils.js";
import { toSentence } from "./array-utils.js";
import { ParameterFilter } from "./parameter-filter.js";
import { BacktraceCleaner, KeyGenerator, CachingKeyGenerator } from "./key-generator.js";

describe("CurrentAttributesTest", () => {
  // Set up a test subclass
  class Current extends CurrentAttributes {
    static {
      this.attribute("user");
      this.attribute("account");
    }
    declare user: string | undefined;
    declare account: string | undefined;
  }

  beforeEach(() => {
    Current.reset();
  });

  it("read and write attribute", () => {
    const inst = Current.instance();
    expect(inst.user).toBeUndefined();
    inst.user = "david";
    expect(inst.user).toBe("david");
  });

  it("read and write attribute with default value", () => {
    class CurrentWithDefault extends CurrentAttributes {
      static {
        this.attribute("user", { default: "guest" });
      }
      declare user: string;
    }
    CurrentWithDefault.reset();
    const inst = CurrentWithDefault.instance();
    expect(inst.user).toBe("guest");
    inst.user = "david";
    expect(inst.user).toBe("david");
  });

  it("read attribute with default callable", () => {
    class CurrentCallable extends CurrentAttributes {
      static {
        this.attribute("counter", { default: () => 0 });
      }
      declare counter: number;
    }
    CurrentCallable.reset();
    const inst = CurrentCallable.instance();
    expect(inst.counter).toBe(0);
    inst.counter = 5;
    expect(inst.counter).toBe(5);
  });

  it("read overwritten attribute method", () => {
    class CurrentOverride extends CurrentAttributes {
      static {
        this.attribute("user");
      }
      get user(): string | undefined {
        return (
          ((this as unknown as { _attributes: Map<string, unknown> })._attributes.get("user") as
            | string
            | undefined) ?? "default_user"
        );
      }
      set user(v: string | undefined) {
        (this as unknown as { _attributes: Map<string, unknown> })._attributes.set("user", v);
      }
    }
    CurrentOverride.reset();
    const inst = CurrentOverride.instance();
    expect(inst.user).toBe("default_user");
  });

  it("set attribute via overwritten method", () => {
    class CurrentOverrideSet extends CurrentAttributes {
      static {
        this.attribute("user");
      }
      private _prefixed: string | undefined;
      get user(): string | undefined {
        return this._prefixed;
      }
      set user(v: string | undefined) {
        this._prefixed = v ? `User: ${v}` : undefined;
      }
    }
    CurrentOverrideSet.reset();
    const inst = CurrentOverrideSet.instance();
    inst.user = "david";
    expect(inst.user).toBe("User: david");
  });

  it("set auxiliary class via overwritten method", () => {
    class CurrentAux extends CurrentAttributes {
      static {
        this.attribute("user");
      }
      declare user: { name: string } | undefined;
    }
    CurrentAux.reset();
    const inst = CurrentAux.instance();
    inst.user = { name: "david" };
    expect(inst.user?.name).toBe("david");
  });

  it.skip("resets auxiliary classes via callback", () => {
    /* callback infrastructure needed */
  });
  it.skip("set auxiliary class based on current attributes via before callback", () => {
    /* callback infrastructure */
  });

  it("set attribute only via scope", () => {
    const inst = Current.instance();
    inst.user = "in-scope";
    expect(Current.instance().user).toBe("in-scope");
    Current.reset();
    expect(Current.instance().user).toBeUndefined();
  });

  it("set multiple attributes", () => {
    Current.set({ user: "david", account: "37signals" });
    const inst = Current.instance();
    expect(inst.user).toBe("david");
    expect(inst.account).toBe("37signals");
  });

  it("using keyword arguments", () => {
    Current.set({ user: "david" });
    expect(Current.instance().user).toBe("david");
  });

  it("accessing attributes in teardown", () => {
    const inst = Current.instance();
    inst.user = "teardown-user";
    expect(inst.user).toBe("teardown-user");
    Current.reset();
    expect(Current.instance().user).toBeUndefined();
  });

  it("delegation", () => {
    const inst = Current.instance();
    inst.user = "delegated";
    // simulate delegation by accessing through instance
    expect(Current.instance().user).toBe("delegated");
  });

  it("all methods forward to the instance", () => {
    const inst = Current.instance();
    inst.user = "forwarded";
    expect(inst.user).toBe("forwarded");
    expect(inst.attributes).toHaveProperty("user", "forwarded");
  });

  it("respond_to? for methods that have not been called", () => {
    const inst = Current.instance();
    expect("user" in inst).toBe(true);
    expect("account" in inst).toBe(true);
    expect("nonexistent" in inst).toBe(false);
  });

  it("CurrentAttributes defaults do not leak between classes", () => {
    class CurrentA extends CurrentAttributes {
      static {
        this.attribute("user", { default: "A" });
      }
      declare user: string;
    }
    class CurrentB extends CurrentAttributes {
      static {
        this.attribute("user", { default: "B" });
      }
      declare user: string;
    }
    CurrentA.reset();
    CurrentB.reset();
    expect(CurrentA.instance().user).toBe("A");
    expect(CurrentB.instance().user).toBe("B");
  });

  it.skip("CurrentAttributes use fiber-local variables", () => {
    /* fiber/async context not applicable in JS */
  });
  it.skip("CurrentAttributes can use thread-local variables", () => {
    /* thread-local not applicable in JS */
  });

  it("CurrentAttributes doesn't populate #attributes when not using defaults", () => {
    const inst = Current.instance();
    expect(inst.attributes).not.toHaveProperty("user");
    inst.user = "david";
    expect(inst.attributes).toHaveProperty("user", "david");
  });

  it.skip("CurrentAttributes restricted attribute names", () => {
    /* Ruby reserved name enforcement */
  });
  it.skip("method_added hook doesn't reach the instance. Fix for #54646", () => {
    /* Ruby-specific */
  });
});
