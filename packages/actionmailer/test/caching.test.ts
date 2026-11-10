import type {} from "@blazetrails/vitest-matchers";
import { beforeEach, describe, expect, it } from "vitest";
import {
  MemoryStore,
  Notifications,
  extend,
  htmlSafe,
  isHtmlSafe,
} from "@blazetrails/activesupport";
import { assertNothingRaised } from "@blazetrails/activesupport/testing/assertions";
import { stub } from "@blazetrails/activesupport/testing/method-call-assertions";
import { CacheHelper, Digestor, OutputBuffer } from "@blazetrails/actionview";
import { Time } from "@blazetrails/date";
import { rbFSend } from "@blazetrails/ruby-compat";
import type { Message } from "@blazetrails/mail";
import { Base } from "../lib/base.js";
import { CachingMailer } from "./support/mailers/caching-mailer.js";

type Fn = (...args: unknown[]) => Promise<unknown>;
type CachingMailerHost = Record<string, unknown> & {
  performCaching: boolean;
  enableFragmentCacheLogging: boolean;
  cacheStore: MemoryStore;
  lookupContext: Parameters<typeof Digestor.digest>[0]["finder"];
  readFragment: Fn;
  writeFragment: Fn;
  fragmentExist: Fn;
  expireFragment: Fn;
  viewContext(): object;
  viewCacheDependencies(): unknown[];
  viewCacheDependency(block: () => string): void;
  fragmentCache(): Promise<Message>;
  fragmentCacheInPartials(): Promise<Message>;
  skipFragmentCacheDigesting(): Promise<Message>;
  fragmentCachingOptions(): Promise<Message>;
  multipartCache(): Promise<Message>;
};

class FragmentCachingMailer extends Base {
  static {
    this.abstractBang();
  }

  someAction() {}
}

describe("FragmentCachingTest", () => {
  let store: MemoryStore;
  let mailer: CachingMailerHost;

  beforeEach(() => {
    store = new MemoryStore();
    mailer = new FragmentCachingMailer() as unknown as CachingMailerHost;
    mailer.performCaching = true;
    mailer.cacheStore = store;
  });

  it("read fragment with caching enabled", async () => {
    await store.write("views/name", "value");
    expect(String(await mailer.readFragment("name"))).toBe("value");
  });

  it("read fragment with caching disabled", async () => {
    mailer.performCaching = false;
    await store.write("views/name", "value");
    expect(await mailer.readFragment("name")).toBeNull();
  });

  it("fragment exist with caching enabled", async () => {
    await store.write("views/name", "value");
    expect(await mailer.fragmentExist("name")).toBeTruthy();
    expect(await mailer.fragmentExist("other_name")).toBeFalsy();
  });

  it("fragment exist with caching disabled", async () => {
    mailer.performCaching = false;
    await store.write("views/name", "value");
    expect(await mailer.fragmentExist("name")).toBeFalsy();
    expect(await mailer.fragmentExist("other_name")).toBeFalsy();
  });

  it("write fragment with caching enabled", async () => {
    expect(await store.read("views/name")).toBeNull();
    expect(await mailer.writeFragment("name", "value")).toBe("value");
    expect(await store.read("views/name")).toBe("value");
  });

  it("write fragment with caching disabled", async () => {
    expect(await store.read("views/name")).toBeNull();
    mailer.performCaching = false;
    expect(await mailer.writeFragment("name", "value")).toBe("value");
    expect(await store.read("views/name")).toBeNull();
  });

  it("expire fragment with simple key", async () => {
    await store.write("views/name", "value");
    await mailer.expireFragment("name");
    expect(await store.read("views/name")).toBeNull();
  });

  it("expire fragment with regexp", async () => {
    await store.write("views/name", "value");
    await store.write("views/another_name", "another_value");
    await store.write("views/primalgrasp", "will not expire ;-)");

    await mailer.expireFragment(/name/);

    expect(await store.read("views/name")).toBeNull();
    expect(await store.read("views/another_name")).toBeNull();
    expect(await store.read("views/primalgrasp")).toBe("will not expire ;-)");
  });

  it("fragment for", async () => {
    await store.write("views/expensive", "fragment content");
    let fragmentComputed = false;

    const viewContext = mailer.viewContext();

    const buffer = htmlSafe("generated till now -> ");
    buffer.concat(
      await rbFSend(viewContext, "fragmentFor", "expensive", undefined, () => {
        fragmentComputed = true;
      }),
    );

    expect(fragmentComputed).toBeFalsy();
    expect(buffer.toString()).toBe("generated till now -> fragment content");
  });

  it("html safety", async () => {
    expect(await store.read("views/name")).toBeNull();
    const content = htmlSafe("value");
    expect(String(await mailer.writeFragment("name", content))).toBe(content.toString());

    const cached = await store.read("views/name");
    expect(cached).toBe(content.toString());
    expect(typeof cached).toBe("string");

    const htmlSafeValue = await mailer.readFragment("name");
    expect(String(htmlSafeValue)).toBe(content.toString());
    expect(isHtmlSafe(htmlSafeValue)).toBeTruthy();
  });
});

describe("FunctionalFragmentCachingTest", () => {
  let store: MemoryStore;
  let mailer: CachingMailerHost;

  beforeEach(() => {
    store = new MemoryStore();
    mailer = new CachingMailer() as unknown as CachingMailerHost;
    mailer.performCaching = true;
    mailer.cacheStore = store;
  });

  function templateDigest(name: string, format: string): unknown {
    return Digestor.digest({ name, format, finder: mailer.lookupContext });
  }

  it("fragment caching", async () => {
    const email = await mailer.fragmentCache();
    const expectedBody = '"Welcome"';

    expect(email.body().encoded()).toMatch(expectedBody);
    expect(
      String(
        await store.read(
          `views/caching-mailer/fragment-cache:${templateDigest("caching-mailer/fragment-cache", "html")}/caching`,
        ),
      ),
    ).toMatch(expectedBody);
  });

  it("fragment caching in partials", async () => {
    const email = await mailer.fragmentCacheInPartials();
    const expectedBody = "Old fragment caching in a partial";
    expect(email.body().encoded()).toMatch(expectedBody);

    expect(
      String(
        await store.read(
          `views/caching-mailer/_partial:${templateDigest("caching-mailer/_partial", "html")}/caching`,
        ),
      ),
    ).toMatch(expectedBody);
  });

  it("skip fragment cache digesting", async () => {
    const email = await mailer.skipFragmentCacheDigesting();
    const expectedBody = "No Digest";

    expect(email.body().encoded()).toMatch(expectedBody);
    expect(String(await store.read("views/no_digest"))).toMatch(expectedBody);
  });

  it("fragment caching options", async () => {
    const time = Time.now();
    const email = await mailer.fragmentCachingOptions();
    const expectedBody = "No Digest";

    expect(email.body().encoded()).toMatch(expectedBody);
    await stub(Time, "now", time.plus(11), [], async () => {
      expect(await store.read("views/no_digest")).toBeNull();
    });
  });

  it("multipart fragment caching", async () => {
    const email = await mailer.multipartCache();

    const expectedTextBody = '"Welcome text"';
    const expectedHtmlBody = '"Welcome html"';
    const encodedBody = email.body().encoded();
    expect(encodedBody).toMatch(expectedTextBody);
    expect(encodedBody).toMatch(expectedHtmlBody);
    expect(String(await store.read("views/text_caching"))).toMatch(expectedTextBody);
    expect(String(await store.read("views/html_caching"))).toMatch(expectedHtmlBody);
  });

  it("fragment cache instrumentation", async () => {
    mailer.enableFragmentCacheLogging = true;
    let payload: Record<string, unknown> | null = null;

    const subscriber = (event: { payload: Record<string, unknown> }) => {
      payload = event.payload;
    };

    try {
      await Notifications.subscribed(subscriber, "read_fragment.action_mailer", async () => {
        await mailer.fragmentCache();
      });

      expect(payload!.mailer).toBe("caching_mailer");
      expect(payload!.key).toEqual([
        "views",
        `caching-mailer/fragment-cache:${templateDigest("caching-mailer/fragment-cache", "html")}`,
        "caching",
      ]);
    } finally {
      mailer.enableFragmentCacheLogging = true;
    }
  });
});

describe("CacheHelperOutputBufferTest", () => {
  class MockController {
    readFragment(_name: unknown, _options: unknown) {
      return false;
    }

    writeFragment(_name: unknown, fragment: unknown, _options: unknown) {
      return fragment;
    }
  }

  it("output buffer", async () => {
    const outputBuffer = new OutputBuffer();
    const controller = new MockController();
    const cacheHelper = class {
      static get controller(): unknown {
        return undefined;
      }
      static get outputBuffer(): unknown {
        return undefined;
      }
      static set outputBuffer(_value: unknown) {}
    };
    extend(cacheHelper, CacheHelper);

    await stub(cacheHelper, "controller", controller, [], async () => {
      await stub(cacheHelper, "outputBuffer", outputBuffer, [], async () => {
        await assertNothingRaised(async () => {
          await rbFSend(
            cacheHelper,
            "fragmentFor",
            "Test fragment name",
            "Test fragment",
            () => null,
          );
        });
      });
    });
  });
});

describe("ViewCacheDependencyTest", () => {
  class NoDependenciesMailer extends Base {}
  class HasDependenciesMailer extends Base {
    static {
      (this as unknown as CachingMailerHost).viewCacheDependency(() => "trombone");
      (this as unknown as CachingMailerHost).viewCacheDependency(() => "flute");
    }
  }

  it("view cache dependencies are empty by default", () => {
    expect(
      (new NoDependenciesMailer() as unknown as CachingMailerHost).viewCacheDependencies(),
    ).toBeEmpty();
  });

  it("view cache dependencies are listed in declaration order", () => {
    expect(
      (new HasDependenciesMailer() as unknown as CachingMailerHost).viewCacheDependencies(),
    ).toEqual(["trombone", "flute"]);
  });
});
