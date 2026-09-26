import { beforeEach, describe, expect, it, vi } from "vitest";
import { NameError, StandardError, Thread, rbEqual, stderr } from "@blazetrails/ruby-compat";
import { Module } from "@blazetrails/ruby-compat/include";
import {
  Deprecation,
  DeprecationException,
  callerLocations,
  type CallerLocation,
  type DeprecationBehaviorCallable,
} from "./deprecation.js";
import { DeprecatedConstantAccessor } from "./deprecation/constant-accessor.js";
import {
  DeprecatedConstantProxy,
  DeprecatedInstanceVariableProxy,
  DeprecatedObjectProxy,
} from "./deprecation/proxy-wrappers.js";
import { deprecate } from "./core-ext/module/deprecation.js";
import { sole } from "./enumerable-utils.js";
import { VERSION } from "./gem-version.js";
import { ArgumentError } from "./hash-utils.js";
import { registerConstant } from "./inflector.js";
import { Logger } from "./logger.js";
import { Notifications } from "./notifications.js";
import { TopLevel } from "./namespaces.js";
import { stubConst } from "./testing/constant-stubbing.js";
import {
  Assertion,
  assert,
  assertEmpty,
  assertIncludes,
  assertNot,
  assertNotEmpty,
  assertNothingRaised,
  assertRaise,
  assertRaises,
  assertSame,
} from "./testing/assertions.js";
import { assertErrorReported } from "./testing/error-reporter-assertions.js";
import { assertCalledWith } from "./testing/method-call-assertions.js";
import {
  assertDeprecated,
  assertNotDeprecated,
  collectDeprecations,
} from "./testing/deprecation.js";

class Deprecatee {
  static deprecate = deprecate;

  private _fubar: unknown;
  private _fooBar: unknown;

  fubar(): unknown {
    return this._fubar;
  }
  setFubar(value: unknown): void {
    this._fubar = value;
  }
  fooBar(): unknown {
    return this._fooBar;
  }
  setFooBar(value: unknown): void {
    this._fooBar = value;
  }

  zero(): number {
    return 0;
  }
  one(a: unknown): unknown {
    return a;
  }
  multi(a: unknown, b: unknown, c: unknown): unknown[] {
    return [a, b, c];
  }
}

expect.addEqualityTesters([
  function deprecatedConstantProxyEquals(a: unknown, b: unknown): boolean | undefined {
    if (!(a instanceof DeprecatedConstantProxy) && !(b instanceof DeprecatedConstantProxy)) {
      return undefined;
    }
    return rbEqual(b, a);
  },
]);

const UndeprecatedFoo = Object.assign(new Module(), { name: "Undeprecated::Foo", BAR: "foo bar" });
registerConstant("Undeprecated::Foo", UndeprecatedFoo);
registerConstant("Undeprecated::Foo::BAR", UndeprecatedFoo.BAR);
class UndeprecatedError extends StandardError {}
registerConstant("Undeprecated::Error", UndeprecatedError);

class CallerLocationFixture implements CallerLocation {
  path = "packages/activesupport/src/deprecation.test.ts";
  lineno: number;
  label: string;

  constructor(label: string, lineno: number) {
    this.label = label;
    this.lineno = lineno;
  }

  get absolutePath(): string {
    return this.path;
  }

  toString(): string {
    return `${this.path}:${this.lineno}:in '${this.label}'`;
  }
}

function capture(_stream: ":stderr", block: () => void): string {
  const chunks: string[] = [];
  const spy = vi.spyOn(stderr, "write").mockImplementation((chunk) => {
    chunks.push(String(chunk));
    return true;
  });
  try {
    block();
  } finally {
    spy.mockRestore();
  }
  return chunks.join("");
}

function withTrailsLogger<T>(logger: Logger | null, block: (logger: Logger | null) => T): T {
  return stubConst(TopLevel, "Trails", { logger }, () => block(logger), { exists: false });
}

function callDeprecatedMethodWarning(
  deprecator: Deprecation,
  methodName: string,
  message?: string,
): string {
  return (
    deprecator as unknown as {
      deprecatedMethodWarning(methodName: string, message?: string): string;
    }
  ).deprecatedMethodWarning(methodName, message);
}

class DeprecatorWithMessages extends Deprecation {
  messages: string[] = [];

  constructor() {
    super();
    this.behavior = (message: string) => {
      this.messages.push(message);
    };
  }
}

function deprecatorWithMessages(): DeprecatorWithMessages {
  return new DeprecatorWithMessages();
}

async function collectDisallowed<T>(
  deprecator: Deprecation,
  block: () => T | Promise<T>,
): Promise<[T, string[]]> {
  const originalDisallowedBehavior = deprecator.disallowedBehavior;
  const disallowed: string[] = [];
  deprecator.disallowedBehavior = ((message: string) => {
    disallowed.push(message);
  }) as DeprecationBehaviorCallable;
  try {
    const result = await block();
    return [result, disallowed];
  } finally {
    deprecator.disallowedBehavior = originalDisallowedBehavior;
  }
}

async function assertDisallowed<T>(
  match: RegExp | string | Deprecation | null,
  deprecator: Deprecation | null,
  block: () => T | Promise<T>,
): Promise<T> {
  if (match instanceof Deprecation) [match, deprecator] = [null, match];
  const [result, disallowed] = await collectDisallowed(deprecator!, block);
  assertNotEmpty(
    disallowed,
    "Expected a disallowed deprecation within the block but received none",
  );
  if (match != null) {
    const matcher = match instanceof RegExp ? match : new RegExp(match);
    assert(
      disallowed.some((message) => matcher.test(message)),
      `No disallowed deprecations matched ${matcher}: ${disallowed.join(", ")}`,
    );
  }
  return result;
}

function assertCallbacksCalledWith(
  matchers: { deprecator?: Deprecation; message?: RegExp },
  block: (callbacks: DeprecationBehaviorCallable[]) => void,
): void {
  const expected: Record<string, unknown> = {};
  if (matchers.message) expected.message = matchers.message;
  if (matchers.deprecator) {
    expected.deprecationHorizon = matchers.deprecator.deprecationHorizon;
    expected.gemName = matchers.deprecator.gemName;
    expected.deprecator = matchers.deprecator;
  }

  const bindings: Record<string, unknown>[] = [];

  const callbacks = [
    (message: string, callstack: unknown[], deprecator: Deprecation) => {
      bindings.push({ message, callstack, deprecator });
    },
    (message: string, callstack: unknown[], deprecationHorizon: string, gemName: string) => {
      bindings.push({ message, callstack, deprecationHorizon, gemName });
    },
    (message: string, callstack: unknown[]) => {
      bindings.push({ message, callstack });
    },
    (message: string) => {
      bindings.push({ message });
    },
    () => {
      bindings.push({});
    },
  ] as unknown as DeprecationBehaviorCallable[];

  block(callbacks);

  expect(bindings.length).toEqual(callbacks.length);

  for (const bound of bindings) {
    if ("callstack" in bound) expect(Array.isArray(bound.callstack)).toBe(true);
    for (const [name, matcher] of Object.entries(expected)) {
      if (!(name in bound)) continue;
      if (matcher instanceof RegExp) {
        expect(String(bound[name])).toMatch(matcher);
      } else {
        expect(bound[name]).toEqual(matcher);
      }
    }
  }
}

describe("DeprecationTest", () => {
  let deprecator: Deprecation;

  beforeEach(() => {
    deprecator = new Deprecation();
  });

  it("assert_deprecated", async () => {
    await assertDeprecated(/fubar/, deprecator, () => {
      deprecator.warn("using fubar is deprecated");
    });

    await assertDeprecated(deprecator, () => {
      deprecator.warn("whatever");
    });
  });

  it("assert_deprecated requires a deprecator", async () => {
    await assertRaises([ArgumentError], {}, async () => {
      await assertDeprecated(null, null, () => {
        Deprecation._instance().warn();
      });
    });
  });

  it("assert_not_deprecated", async () => {
    await assertNotDeprecated(deprecator, () => 1 + 1);
  });

  it("assert_not_deprecated requires a deprecator", async () => {
    await assertRaises([ArgumentError], {}, async () => {
      await assertNotDeprecated(null as unknown as Deprecation, () => {});
    });
  });

  it("collect_deprecations returns the return value of the block and the deprecations collected", async () => {
    const result = await collectDeprecations(deprecator, () => {
      deprecator.warn();
      return ":result";
    });
    expect(result.length).toEqual(2);
    expect(result[0]).toEqual(":result");
    expect(sole(result[1])).toMatch("DEPRECATION WARNING:");
  });

  it("collect_deprecations requires a deprecator", async () => {
    await assertRaises([ArgumentError], {}, async () => {
      await collectDeprecations(null as unknown as Deprecation, () => {});
    });
  });

  it("Module::deprecate", async () => {
    const klass = class extends Deprecatee {};
    klass.deprecate("zero", "one", "multi", { deprecator });

    await assertDeprecated(/zero is deprecated/, deprecator, () => {
      expect(new klass().zero()).toEqual(0);
    });

    await assertDeprecated(/one is deprecated/, deprecator, () => {
      expect(new klass().one(1)).toEqual(1);
    });

    await assertDeprecated(/multi is deprecated/, deprecator, () => {
      expect(new klass().multi(1, 2, 3)).toEqual([1, 2, 3]);
    });
  });

  it("Module::deprecate does not expand Hash positional argument", async () => {
    const klass = class extends Deprecatee {
      ["one!"](a: unknown): unknown {
        return Deprecatee.prototype.one.call(this, a);
      }
    };
    klass.deprecate("one", "one!", { deprecator });

    const hash = { k: 1 };

    await assertDeprecated(/one is deprecated/, deprecator, () => {
      assertSame(hash, new klass().one(hash));
    });

    await assertDeprecated(/one! is deprecated/, deprecator, () => {
      assertSame(hash, new klass()["one!"](hash));
    });
  });

  it("Module::deprecate requires a deprecator", async () => {
    const klass = class extends Deprecatee {};
    await assertRaises([ArgumentError], {}, () => {
      (klass as unknown as { deprecate(name: string): void }).deprecate("zero");
    });
  });

  it("DeprecatedObjectProxy", async () => {
    const deprecatedObject = DeprecatedObjectProxy.new({}, ":bomb:", deprecator);
    await assertDeprecated(/:bomb:/, deprecator, () =>
      (deprecatedObject as { toS(): unknown }).toS(),
    );
  });

  it("DeprecatedObjectProxy requires a deprecator", async () => {
    await assertRaises([ArgumentError], {}, () => {
      DeprecatedObjectProxy.new({}, ":bomb:");
    });
  });

  it("nil behavior is ignored", async () => {
    deprecator.behavior = null;
    await assertDeprecated("fubar", deprecator, () => {
      deprecator.warn("fubar");
    });
  });

  it("behavior callbacks", () => {
    assertCallbacksCalledWith({ deprecator, message: /fubar/ }, (callbacks) => {
      deprecator.behavior = callbacks;
      deprecator.warn("fubar");
    });
  });

  it("behavior callbacks with callable objects", () => {
    assertCallbacksCalledWith({ deprecator, message: /fubar/ }, (callbacks) => {
      assertNotEmpty(callbacks);

      deprecator.behavior = callbacks.map(
        (callback) => ({ call: callback }) as unknown as DeprecationBehaviorCallable,
      );
      deprecator.warn("fubar");
    });
  });

  it(":raise behavior", async () => {
    deprecator.behavior = "raise";

    const message = "Revise this deprecated stuff now!";
    const callstack = callerLocations();

    const e = await assertRaise([DeprecationException], {}, () => {
      deprecator.behavior[0](message, callstack, deprecator);
    });
    expect(e.message).toEqual(message);
    expect(e.stack?.split("\n")).toEqual(callstack.map((l) => String(l)));
  });

  it(":stderr behavior", () => {
    deprecator.behavior = "stderr";
    const behavior = deprecator.behavior[0];

    const output = capture(":stderr", () => {
      behavior("Some error!", ["call stack!"], deprecator);
    });

    expect(output).toMatch("Some error!");
    expect(output).not.toMatch("call stack!");
  });

  it(":stderr behavior with debug", () => {
    deprecator.behavior = "stderr";
    const behavior = deprecator.behavior[0];
    deprecator.debug = true;

    const output = capture(":stderr", () => {
      behavior("Some error!", ["call stack!"], deprecator);
    });

    expect(output).toMatch("Some error!");
    expect(output).toMatch("call stack!");
  });

  it(":stderr behavior with #warn", () => {
    deprecator.behavior = "stderr";

    const output = capture(":stderr", () => {
      deprecator.warn("Instance error!", [new CallerLocationFixture("instance call stack!", 1)]);
    });

    expect(output).toMatch(/Instance error!/);
    expect(output).toMatch(/instance call stack!/);
  });

  it(":log behavior", () => {
    deprecator.behavior = "log";
    const output: string[] = [];

    withTrailsLogger(new Logger({ write: (s) => output.push(s) }), () => {
      deprecator.behavior[0]("fubar", ["call stack!"], deprecator);
    });

    expect(output.join("")).toMatch("fubar");
    expect(output.join("")).not.toMatch("call stack!");
  });

  it(":log behavior with debug", () => {
    deprecator.behavior = "log";
    deprecator.debug = true;
    const output: string[] = [];

    withTrailsLogger(new Logger({ write: (s) => output.push(s) }), () => {
      deprecator.behavior[0]("fubar", ["call stack!"], deprecator);
    });

    expect(output.join("")).toMatch("fubar");
    expect(output.join("")).toMatch("call stack!");
  });

  it(":log behavior without Rails.logger", () => {
    deprecator.behavior = "log";

    const output = capture(":stderr", () => {
      withTrailsLogger(null, () => {
        deprecator.behavior[0]("fubar", ["call stack!"], deprecator);
      });
    });

    expect(output).toMatch("fubar");
  });

  it(":silence behavior", () => {
    deprecator.behavior = "silence";
    const behavior = deprecator.behavior[0];

    const output = capture(":stderr", () => {
      behavior("Some error!", ["call stack!"], deprecator);
    });

    assertEmpty(output);
  });

  it(":notify behavior", () => {
    const deprecator = new Deprecation("horizon", "MyGem::Custom");
    deprecator.behavior = "notify";
    const behavior = deprecator.behavior[0];

    const events: Record<string, unknown>[] = [];
    const sub = Notifications.subscribe("deprecation.my_gem_custom", (event) => {
      events.push(event.payload as Record<string, unknown>);
    });

    try {
      behavior("Some error!", ["call stack!"], deprecator);
      expect(events.length).toBe(1);
      expect(events[0].message).toBe("Some error!");
      expect(events[0].callstack).toEqual(["call stack!"]);
      expect(events[0].deprecationHorizon).toBe("horizon");
      expect(events[0].gemName).toBe("MyGem::Custom");
    } finally {
      Notifications.unsubscribe(sub);
    }
  });

  it(":report_error behavior", async () => {
    const deprecator = new Deprecation("horizon", "MyGem::Custom");
    deprecator.behavior = "report";
    const report = await assertErrorReported(DeprecationException, () => {
      deprecator.warn();
    });
    expect(report?.handled).toEqual(true);
    expect(report?.severity).toEqual("warning");
    expect(report?.source).toEqual("application");
  });

  it("invalid behavior", async () => {
    const e = await assertRaises([ArgumentError], {}, () => {
      deprecator.behavior = "invalid" as never;
    });

    expect(e.message).toEqual(":invalid is not a valid deprecation behavior.");
  });

  it("DeprecatedInstanceVariableProxy", async () => {
    const instance = new Deprecatee();
    instance.setFubar(
      DeprecatedInstanceVariableProxy.new(instance, "fooBar", "@fubar", { deprecator }),
    );
    instance.setFooBar("foo bar!");

    const fubarSize = await assertDeprecated("@fubar.size", deprecator, () =>
      (instance.fubar() as { size(): unknown }).size(),
    );
    expect(fubarSize).toEqual((instance.fooBar() as string).length);

    const fubarS = await assertDeprecated("@fubar.to_s", deprecator, () =>
      (instance.fubar() as { toS(): unknown }).toS(),
    );
    expect(fubarS).toEqual(String(instance.fooBar()));
  });

  it("DeprecatedInstanceVariableProxy does not warn on inspect", async () => {
    const instance = new Deprecatee();
    instance.setFubar(
      DeprecatedInstanceVariableProxy.new(instance, "fooBar", "@fubar", { deprecator }),
    );
    instance.setFooBar("foo bar!");

    const fubarInspected = await assertNotDeprecated(deprecator, () =>
      (instance.fubar() as { inspect(): unknown }).inspect(),
    );
    expect(fubarInspected).toEqual(JSON.stringify(instance.fooBar()));
  });

  it("DeprecatedInstanceVariableProxy requires a deprecator", async () => {
    await assertRaises([ArgumentError], {}, () => {
      DeprecatedInstanceVariableProxy.new(new Deprecatee(), "foobar", "@fubar");
    });
  });

  it("DeprecatedConstantProxy", async () => {
    const proxy = DeprecatedConstantProxy.new("FUBAR", "Undeprecated::Foo::BAR", deprecator);

    await assertDeprecated("FUBAR", deprecator, () => {
      expect(proxy).toEqual(UndeprecatedFoo.BAR);
    });
  });

  it("DeprecatedConstantProxy does not warn on .class", async () => {
    const proxy = DeprecatedConstantProxy.new("FUBAR", "Undeprecated::Foo::BAR", deprecator);

    const fubarClass = await assertNotDeprecated(deprecator, () =>
      (proxy as { class(): unknown }).class(),
    );
    expect(fubarClass).toEqual(UndeprecatedFoo.BAR.constructor);
  });

  it("DeprecatedConstantProxy with child constant", async () => {
    const proxy = DeprecatedConstantProxy.new("Fuu", "Undeprecated::Foo", deprecator);

    await assertDeprecated("Fuu", deprecator, () => {
      expect((proxy as { BAR: unknown }).BAR).toEqual(UndeprecatedFoo.BAR);
    });

    await assertDeprecated("Fuu", deprecator, async () => {
      await assertRaises(
        [NameError],
        {},
        () => (proxy as { DOES_NOT_EXIST: unknown }).DOES_NOT_EXIST,
      );
    });
  });

  it("DeprecatedConstantProxy requires a deprecator", async () => {
    await assertRaise([ArgumentError], {}, () => {
      DeprecatedConstantProxy.new("Fuu", "Undeprecated::Foo");
    });
  });

  type Legacy = Module & {
    FUBAR: unknown;
    Error: new () => Error;
    deprecateConstant(a: string, b: string, o?: object): void;
  };

  it("deprecate_constant", async () => {
    const legacy = new Module() as Legacy;
    Object.defineProperty(legacy, "name", { value: "Legacy" });
    legacy.include(DeprecatedConstantAccessor);
    legacy.deprecateConstant("FUBAR", "Undeprecated::Foo::BAR", { deprecator });

    await assertDeprecated("Legacy::FUBAR", deprecator, () => {
      expect(legacy.FUBAR).toEqual(UndeprecatedFoo.BAR);
    });
  });

  it("deprecate_constant when rescuing a deprecated error", async () => {
    const legacy = new Module() as Legacy;
    Object.defineProperty(legacy, "name", { value: "Legacy" });
    legacy.include(DeprecatedConstantAccessor);
    legacy.deprecateConstant("Error", "Undeprecated::Error", { deprecator });

    await assertDeprecated("Legacy::Error", deprecator, async () => {
      await assertNothingRaised(() => {
        try {
          throw new UndeprecatedError();
        } catch (e) {
          if (!(e instanceof legacy.Error)) throw e;
        }
      });
    });
  });

  it("deprecate_constant requires a deprecator", async () => {
    const legacy = new Module().include(DeprecatedConstantAccessor) as Legacy;
    await assertRaises([ArgumentError], {}, () => {
      legacy.deprecateConstant("OLD", "NEW");
    });
  });

  it("assert_deprecated raises when no deprecation warning", async () => {
    await assertRaises([Assertion], {}, async () => {
      await assertDeprecated(deprecator, () => 1 + 1);
    });
  });

  it("assert_not_deprecated raises when some deprecation warning", async () => {
    await assertRaises([Assertion], {}, async () => {
      await assertNotDeprecated(deprecator, () => {
        deprecator.warn();
      });
    });
  });

  it("assert_deprecated without match argument", async () => {
    await assertDeprecated(deprecator, () => {
      deprecator.warn();
    });
  });

  it("assert_deprecated matches any warning from block", async () => {
    await assertDeprecated("abc", deprecator, () => {
      deprecator.warn("abc");
      deprecator.warn("def");
    });
  });

  it("assert_not_deprecated returns the result of the block", async () => {
    expect(await assertNotDeprecated(deprecator, () => 123)).toEqual(123);
  });

  it("assert_deprecated returns the result of the block", async () => {
    const result = await assertDeprecated("abc", deprecator, () => {
      deprecator.warn("abc");
      return 123;
    });
    expect(result).toEqual(123);
  });

  it("silence", async () => {
    assertNot(deprecator.silenced);

    await deprecator.silence(async () => {
      await assertNotDeprecated(deprecator, () => {
        deprecator.warn();
      });
    });

    await assertDeprecated(deprecator, () => {
      deprecator.warn();
    });

    deprecator.silenced = true;
    assert(deprecator.silenced);

    await assertNotDeprecated(deprecator, () => {
      deprecator.warn();
    });
  });

  it("silence returns the result of the block", () => {
    expect(deprecator.silence(() => 123)).toEqual(123);
  });

  it("silence ensures silencing is reverted after an error is raised", async () => {
    await assertRaises([Error], {}, () => {
      deprecator.silence(() => {
        throw new Error();
      });
    });

    await assertDeprecated(deprecator, () => {
      deprecator.warn();
    });
  });

  it("silence only affects the current thread", async () => {
    await deprecator.silence(async () => {
      await assertNotDeprecated(deprecator, () => {
        deprecator.warn();
      });

      await new Thread(async () => {
        await assertDeprecated(deprecator, () => {
          deprecator.warn();
        });

        await deprecator.silence(async () => {
          await assertNotDeprecated(deprecator, () => {
            deprecator.warn();
          });
        });

        await assertDeprecated(deprecator, () => {
          deprecator.warn();
        });
      }).join();

      await assertNotDeprecated(deprecator, () => {
        deprecator.warn();
      });
    });
  });

  it("Module::deprecate with method name only", async () => {
    const klass = class extends Deprecatee {};
    klass.deprecate("fubar", "setFubar", { deprecator });

    await assertDeprecated(deprecator, () => new klass().fubar());
    await assertDeprecated(deprecator, () => {
      new klass().setFubar(":foo");
    });
  });

  it("Module::deprecate with alternative method", async () => {
    const klass = class extends Deprecatee {};
    klass.deprecate({ fubar: ":fooBar", deprecator });

    await assertDeprecated(/use fooBar instead/, deprecator, () => new klass().fubar());
  });

  it("Module::deprecate with message", async () => {
    const klass = class extends Deprecatee {};
    klass.deprecate({ fubar: "this is the old way", deprecator });

    await assertDeprecated(/this is the old way/, deprecator, () => new klass().fubar());
  });

  it("overriding deprecated_method_warning", () => {
    const deprecator = deprecatorWithMessages();
    Object.assign(deprecator, {
      deprecatedMethodWarning(method: string): string {
        return `deprecator.deprecated_method_warning.${method}`;
      },
    });

    const deprecatee = class {
      method(): void {}
      static deprecate = deprecate;
      static {
        this.deprecate("method", { deprecator });
      }
    };

    new deprecatee().method();
    assert(
      /DEPRECATION WARNING: deprecator\.deprecated_method_warning\.method/.test(
        deprecator.messages[0],
      ),
    );
  });

  it("Module::deprecate with custom deprecator", () => {
    const customDeprecator = { deprecationWarning: (_method: string, _message?: unknown) => {} };

    assertCalledWith(customDeprecator, "deprecationWarning", ["method", null], {}, () => {
      const klass = class {
        method(): void {}
        static deprecate = deprecate;
        static {
          this.deprecate("method", { deprecator: customDeprecator });
        }
      };

      new klass().method();
    });
  });

  it("DeprecatedConstantProxy with explicit deprecator", () => {
    const d = new Deprecation();
    const spy = vi.spyOn(stderr, "write").mockImplementation(() => true);
    d.warn("constant deprecated");
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("constant deprecated"));
    spy.mockRestore();
  });

  it("DeprecatedConstantProxy with message", () => {
    const deprecator = deprecatorWithMessages();

    const OLD = DeprecatedConstantProxy.new("klass::OLD", "Undeprecated::Foo::BAR", deprecator, {
      message: "foo",
    });

    (OLD as { toS(): unknown }).toS();
    expect(deprecator.messages[deprecator.messages.length - 1]).toMatch("foo");
  });

  it("default deprecation_horizon is greater than the current Rails version", () => {
    expect(new Deprecation().deprecationHorizon.localeCompare(VERSION.STRING)).toBeGreaterThan(0);
  });

  it("default gem_name is Rails", () => {
    const deprecator = new Deprecation();

    const message = callDeprecatedMethodWarning(
      deprecator,
      "deprecated_method",
      "You are calling deprecated method",
    );
    expect(message).toMatch(/is deprecated and will be removed from Rails/);
  });

  it("custom gem_name", () => {
    const deprecator = new Deprecation("2.0", "Custom");

    const message = callDeprecatedMethodWarning(
      deprecator,
      "deprecated_method",
      "You are calling deprecated method",
    );
    expect(message).toMatch(/is deprecated and will be removed from Custom/);
  });

  it("Module::deprecate can be called before the target method is defined", async () => {
    const base = class extends Deprecatee {};
    const klass = class extends base {};
    klass.deprecate("multi!", { deprecator });
    (base.prototype as unknown as Record<string, unknown>)["multi!"] = Deprecatee.prototype.multi;

    await assertDeprecated(/multi! is deprecated/, deprecator, () => {
      expect(
        (new klass() as unknown as Record<string, (...a: unknown[]) => unknown>)["multi!"](1, 2, 3),
      ).toEqual([1, 2, 3]);
    });
  });

  it("warn with empty callstack", async () => {
    deprecator.behavior = "silence";

    await assertNothingRaised(async () => {
      deprecator.warn("message", []);
      await new Thread(() => {
        deprecator.warn("message");
      }).join();
    });
  });

  it("disallowed_warnings is empty by default", () => {
    expect(deprecator.disallowedWarnings).toEqual([]);
  });

  it("disallowed_warnings can be configured", () => {
    const configWarnings = ["unsafe_method is going away"];
    deprecator.disallowedWarnings = configWarnings;
    expect(deprecator.disallowedWarnings).toEqual(configWarnings);
  });

  it("disallowed_behavior does not trigger when disallowed_warnings is empty", async () => {
    deprecator.disallowedBehavior = () => expect.unreachable("flunk");

    await assertDeprecated(/fubar/, deprecator, () => {
      deprecator.warn("using fubar is deprecated");
    });
  });

  it("disallowed_behavior does not trigger when disallowed_warnings does not match the warning", async () => {
    deprecator.disallowedBehavior = () => expect.unreachable("flunk");
    deprecator.disallowedWarnings = ["foo bar"];

    await assertDeprecated(/fubar/, deprecator, () => {
      deprecator.warn("using fubar is deprecated");
    });
  });

  it("disallowed_warnings can match using a substring", async () => {
    deprecator.disallowedWarnings = ["fubar"];

    await assertDisallowed(/fubar/, deprecator, () => {
      deprecator.warn("using fubar is deprecated");
    });
  });

  it("disallowed_warnings can match using a substring as a symbol", async () => {
    deprecator.disallowedWarnings = [":fubar"];

    await assertDisallowed(/fubar/, deprecator, () => {
      deprecator.warn("using fubar is deprecated");
    });
  });

  it("disallowed_warnings can match using a regexp", async () => {
    deprecator.disallowedWarnings = [/f[aeiou]+bar/];

    await assertDisallowed(/fubar/, deprecator, () => {
      deprecator.warn("using fubar is deprecated");
    });
  });

  it("disallowed_warnings matches all warnings when set to :all", async () => {
    deprecator.disallowedWarnings = ":all";

    await assertDisallowed(/fubar/, deprecator, () => {
      deprecator.warn("using fubar is deprecated");
    });
  });

  it("different behaviors for allowed and disallowed warnings", async () => {
    deprecator.disallowedWarnings = ":all";
    deprecator.behavior = () => expect.unreachable("flunk");

    await assertDisallowed(/fubar/, deprecator, () => {
      deprecator.warn("using fubar is deprecated");
    });
  });

  it("disallowed_warnings with the default warning message", async () => {
    deprecator.disallowedWarnings = ":all";
    await assertDisallowed(deprecator, null, () => {
      deprecator.warn();
    });

    deprecator.disallowedWarnings = ["fubar"];
    await assertDeprecated(deprecator, () => {
      deprecator.warn();
    });
  });

  it("disallowed_behavior callbacks", () => {
    assertCallbacksCalledWith({ deprecator, message: /fubar/ }, (callbacks) => {
      deprecator.disallowedBehavior = callbacks;
      deprecator.disallowedWarnings = ["fubar"];
      deprecator.warn("fubar");
    });
  });

  it("allow", async () => {
    deprecator.disallowedWarnings = ":all";

    await assertDisallowed(deprecator, null, () => {
      deprecator.warn();
    });

    await deprecator.allow(":all", {}, async () => {
      await assertDeprecated(deprecator, () => {
        deprecator.warn();
      });
    });
  });

  it("allow only allows matching warnings using a substring", async () => {
    deprecator.disallowedWarnings = ":all";

    await deprecator.allow(["foo bar", "baz qux"], {}, async () => {
      await assertDeprecated(/foo bar/, deprecator, () => {
        deprecator.warn("foo bar");
      });
      await assertDeprecated(/baz qux/, deprecator, () => {
        deprecator.warn("baz qux");
      });
      await assertDisallowed(/fubar/, deprecator, () => {
        deprecator.warn("fubar");
      });
    });
  });

  it("allow only allows matching warnings using a substring as a symbol", async () => {
    deprecator.disallowedWarnings = ":all";

    await deprecator.allow([":foo bar", ":baz qux"], {}, async () => {
      await assertDeprecated(/foo bar/, deprecator, () => {
        deprecator.warn("foo bar");
      });
      await assertDeprecated(/baz qux/, deprecator, () => {
        deprecator.warn("baz qux");
      });
      await assertDisallowed(/fubar/, deprecator, () => {
        deprecator.warn("fubar");
      });
    });
  });

  it("allow only allows matching warnings using a regexp", async () => {
    deprecator.disallowedWarnings = ":all";

    await deprecator.allow([/(foo|baz) (bar|qux)/], {}, async () => {
      await assertDeprecated(/foo bar/, deprecator, () => {
        deprecator.warn("foo bar");
      });
      await assertDeprecated(/baz qux/, deprecator, () => {
        deprecator.warn("baz qux");
      });
      await assertDisallowed(/fubar/, deprecator, () => {
        deprecator.warn("fubar");
      });
    });
  });

  it("allow only affects its block", async () => {
    deprecator.disallowedWarnings = ":all";

    await deprecator.allow(":all", {}, async () => {
      await assertDeprecated(deprecator, () => {
        deprecator.warn();
      });
    });

    await assertDisallowed(deprecator, null, () => {
      deprecator.warn();
    });
  });

  it("allow only affects the current thread", async () => {
    deprecator.disallowedWarnings = ":all";

    await deprecator.allow(":all", {}, async () => {
      await assertDeprecated(deprecator, () => {
        deprecator.warn();
      });

      await new Thread(async () => {
        await assertDisallowed(deprecator, null, () => {
          deprecator.warn();
        });

        await deprecator.allow(":all", {}, async () => {
          await assertDeprecated(deprecator, () => {
            deprecator.warn();
          });
        });

        await assertDisallowed(deprecator, null, () => {
          deprecator.warn();
        });
      }).join();

      await assertDeprecated(deprecator, () => {
        deprecator.warn();
      });
    });
  });

  it("allow with :if option", async () => {
    deprecator.disallowedWarnings = ":all";

    await deprecator.allow(["fubar"], { if: true }, async () => {
      await assertDeprecated(/fubar/, deprecator, () => {
        deprecator.warn("fubar");
      });
    });

    await deprecator.allow(["fubar"], { if: false }, async () => {
      await assertDisallowed(/fubar/, deprecator, () => {
        deprecator.warn("fubar");
      });
    });
  });

  it("allow with :if option as a proc", async () => {
    deprecator.disallowedWarnings = ":all";

    await deprecator.allow(["fubar"], { if: () => true }, async () => {
      await assertDeprecated(/fubar/, deprecator, () => {
        deprecator.warn("fubar");
      });
    });

    await deprecator.allow(["fubar"], { if: () => false }, async () => {
      await assertDisallowed(/fubar/, deprecator, () => {
        deprecator.warn("fubar");
      });
    });
  });

  it("allow with the default warning message", async () => {
    deprecator.disallowedWarnings = ":all";

    await deprecator.allow(":all", {}, async () => {
      await assertDeprecated(deprecator, () => {
        deprecator.warn();
      });
    });

    await deprecator.allow(["fubar"], {}, async () => {
      await assertDisallowed(deprecator, null, () => {
        deprecator.warn();
      });
    });
  });

  it("warn deprecation skips the internal caller locations", () => {
    let callstack: CallerLocation[] = [];
    deprecator.behavior = (_message: string, frames: unknown[]) => {
      callstack = frames as CallerLocation[];
    };
    methodThatEmitsDeprecation(deprecator);
    expect(callstack[0].absolutePath ?? callstack[0].path).toEqual(expandedFile);
    expect(callstack[0].lineno).toEqual(callerLocations(0)[0].lineno - 2);
  });

  it("warn deprecation can blame code generated with eval", () => {
    let message = "";
    deprecator.behavior = (emitted: string) => {
      message = emitted;
    };
    const RUBY_VERSION: string = "3.3.0";
    generatedMethodThatCallDeprecation(deprecator);
    // eslint-disable-next-line vitest/no-conditional-in-test -- mirrors deprecation_test.rb:796
    if (RUBY_VERSION >= "3.4") {
      // eslint-disable-next-line vitest/no-conditional-expect
      expect(message).toEqual(
        "DEPRECATION WARNING: Here (called from DeprecationTest#generatedMethodThatCallDeprecation at /path/to/template.html.tse:2)",
      );
    } else {
      // eslint-disable-next-line vitest/no-conditional-expect
      expect(message).toEqual(
        "DEPRECATION WARNING: Here (called from generatedMethodThatCallDeprecation at /path/to/template.html.tse:2)",
      );
    }
  });

  it("warn deprecation can blame code from internal methods", () => {
    let message = "";
    deprecator.behavior = (emitted: string) => {
      message = emitted;
    };
    methodThatEmitsDeprecationWithInternalMethod(deprecator);

    assertIncludes(message, "/path/to/user/code.js");
  });
});

const generatedMethodThatCallDeprecation = (0, eval)(
  `(callerLocations) => function generatedMethodThatCallDeprecation(deprecator) {
  deprecator.warn("Here", callerLocations(0, 10));
}
//# sourceURL=/path/to/template.html.tse`,
)(callerLocations) as (deprecator: Deprecation) => void;

const methodThatEmitsDeprecationWithInternalMethod = (0, eval)(
  `() => function methodThatEmitsDeprecationWithInternalMethod(deprecator) {
  [1].forEach(() => deprecator.warn());
}
//# sourceURL=/path/to/user/code.js`,
)() as (deprecator: Deprecation) => void;

const expandedFile = new URL(import.meta.url).pathname;

function methodThatEmitsDeprecation(deprecator: Deprecation): void {
  deprecator.warn();
}
