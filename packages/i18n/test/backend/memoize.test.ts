import {
  defineModule,
  include,
  rbCallSuper,
  rbInspect,
  Thread,
  toSym,
} from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Memoize } from "../../lib/backend/memoize.js";
import { Simple } from "../../lib/backend/simple.js";
import {
  availableLocales,
  backend,
  eagerLoadBang,
  normalizeKeys,
  reloadBang,
  setBackend,
} from "../../lib/i18n.js";
import type { TranslationData } from "../../lib/utils.js";
import * as TestCase from "../support/test-case.js";

interface Spy {
  spyCalls: number | null;
}

function spyAvailableLocales(this: Spy): unknown {
  this.spyCalls = (this.spyCalls || 0) + 1;
  return rbCallSuper(this, spyAvailableLocales);
}
const MemoizeSpy = defineModule({ availableLocales: spyAvailableLocales });

class MemoizeBackend extends Simple {
  spyCalls: number | null = null;
}
include(MemoizeBackend, MemoizeSpy);
include(MemoizeBackend, Memoize);

function testLookup(
  this: unknown,
  locale: string,
  key: unknown,
  scope: unknown = [],
  options: Record<string, unknown> = {},
): string {
  const keys = normalizeKeys(locale, key, scope, options.separator as string | undefined);
  return rbInspect(keys.map((k) => toSym(k as string)));
}
const TestLookup = defineModule({ lookup: testLookup });

describe("I18nBackendMemoizeTest", () => {
  function spy(): Spy {
    return backend() as unknown as Spy;
  }

  beforeEach(async () => {
    await TestCase.setup();
    setBackend(new MemoizeBackend());
  });

  afterEach(async () => {
    await TestCase.teardown();
  });

  it("memoizes available locales", () => {
    spy().spyCalls = 0;
    expect(availableLocales()).toEqual(availableLocales());
    expect(spy().spyCalls).toBe(1);
  });

  it("resets available locales on reload!", async () => {
    availableLocales();
    spy().spyCalls = 0;
    await reloadBang();
    expect(availableLocales()).toEqual(availableLocales());
    expect(spy().spyCalls).toBe(1);
  });

  it("resets available locales on store translations", () => {
    availableLocales();
    spy().spyCalls = 0;
    backend().storeTranslations("copa", { ca: ":bana" } as unknown as TranslationData);
    expect(availableLocales()).toEqual(availableLocales());
    expect(availableLocales().includes("copa")).toBeTruthy();
    expect(spy().spyCalls).toBe(1);
  });

  it("eager load", async () => {
    await eagerLoadBang();
    spy().spyCalls = 0;
    expect(availableLocales()).toEqual(availableLocales());
    expect(spy().spyCalls).toBe(0);
  });

  it("lookup concurrent consistency", async () => {
    class backendImpl extends Simple {}
    include(backendImpl, TestLookup);
    include(backendImpl, Memoize);
    const backend = new backendImpl();

    (backend as unknown as { memoizedLookup(): Map<string, unknown> }).memoizedLookup();

    const scope = [":scoped", ":sample"];
    expect(backend.translate("foo", scope as never)).toBe("[:foo, :scoped, :sample]");

    const threads: Thread[] = [];
    for (let i = 0; i < 30; i++) {
      threads.push(
        new Thread(() => {
          backend.translate("bar", scope as never);
          backend.translate(":baz", scope as never);
        }),
      );
    }
    for (const thread of threads) await thread.join();

    const memoizedLookup = (
      backend as unknown as { memoizedLookup(): Map<string, unknown> }
    ).memoizedLookup();
    expect(
      memoizedLookup.size,
      `NON-THREAD-SAFE lookup memoization backend: ${memoizedLookup.constructor.name}`,
    ).toBe(3);
  });
});
