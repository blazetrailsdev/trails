import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  FixtureResolver,
  LookupContext,
  MissingTemplate,
  Rendering as ActionViewRendering,
} from "@blazetrails/actionview";
import {
  assertNil,
  assertNothingRaised,
  assertNotIncludes,
  Duration,
  include,
  isBlank,
  isPresent,
  maxBy,
} from "@blazetrails/activesupport";
import { Utils } from "@blazetrails/rack";
import { Time } from "@blazetrails/date";
import {
  ArgumentError,
  File,
  rbFPublicSend,
  rbModConstSet,
  rbObjIvarGet,
  RuntimeError,
  stringToSym,
  Struct,
  type StructInstance,
  Tempfile,
  toI,
} from "@blazetrails/ruby-compat";
import { Rendering as AbstractControllerRendering } from "../../abstract-controller/rendering.js";
import { deprecator } from "../../action-dispatch/deprecator.js";
import type { RouteSet } from "../../action-dispatch/routing/route-set.js";
import { Base } from "../base.js";
import { Metal } from "../metal.js";
import { MissingExactTemplate, UnknownFormat } from "../metal/exceptions.js";
import { type Buffer as LiveBuffer, Live } from "../metal/live.js";
import * as Rendering from "../metal/rendering.js";
import type { Parameters } from "../metal/strong-parameters.js";
import { TestCase } from "../test-case.js";
import "../../test-helpers/abstract-unit.js";
import { Customer } from "../../test-helpers/lib/controller/fake-models.js";
import { EtagHelper } from "../../test-helpers/support/etag-helper.js";

class TestControllerWithExtraEtags extends Base {
  static {
    this.viewPaths([
      new FixtureResolver({
        "test/withImplicitTemplate.tse": "Hello explicitly!",
        "test/hello_world.tse": "Hello world!",
      }),
    ]);
  }

  static override controllerPath(): string {
    return "test";
  }

  static {
    this.etag(() => null);
    this.etag(() => "ab");
    this.etag(() => ":cde");
    this.etag(() => [":f"]);
    this.etag(() => null);
  }

  async fresh(): Promise<void> {
    if (this.isStale(null, { etag: "123", template: false })) await this.render({ plain: "stale" });
  }

  async array(): Promise<void> {
    if (this.isStale(null, { etag: ["1", "2", "3"], template: false })) {
      await this.render({ plain: "stale" });
    }
  }

  async strong(): Promise<void> {
    if (this.isStale(null, { strongEtag: "strong", template: false })) {
      await this.render({ plain: "stale" });
    }
  }

  async withTemplate(): Promise<void> {
    if (this.isStale(null, { template: "test/hello_world" })) {
      await this.render({ plain: "stale" });
    }
  }

  withImplicitTemplate(): void {
    this.freshWhen(null, { etag: "123" });
  }
}

class ImplicitRenderTestController extends Base {
  static {
    this.viewPaths([
      new FixtureResolver({
        "implicit_render_test/helloWorld.tse": "Hello world!",
        "implicit_render_test/emptyActionWithTemplate.html.tse":
          "<h1>Empty action rendered this implicitly.</h1>\n",
      }),
    ]);
  }

  emptyAction(): void {}

  emptyActionWithTemplate(): void {}
}

const Namespaced = { name: "Namespaced" } as {
  name: string;
  ImplicitRenderTestController: typeof Base;
};
rbModConstSet(
  Namespaced,
  "ImplicitRenderTestController",
  class extends Base {
    static {
      this.viewPaths([
        new FixtureResolver({
          "namespaced/implicit_render_test/helloWorld.tse": "Hello world!",
        }),
      ]);
    }

    helloWorld(): void {
      this.freshWhen(null, { etag: "abc" });
    }
  },
);

class InheritedRenderTestController extends ImplicitRenderTestController {
  helloWorld(): void {
    this.freshWhen(null, { etag: "abc" });
  }
}

class TestController extends Base {
  declare variableForLayout: unknown;

  static {
    this.protectFromForgery();

    this.beforeAction("setVariableForLayout");

    this.layout(":determineLayout");
  }

  private name(): null {
    return null;
  }

  static {
    this.helperMethod("name");
  }

  helloWorld(): void {}

  async conditionalHello(): Promise<void> {
    if (
      this.isStale(null, {
        lastModified: Time.now().utc().beginningOfDay(),
        etag: [":foo", 123],
        cacheControl: { noCache: true },
      })
    ) {
      await this.render({ action: "hello_world" });
    }
  }

  async conditionalHelloWithRecord(): Promise<void> {
    const record = new (Struct.new("updatedAt", "cacheKey"))(
      Time.now().utc().beginningOfDay(),
      "foo/123",
    );

    if (this.isStale(record)) {
      await this.render({ action: "hello_world" });
    }
  }

  async conditionalHelloWithArrayOfRecords(): Promise<void> {
    const record = new (Struct.new("updatedAt", "cacheKey"))(
      Time.now().utc().beginningOfDay(),
      "foo/123",
    );
    const oldRecord = new (Struct.new("updatedAt", "cacheKey"))(
      Time.now().utc().beginningOfDay().yesterday(),
      "bar/123",
    );

    if (this.isStale([record, oldRecord])) {
      await this.render({ action: "hello_world" });
    }
  }

  async dynamicRender(): Promise<void> {
    await this.render(this.params.get("id") as string);
  }

  async dynamicRenderPermit(): Promise<void> {
    await this.render((this.params.get("id") as Parameters).permit("file") as never);
  }

  async dynamicRenderWithFile(): Promise<void> {
    const file = this.params.get("id") as string;
    await this.render({ file });
  }

  static Collection = class Collection {
    records: StructInstance[];

    constructor(records: StructInstance[]) {
      this.records = records;
    }

    maximum(attribute: string): unknown {
      return rbFPublicSend(
        maxBy(this.records, (record) => rbFPublicSend(record, attribute) as number),
        attribute,
      );
    }
  };

  async conditionalHelloWithCollectionOfRecords(): Promise<void> {
    const ts = Time.now().utc().beginningOfDay();

    const record = new (Struct.new("updatedAt", "cacheKey"))(ts, "foo/123");
    const oldRecord = new (Struct.new("updatedAt", "cacheKey"))(
      ts.minusWithCoercion(Duration.days(1)) as Time,
      "bar/123",
    );

    if (this.isStale(new TestController.Collection([record, oldRecord]))) {
      await this.render({ action: "hello_world" });
    }
  }

  async conditionalHelloWithExpiresIn(): Promise<void> {
    this.expiresIn(Duration.seconds(60.1));
    await this.render({ action: "hello_world" });
  }

  async conditionalHelloWithExpiresInWithPublic(): Promise<void> {
    this.expiresIn(Duration.minutes(1), { public: true });
    await this.render({ action: "hello_world" });
  }

  async conditionalHelloWithExpiresInWithMustRevalidate(): Promise<void> {
    this.expiresIn(Duration.minutes(1), { mustRevalidate: true });
    await this.render({ action: "hello_world" });
  }

  async conditionalHelloWithExpiresInWithPublicAndMustRevalidate(): Promise<void> {
    this.expiresIn(Duration.minutes(1), { public: true, mustRevalidate: true });
    await this.render({ action: "hello_world" });
  }

  async conditionalHelloWithExpiresInWithStaleWhileRevalidate(): Promise<void> {
    this.expiresIn(Duration.minutes(1), {
      public: true,
      staleWhileRevalidate: Duration.minutes(5),
    });
    await this.render({ action: "hello_world" });
  }

  async conditionalHelloWithExpiresInWithStaleIfError(): Promise<void> {
    this.expiresIn(Duration.minutes(1), { public: true, staleIfError: Duration.minutes(5) });
    await this.render({ action: "hello_world" });
  }

  async conditionalHelloWithExpiresInWithImmutable(): Promise<void> {
    this.expiresIn(Duration.minutes(1), { public: true, immutable: true });
    await this.render({ action: "hello_world" });
  }

  async conditionalHelloWithExpiresInWithPublicWithMoreKeys(): Promise<void> {
    this.expiresIn(Duration.minutes(1), { public: true, "s-maxage": Duration.hours(5) });
    await this.render({ action: "hello_world" });
  }

  async conditionalHelloWithExpiresInWithPublicWithMoreKeysOldSyntax(): Promise<void> {
    this.expiresIn(Duration.minutes(1), {
      public: true,
      private: null,
      "s-maxage": Duration.hours(5),
    });
    await this.render({ action: "hello_world" });
  }

  async conditionalHelloWithExpiresNow(): Promise<void> {
    this.expiresNow();
    await this.render({ action: "hello_world" });
  }

  async conditionalHelloWithCacheControlHeaders(): Promise<void> {
    this.response.headers.set("Cache-Control", "no-transform");
    this.expiresNow();
    await this.render({ action: "hello_world" });
  }

  async conditionalHelloWithExpiresAndConflicitingCacheControlHeaders(): Promise<void> {
    this.response.headers.set("Cache-Control", "no-cache, must-revalidate");
    this.expiresNow();
    await this.render({ action: "hello_world" });
  }

  async conditionalHelloWithoutExpiresAndConflicitingCacheControlHeaders(): Promise<void> {
    this.response.headers.set("Cache-Control", "no-cache, must-revalidate");
    await this.render({ action: "hello_world" });
  }

  async conditionalHelloWithoutExpiresAndPublicHeader(): Promise<void> {
    this.response.headers.set("Cache-Control", "public, no-cache");
    await this.render({ action: "hello_world" });
  }

  async conditionalHelloWithBangs(): Promise<void> {
    await this.render({ action: "hello_world" });
  }
  static {
    this.beforeAction("handleLastModifiedAndEtags", { only: "conditionalHelloWithBangs" });
  }

  handleLastModifiedAndEtags(): void {
    this.freshWhen(null, {
      lastModified: Time.now().utc().beginningOfDay(),
      etag: [":foo", 123],
      public: false,
      cacheControl: { noCache: true, public: true },
    });
  }

  headCreated(): void {
    this.head(":created");
  }

  headCreatedWithApplicationJsonContentType(): void {
    this.head(":created", { contentType: "application/json" });
  }

  headOkWithImagePngContentType(): void {
    this.head(":ok", { contentType: "image/png" });
  }

  headOkWithStringKeyContentType(): void {
    this.head(":ok", { "Content-Type": "application/pdf" });
  }

  headWithLocationHeader(): void {
    this.head(":ok", { location: "/foo" });
  }

  headWithLocationObject(): void {
    this.head(":ok", { location: new Customer("david", 1) });
  }

  headWithSymbolicStatus(): void {
    this.head(stringToSym(this.params.get("status") as string));
  }

  headWithIntegerStatus(): void {
    this.head(toI(this.params.get("status") as string) as number);
  }

  headWithStringStatus(): void {
    this.head(this.params.get("status") as string);
  }

  headWithCustomHeader(): void {
    this.head(":ok", { x_custom_header: "something" });
  }

  headWithWwwAuthenticateHeader(): void {
    this.head(":ok", { "WWW-Authenticate": "something" });
  }

  headWithStatusCodeFirst(): void {
    this.head(":forbidden", { x_custom_header: "something" });
  }

  headAndReturn(): void {
    if (this.head(":ok")) return;
    throw new RuntimeError("should not reach this line");
  }

  headWithNoContent(): void {
    this.response.headers.set("Content-Type", "dummy");
    this.response.headers.set("Content-Length", 42 as never);

    this.head(204);
  }

  async headDefaultContentType(): Promise<void> {
    this.request.formats = [];

    await this.respondTo((format) => {
      format.any(() => {
        this.head(200);
      });
    });
  }

  async cacheControlDefaultHeaderWithExtrasPartiallyOverriddenByExpiresIn(): Promise<void> {
    this.response.headers.set(
      "Cache-Control",
      "max-age=120, public, s-maxage=60, proxy-revalidate",
    );
    this.expiresIn(Duration.seconds(300), { public: true });
    await this.render({ action: "hello_world" });
  }

  async cacheControlNoStoreOverriddenByExpiresIn(): Promise<void> {
    this.response.headers.set("Cache-Control", "no-store");
    this.expiresIn(Duration.seconds(60), { public: true });
    await this.render({ action: "hello_world" });
  }

  async cacheControlNoStoreOverriddenByExpiresNow(): Promise<void> {
    this.response.headers.set("Cache-Control", "no-store");
    this.expiresNow();
    await this.render({ action: "hello_world" });
  }

  private setVariableForLayout(): void {
    this.variableForLayout = null;
  }

  private determineLayout(): string | undefined {
    switch (this.actionName) {
      case "helloWorld":
      case "layoutTest":
      case "renderingWithoutLayout":
      case "renderingNothingOnLayout":
      case "renderTextHelloWorld":
      case "renderTextHelloWorldWithLayout":
      case "helloWorldWithLayoutFalse":
      case "partialOnly":
      case "accessingParamsInTemplate":
      case "accessingParamsInTemplateWithLayout":
      case "renderWithExplicitTemplate":
      case "renderWithExplicitStringTemplate":
      case "updatePage":
      case "updatePageWithInstanceVariables":
        return "layouts/standard";
      case "actionTalkToLayout":
      case "layoutOverridingLayout":
        return "layouts/talk_from_action";
      case "renderImplicitHtmlTemplateFromXhrRequest":
        return this.request.xhr ? "layouts/xhr" : "layouts/standard";
    }
  }
}

async function modifyTemplate(
  tc: TestCase,
  name: string,
  block: () => Promise<void>,
): Promise<void> {
  const hash = rbObjIvarGet((tc.controller as Base).viewPaths.at(0)!, "@hash") as Record<
    string,
    string
  >;
  const key = name + ".tse";
  const original = hash[key];
  hash[key] = `${original} Modified!`;
  LookupContext.DetailsKey.clear();
  try {
    await block();
  } finally {
    hash[key] = original;
    LookupContext.DetailsKey.clear();
  }
}

describe("ExpiresInRenderTest", () => {
  let tc: TestCase;

  beforeEach(async ({ task }) => {
    tc = new TestCase(task.name);
    tc.controller = new TestController();
    await tc.beforeSetup();
    Base.viewPaths().paths.forEach((path) => path.clearCache!());
  });

  it("dynamic render with file", async () => {
    expect(
      await File.isExistAsync(
        File.expandPath("../../test-helpers/abstract-unit.ts", import.meta.dirname),
      ),
    ).toBeTruthy();
    await expect(
      tc.get("dynamicRenderWithFile", { params: { id: "../\\../test-helpers/abstract-unit.ts" } }),
    ).rejects.toThrow(ArgumentError);
  });

  it("dynamic render with absolute path", async () => {
    const file = Tempfile.new("name");
    try {
      file.write("secrets!");
      file.flush();
      await expect(tc.get("dynamicRender", { params: { id: file.path() } })).rejects.toThrow(
        MissingTemplate,
      );
    } finally {
      file.close();
      file.unlink();
    }
  });

  it("dynamic render", async () => {
    expect(
      await File.isExistAsync(
        File.expandPath("../../test-helpers/abstract-unit.ts", import.meta.dirname),
      ),
    ).toBeTruthy();
    await expect(
      tc.get("dynamicRender", { params: { id: "../\\../test-helpers/abstract-unit.ts" } }),
    ).rejects.toThrow(MissingTemplate);
  });

  // BLOCKED: render-permitted-parameters-are-not-read-as-the-options-hash
  it.skip("permitted dynamic render file hash", async () => {
    expect(
      await File.isExistAsync(
        File.expandPath("../../test-helpers/abstract-unit.ts", import.meta.dirname),
      ),
    ).toBeTruthy();
    await expect(
      tc.get("dynamicRenderPermit", {
        params: { id: { file: "../\\../test-helpers/abstract-unit.ts" } },
      }),
    ).rejects.toThrow(ArgumentError);
  });

  it("dynamic render file hash", async () => {
    await expect(
      tc.get("dynamicRender", {
        params: { id: { file: "../\\../test-helpers/abstract-unit.ts" } },
      }),
    ).rejects.toThrow(ArgumentError);
  });

  it("expires in header", async () => {
    await tc.get("conditionalHelloWithExpiresIn");
    expect(tc.response.headers.get("Cache-Control")).toBe("max-age=60, private");
  });

  it("expires in header with public", async () => {
    await tc.get("conditionalHelloWithExpiresInWithPublic");
    expect(tc.response.headers.get("Cache-Control")).toBe("max-age=60, public");
  });

  it("expires in header with must revalidate", async () => {
    await tc.get("conditionalHelloWithExpiresInWithMustRevalidate");
    expect(tc.response.headers.get("Cache-Control")).toBe("max-age=60, private, must-revalidate");
  });

  it("expires in header with public and must revalidate", async () => {
    await tc.get("conditionalHelloWithExpiresInWithPublicAndMustRevalidate");
    expect(tc.response.headers.get("Cache-Control")).toBe("max-age=60, public, must-revalidate");
  });

  it("expires in header with stale while revalidate", async () => {
    await tc.get("conditionalHelloWithExpiresInWithStaleWhileRevalidate");
    expect(tc.response.headers.get("Cache-Control")).toBe(
      "max-age=60, public, stale-while-revalidate=300",
    );
  });

  it("expires in header with stale if error", async () => {
    await tc.get("conditionalHelloWithExpiresInWithStaleIfError");
    expect(tc.response.headers.get("Cache-Control")).toBe("max-age=60, public, stale-if-error=300");
  });

  it("expires in header with immutable", async () => {
    await tc.get("conditionalHelloWithExpiresInWithImmutable");
    expect(tc.response.headers.get("Cache-Control")).toBe("max-age=60, public, immutable");
  });

  it("expires in header with additional headers", async () => {
    await tc.get("conditionalHelloWithExpiresInWithPublicWithMoreKeys");
    expect(tc.response.headers.get("Cache-Control")).toBe("max-age=60, public, s-maxage=18000");
  });

  it("expires in old syntax", async () => {
    await tc.get("conditionalHelloWithExpiresInWithPublicWithMoreKeysOldSyntax");
    expect(tc.response.headers.get("Cache-Control")).toBe("max-age=60, public, s-maxage=18000");
  });

  it("expires now", async () => {
    await tc.get("conditionalHelloWithExpiresNow");
    expect(tc.response.headers.get("Cache-Control")).toBe("no-cache");
  });

  it("expires now with cache control headers", async () => {
    await tc.get("conditionalHelloWithCacheControlHeaders");
    expect(tc.response.headers.get("Cache-Control")).toMatch(/no-cache/);
    expect(tc.response.headers.get("Cache-Control")).toMatch(/no-transform/);
  });

  it("expires now with conflicting cache control headers", async () => {
    await tc.get("conditionalHelloWithExpiresAndConflicitingCacheControlHeaders");
    expect(tc.response.headers.get("Cache-Control")).toBe("no-cache");
  });

  it("no expires now with conflicting cache control headers", async () => {
    await tc.get("conditionalHelloWithoutExpiresAndConflicitingCacheControlHeaders");
    expect(tc.response.headers.get("Cache-Control")).toBe("no-cache");
  });

  it("no expires now with public", async () => {
    await tc.get("conditionalHelloWithoutExpiresAndPublicHeader");
    expect(tc.response.headers.get("Cache-Control")).toBe("public, no-cache");
  });

  it("date header when expires in", async () => {
    const time = Time.mktime(2011, 10, 30);
    const now = vi.spyOn(Time, "now").mockReturnValue(time);
    try {
      await tc.get("conditionalHelloWithExpiresIn");
      expect(tc.response.headers.get("Date")).toBe(Time.now().httpdate());
    } finally {
      now.mockRestore();
    }
  });

  it("cache control default header with extras partially overridden by expires in", async () => {
    await tc.get("cacheControlDefaultHeaderWithExtrasPartiallyOverriddenByExpiresIn");
    expect(tc.response.headers.get("Cache-Control")).toBe(
      "max-age=300, public, s-maxage=60, proxy-revalidate",
    );
  });

  it("cache control no store overridden by expires in", async () => {
    await tc.get("cacheControlNoStoreOverriddenByExpiresIn");
    expect(tc.response.headers.get("Cache-Control")).toBe("max-age=60, public");
  });

  it("cache control no store overridden by expires now", async () => {
    await tc.get("cacheControlNoStoreOverriddenByExpiresNow");
    expect(tc.response.headers.get("Cache-Control")).toBe("no-cache");
  });
});

describe("LastModifiedRenderTest", () => {
  let tc: TestCase;
  let lastModified: string;
  const assertResponse = (type: number | string): void => tc.assertResponse(type);

  beforeEach(async ({ task }) => {
    tc = new TestCase(task.name);
    tc.controller = new TestController();
    await tc.beforeSetup();
    lastModified = Time.now().utc().beginningOfDay().httpdate();
  });

  it("responds with last modified", async () => {
    await tc.get("conditionalHello");
    expect(tc.response.headers.get("Last-Modified")).toBe(lastModified);
  });

  it("request not modified", async () => {
    tc.request.setIfModifiedSince(lastModified);
    await tc.get("conditionalHello");
    expect(toI(tc.response.status)).toBe(304);
    expect(isBlank(tc.response.body)).toBe(true);
    expect(tc.response.headers.get("Last-Modified")).toBe(lastModified);
  });

  it("request not modified but etag differs", async () => {
    tc.request.setIfModifiedSince(lastModified);
    tc.request.setIfNoneMatch('"234"');
    await tc.get("conditionalHello");
    assertResponse("success");
  });

  it("request modified", async () => {
    tc.request.setIfModifiedSince("Thu, 16 Jul 2008 00:00:00 GMT");
    await tc.get("conditionalHello");
    expect(toI(tc.response.status)).toBe(200);
    expect(isPresent(tc.response.body)).toBe(true);
    expect(tc.response.headers.get("Last-Modified")).toBe(lastModified);
  });

  it("responds with custom cache control headers", async () => {
    await tc.get("conditionalHello");
    expect(tc.response.headers.get("Cache-Control")).toBe("no-cache");
  });

  it("responds with last modified with record", async () => {
    await tc.get("conditionalHelloWithRecord");
    expect(tc.response.headers.get("Last-Modified")).toBe(lastModified);
  });

  it("request not modified with record", async () => {
    tc.request.setIfModifiedSince(lastModified);
    await tc.get("conditionalHelloWithRecord");
    expect(toI(tc.response.status)).toBe(304);
    expect(isBlank(tc.response.body)).toBe(true);
    expect(tc.response.etag).not.toBeNull();
    expect(tc.response.headers.get("Last-Modified")).toBe(lastModified);
  });

  it("request not modified but etag differs with record", async () => {
    tc.request.setIfModifiedSince(lastModified);
    tc.request.setIfNoneMatch('"234"');
    await tc.get("conditionalHelloWithRecord");
    assertResponse("success");
  });

  it("request modified with record", async () => {
    tc.request.setIfModifiedSince("Thu, 16 Jul 2008 00:00:00 GMT");
    await tc.get("conditionalHelloWithRecord");
    expect(toI(tc.response.status)).toBe(200);
    expect(isPresent(tc.response.body)).toBe(true);
    expect(tc.response.headers.get("Last-Modified")).toBe(lastModified);
  });

  // BLOCKED: fresh-when-array-of-records-has-no-enumerable-maximum
  it.skip("responds with last modified with array of records", async () => {
    await tc.get("conditionalHelloWithArrayOfRecords");
    expect(tc.response.headers.get("Last-Modified")).toBe(lastModified);
  });

  // BLOCKED: fresh-when-array-of-records-has-no-enumerable-maximum
  it.skip("request not modified with array of records", async () => {
    tc.request.setIfModifiedSince(lastModified);
    await tc.get("conditionalHelloWithArrayOfRecords");
    expect(toI(tc.response.status)).toBe(304);
    expect(isBlank(tc.response.body)).toBe(true);
    expect(tc.response.headers.get("Last-Modified")).toBe(lastModified);
  });

  it("request not modified but etag differs with array of records", async () => {
    tc.request.setIfModifiedSince(lastModified);
    tc.request.setIfNoneMatch('"234"');
    await tc.get("conditionalHelloWithArrayOfRecords");
    assertResponse("success");
  });

  // BLOCKED: fresh-when-array-of-records-has-no-enumerable-maximum
  it.skip("request modified with array of records", async () => {
    tc.request.setIfModifiedSince("Thu, 16 Jul 2008 00:00:00 GMT");
    await tc.get("conditionalHelloWithArrayOfRecords");
    expect(toI(tc.response.status)).toBe(200);
    expect(isPresent(tc.response.body)).toBe(true);
    expect(tc.response.headers.get("Last-Modified")).toBe(lastModified);
  });

  it("responds with last modified with collection of records", async () => {
    await tc.get("conditionalHelloWithCollectionOfRecords");
    expect(tc.response.headers.get("Last-Modified")).toBe(lastModified);
  });

  it("request not modified with collection of records", async () => {
    tc.request.setIfModifiedSince(lastModified);
    await tc.get("conditionalHelloWithCollectionOfRecords");
    expect(toI(tc.response.status)).toBe(304);
    expect(isBlank(tc.response.body)).toBe(true);
    expect(tc.response.headers.get("Last-Modified")).toBe(lastModified);
  });

  it("request not modified but etag differs with collection of records", async () => {
    tc.request.setIfModifiedSince(lastModified);
    tc.request.setIfNoneMatch('"234"');
    await tc.get("conditionalHelloWithCollectionOfRecords");
    assertResponse("success");
  });

  it("request modified with collection of records", async () => {
    tc.request.setIfModifiedSince("Thu, 16 Jul 2008 00:00:00 GMT");
    await tc.get("conditionalHelloWithCollectionOfRecords");
    expect(toI(tc.response.status)).toBe(200);
    expect(isPresent(tc.response.body)).toBe(true);
    expect(tc.response.headers.get("Last-Modified")).toBe(lastModified);
  });

  it("request with bang gets last modified", async () => {
    await tc.get("conditionalHelloWithBangs");
    expect(tc.response.headers.get("Last-Modified")).toBe(lastModified);
    assertResponse("success");
  });

  it("request with bang obeys last modified", async () => {
    tc.request.setIfModifiedSince(lastModified);
    await tc.get("conditionalHelloWithBangs");
    assertResponse("not_modified");
  });

  it("last modified works with less than too", async () => {
    tc.request.setIfModifiedSince((Duration.years(5).ago() as Time).httpdate());
    await tc.get("conditionalHelloWithBangs");
    assertResponse("success");
  });

  it("last modified with custom cache control headers", async () => {
    await tc.get("conditionalHelloWithBangs");
    expect(tc.response.headers.get("Cache-Control")).toBe("public, no-cache");
    assertResponse("success");
  });
});

describe("EtagRenderTest", () => {
  let tc: TestCase;
  const assertResponse = (type: number | string): void => tc.assertResponse(type);
  const { weakEtag, strongEtag } = EtagHelper;

  beforeEach(async ({ task }) => {
    tc = new TestCase(task.name);
    tc.controller = new TestControllerWithExtraEtags();
    await tc.beforeSetup();
  });

  it("strong etag", async () => {
    tc.request.setIfNoneMatch(strongEtag(["strong", "ab", ":cde", [":f"]]));
    await tc.get("strong");
    assertResponse("not_modified");

    tc.request.setIfNoneMatch("*");
    await tc.get("strong");
    assertResponse("not_modified");

    tc.request.setIfNoneMatch('"strong"');
    await tc.get("strong");
    assertResponse("ok");

    tc.request.setIfNoneMatch(weakEtag(["strong", "ab", ":cde", [":f"]]));
    await tc.get("strong");
    assertResponse("ok");
  });

  it("multiple etags", async () => {
    tc.request.setIfNoneMatch(weakEtag(["123", "ab", ":cde", [":f"]]));
    await tc.get("fresh");
    assertResponse("not_modified");

    tc.request.setIfNoneMatch('"nomatch"');
    await tc.get("fresh");
    assertResponse("success");
  });

  it("array", async () => {
    tc.request.setIfNoneMatch(weakEtag([["1", "2", "3"], "ab", ":cde", [":f"]]));
    await tc.get("array");
    assertResponse("not_modified");

    tc.request.setIfNoneMatch('"nomatch"');
    await tc.get("array");
    assertResponse("success");
  });

  it("etag reflects template digest", async () => {
    await tc.get("withTemplate");
    assertResponse("ok");
    const etag = tc.response.etag;
    expect(etag).not.toBeNull();

    tc.request.setIfNoneMatch(etag!);
    await tc.get("withTemplate");
    assertResponse("not_modified");

    await modifyTemplate(tc, "test/hello_world", async () => {
      tc.request.setIfNoneMatch(etag!);
      await tc.get("withTemplate");
      assertResponse("ok");
      expect(tc.response.etag).not.toBe(etag);
    });
  });

  it("etag reflects implicit template digest", async () => {
    await tc.get("withImplicitTemplate");
    assertResponse("ok");
    const etag = tc.response.etag;
    expect(etag).not.toBeNull();

    tc.request.setIfNoneMatch(etag!);
    await tc.get("withImplicitTemplate");
    assertResponse("not_modified");

    await modifyTemplate(tc, "test/withImplicitTemplate", async () => {
      tc.request.setIfNoneMatch(etag!);
      await tc.get("withImplicitTemplate");
      assertResponse("ok");
      expect(tc.response.etag).not.toBe(etag);
    });
  });
});

describe("NamespacedEtagRenderTest", () => {
  let tc: TestCase;
  const assertResponse = (type: number | string): void => tc.assertResponse(type);

  beforeEach(async ({ task }) => {
    tc = new TestCase(task.name);
    tc.controller = new Namespaced.ImplicitRenderTestController();
    await tc.beforeSetup();
  });

  it("etag reflects template digest", async () => {
    await tc.get("helloWorld");
    assertResponse("ok");
    const etag = tc.response.etag;
    expect(etag).not.toBeNull();

    tc.request.setIfNoneMatch(etag!);
    await tc.get("helloWorld");
    assertResponse("not_modified");

    await modifyTemplate(tc, "namespaced/implicit_render_test/helloWorld", async () => {
      tc.request.setIfNoneMatch(etag!);
      await tc.get("helloWorld");
      assertResponse("ok");
      expect(tc.response.etag).not.toBe(etag);
    });
  });
});

describe("InheritedEtagRenderTest", () => {
  let tc: TestCase;
  const assertResponse = (type: number | string): void => tc.assertResponse(type);

  beforeEach(async ({ task }) => {
    tc = new TestCase(task.name);
    tc.controller = new InheritedRenderTestController();
    await tc.beforeSetup();
  });

  it("etag reflects template digest", async () => {
    await tc.get("helloWorld");
    assertResponse("ok");
    const etag = tc.response.etag;
    expect(etag).not.toBeNull();

    tc.request.setIfNoneMatch(etag!);
    await tc.get("helloWorld");
    assertResponse("not_modified");

    await modifyTemplate(tc, "implicit_render_test/helloWorld", async () => {
      tc.request.setIfNoneMatch(etag!);
      await tc.get("helloWorld");
      assertResponse("ok");
      expect(tc.response.etag).not.toBe(etag);
    });
  });
});

describe("MetalRenderTest", () => {
  // BLOCKED: action-controller-rendering-is-not-an-includable-module
  it.skip("access to logger in view", async ({ task }) => {
    class MetalTestController extends Metal {
      static {
        include(this, AbstractControllerRendering);
        include(this, ActionViewRendering);
        include(this, Rendering as never);
      }

      async accessingLoggerInTemplate(): Promise<void> {
        await (this as unknown as Base).render({ inline: "<%= rbObjClassname(logger()) %>" });
      }
    }

    const tc = new TestCase(task.name);
    tc.controller = new MetalTestController() as never;
    await tc.beforeSetup();

    await tc.get("accessingLoggerInTemplate");
    expect(tc.response.body).toBe("NilClass");
  });
});

describe("ActionControllerRenderTest", () => {
  // BLOCKED: action-controller-rendering-is-not-an-includable-module
  it.skip("direct render to string with body", async () => {
    class MinimalController extends Metal {
      static {
        include(this, AbstractControllerRendering);
        include(this, Rendering as never);
      }
    }

    const mc = new MinimalController() as unknown as Base;
    expect(await mc.renderToString({ body: ["Hello world!"] })).toBe("Hello world!");
  });
});

describe("ActionControllerBaseRenderTest", () => {
  it("direct render to string", async () => {
    const ac = new Base();
    expect(String(await ac.renderToString({ template: "test/hello_world" }))).toBe("Hello world!");
  });
});

describe("ImplicitRenderTest", () => {
  let tc: TestCase;
  const assertResponse = (type: number | string): void => tc.assertResponse(type);

  beforeEach(async ({ task }) => {
    tc = new TestCase(task.name);
    tc.controller = new ImplicitRenderTestController();
    await tc.beforeSetup();
  });

  it("implicit no content response as browser", async () => {
    await expect(tc.get("emptyAction")).rejects.toThrow(MissingExactTemplate);
  });

  it("implicit no content response as xhr", async () => {
    await tc.get("emptyAction", { xhr: true });
    assertResponse("no_content");
  });

  it("implicit success response with right format", async () => {
    await tc.get("emptyActionWithTemplate");
    expect(tc.response.body).toBe("<h1>Empty action rendered this implicitly.</h1>\n");
    assertResponse("success");
  });

  it("implicit unknown format response", async () => {
    await expect(tc.get("emptyActionWithTemplate", { format: "json" })).rejects.toThrow(
      UnknownFormat,
    );
  });
});

describe("HeadRenderTest", () => {
  let tc: TestCase;
  const assertResponse = (type: number | string): void => tc.assertResponse(type);

  beforeEach(async ({ task }) => {
    tc = new TestCase(task.name);
    tc.controller = new TestController();
    await tc.beforeSetup();
    tc.request.host = "www.nextangle.com";
  });

  it("head created", async () => {
    await tc.post("headCreated");
    expect(isBlank(tc.response.body)).toBe(true);
    assertResponse("created");
  });

  it("head created with application json content type", async () => {
    await tc.post("headCreatedWithApplicationJsonContentType");
    expect(isBlank(tc.response.body)).toBe(true);
    expect(tc.response.headers.get("Content-Type")).toBe("application/json");
    assertResponse("created");
  });

  it("head ok with image png content type", async () => {
    await tc.post("headOkWithImagePngContentType");
    expect(isBlank(tc.response.body)).toBe(true);
    expect(tc.response.headers.get("Content-Type")).toBe("image/png");
    assertResponse("ok");
  });

  it("head respect string content type", async () => {
    await tc.get("headOkWithStringKeyContentType");
    expect(tc.response.headers.get("Content-Type")).toBe("application/pdf");
  });

  it("head with location header", async () => {
    await tc.get("headWithLocationHeader");
    expect(isBlank(tc.response.body)).toBe(true);
    expect(tc.response.headers.get("Location")).toBe("/foo");
    assertResponse("ok");
  });

  it("head with location object", async () => {
    await tc.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        this.resources("customers");

        deprecator().silence(() => {
          this.get(":controller/:action");
        });
      });

      await tc.get("headWithLocationObject");
      expect(isBlank(tc.response.body)).toBe(true);
      expect(tc.response.headers.get("Location")).toBe("http://www.nextangle.com/customers/1");
      assertResponse("ok");
    });
  });

  it("head with custom header", async () => {
    await tc.get("headWithCustomHeader");
    expect(isBlank(tc.response.body)).toBe(true);
    expect(tc.response.headers.get("X-Custom-Header")).toBe("something");
    assertResponse("ok");
  });

  it("head with www authenticate header", async () => {
    await tc.get("headWithWwwAuthenticateHeader");
    expect(isBlank(tc.response.body)).toBe(true);
    expect(tc.response.headers.get("WWW-Authenticate")).toBe("something");
    assertResponse("ok");
  });

  it("head with symbolic status", async () => {
    await tc.get("headWithSymbolicStatus", { params: { status: "ok" } });
    expect(tc.response.status).toBe(200);
    assertResponse("ok");

    await tc.get("headWithSymbolicStatus", { params: { status: "not_found" } });
    expect(tc.response.status).toBe(404);
    assertResponse("not_found");

    await tc.get("headWithSymbolicStatus", { params: { status: "no_content" } });
    expect(tc.response.status).toBe(204);
    assertNotIncludes(tc.response.headers, "Content-Length");
    assertResponse("no_content");

    for (const [status, code] of Object.entries(Utils.SYMBOL_TO_STATUS_CODE)) {
      await tc.get("headWithSymbolicStatus", { params: { status: String(status) } });
      expect(tc.response.responseCode).toBe(code);
      assertResponse(status);
    }
  });

  it("head with integer status", async () => {
    for (const [code, message] of Object.entries(Utils.HTTP_STATUS_CODES)) {
      await tc.get("headWithIntegerStatus", { params: { status: String(code) } });
      expect(tc.response.message).toBe(message);
    }
  });

  it("head with no content", async () => {
    await tc.get("headWithNoContent");

    expect(tc.response.status).toBe(204);
    assertNil(tc.response.headers.get("Content-Type"));
    assertNil(tc.response.headers.get("Content-Length"));
  });

  it("head with string status", async () => {
    await tc.get("headWithStringStatus", { params: { status: "404 Eat Dirt" } });
    expect(tc.response.responseCode).toBe(404);
    expect(tc.response.message).toBe("Not Found");
    assertResponse("not_found");
  });

  it("head with status code first", async () => {
    await tc.get("headWithStatusCodeFirst");
    expect(tc.response.responseCode).toBe(403);
    expect(tc.response.message).toBe("Forbidden");
    expect(tc.response.headers.get("X-Custom-Header")).toBe("something");
    assertResponse("forbidden");
  });

  it("head returns truthy value", async () => {
    await assertNothingRaised(async () => {
      await tc.get("headAndReturn");
    });
  });

  it("head default content type", async () => {
    await tc.post("headDefaultContentType");
    expect(tc.response.headers.get("Content-Type")).toBe("text/html");
  });
});

class LiveTestController extends Base {
  static {
    include(this, Live);
  }

  testAction(): void {
    this.head(":ok");
  }
}

describe("LiveHeadRenderTest", () => {
  let tc: TestCase;

  beforeEach(async ({ task }) => {
    tc = new TestCase(task.name);
    tc.controller = new LiveTestController();
    await tc.beforeSetup();
  });

  // BLOCKED: live-process-takes-an-invented-run-action-parameter
  it.skip("live head ok", async () => {
    await tc.get("testAction", { format: "json" });

    (tc.response.stream as LiveBuffer).onError(() => {
      expect.fail("action should not raise any errors");
    });
    await new Promise((resolve) => setTimeout(resolve, 200));
  });
});

describe("HttpCacheForeverTest", () => {
  class HttpCacheForeverController extends Base {
    async cacheMeForever(): Promise<void> {
      let rendered: void | Promise<void> = undefined;
      this.httpCacheForever({ public: this.params.get("public") as boolean }, () => {
        rendered = this.render({ plain: "hello" });
      });
      await rendered;
    }
  }

  let tc: TestCase;
  const assertResponse = (type: number | string): void => tc.assertResponse(type);

  beforeEach(async ({ task }) => {
    tc = new TestCase(task.name);
    tc.controller = new HttpCacheForeverController();
    await tc.beforeSetup();
  });

  it("cache with public", async () => {
    await tc.get("cacheMeForever", { params: { public: true } });
    assertResponse("ok");
    expect(tc.response.headers.get("Cache-Control")).toBe(
      `max-age=${Duration.years(100)}, public, immutable`,
    );
    expect(tc.response.etag).not.toBeNull();
    expect(tc.response.isWeakEtag()).toBeTruthy();
  });

  it("cache with private", async () => {
    await tc.get("cacheMeForever");
    assertResponse("ok");
    expect(tc.response.headers.get("Cache-Control")).toBe(
      `max-age=${Duration.years(100)}, private, immutable`,
    );
    expect(tc.response.etag).not.toBeNull();
    expect(tc.response.isWeakEtag()).toBeTruthy();
  });

  it("cache response code with if modified since", async () => {
    await tc.get("cacheMeForever");
    assertResponse("ok");

    tc.request.setIfModifiedSince(tc.response.headers.get("Last-Modified") as string);
    await tc.get("cacheMeForever");
    assertResponse("not_modified");
  });

  it("cache response code with etag", async () => {
    await tc.get("cacheMeForever");
    assertResponse("ok");

    tc.request.setIfNoneMatch(tc.response.etag!);
    await tc.get("cacheMeForever");
    assertResponse("not_modified");
  });
});

describe("HttpCacheNoStoreTest", () => {
  class HttpCacheNoStoreController extends Base {
    async standaloneNoStoreCall(): Promise<void> {
      this.noStore();
      await this.render({ plain: "hello world" });
    }

    static {
      this.beforeAction((c) => (c as HttpCacheNoStoreController).noStore(), {
        only: "noStoreOverriddenByExpiresIn",
      });
    }
    async noStoreOverriddenByExpiresIn(): Promise<void> {
      this.expiresIn(Duration.seconds(30));
      await this.render({ plain: "hello world" });
    }

    static {
      this.beforeAction((c) => (c as HttpCacheNoStoreController).expiresIn(Duration.seconds(30)), {
        only: "expiresInOverriddenByNoStore",
      });
    }
    async expiresInOverriddenByNoStore(): Promise<void> {
      this.noStore();
      await this.render({ plain: "hello world" });
    }

    static {
      this.beforeAction((c) => (c as HttpCacheNoStoreController).noStore(), {
        only: "noStoreOverriddenByFreshWhen",
      });
    }
    async noStoreOverriddenByFreshWhen(): Promise<void> {
      this.freshWhen(null, { etag: "123abc" });
      await this.render({ plain: "hello world" });
    }

    static {
      this.beforeAction(
        (c) => (c as HttpCacheNoStoreController).freshWhen(null, { etag: "abc123" }),
        { only: "freshWhenOverriddenByNoStore" },
      );
    }
    async freshWhenOverriddenByNoStore(): Promise<void> {
      this.noStore();
      await this.render({ plain: "hello world" });
    }

    static {
      this.beforeAction((c) => (c as HttpCacheNoStoreController).expiresNow(), {
        only: "expiresNowOverriddenByNoStore",
      });
    }
    async expiresNowOverriddenByNoStore(): Promise<void> {
      this.noStore();
      await this.render({ plain: "hello world" });
    }

    static {
      this.beforeAction((c) => (c as HttpCacheNoStoreController).noStore(), {
        only: "noStoreOverriddenByExpiresNow",
      });
    }
    async noStoreOverriddenByExpiresNow(): Promise<void> {
      this.expiresNow();
      await this.render({ plain: "hello world" });
    }

    async cacheControlNoCacheOverriddenByNoStore(): Promise<void> {
      this.response.headers.set("Cache-Control", "no-cache");
      this.noStore();
      await this.render({ plain: "hello world" });
    }

    async cacheControlPublicWithMaxAgeOverriddenByNoStore(): Promise<void> {
      this.response.headers.set("Cache-Control", "public, max-age=604800");
      this.noStore();
      await this.render({ plain: "hello world" });
    }
  }

  let tc: TestCase;

  beforeEach(async ({ task }) => {
    tc = new TestCase(task.name);
    tc.controller = new HttpCacheNoStoreController();
    await tc.beforeSetup();
  });

  it("standalone no store call", async () => {
    await tc.get("standaloneNoStoreCall");
    expect(tc.response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("no store overridden by expires in", async () => {
    await tc.get("noStoreOverriddenByExpiresIn");
    expect(tc.response.headers.get("Cache-Control")).toBe("max-age=30, private");
  });

  it("expires in overridden by no store", async () => {
    await tc.get("expiresInOverriddenByNoStore");
    expect(tc.response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("no store overridden by fresh when", async () => {
    await tc.get("noStoreOverriddenByFreshWhen");
    expect(tc.response.headers.get("Cache-Control")).toBe("max-age=0, private, must-revalidate");
  });

  it("fresh when overridden by no store", async () => {
    await tc.get("freshWhenOverriddenByNoStore");
    expect(tc.response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("expires now overridden by no store", async () => {
    await tc.get("expiresNowOverriddenByNoStore");
    expect(tc.response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("no store overridden by expires now", async () => {
    await tc.get("noStoreOverriddenByExpiresNow");
    expect(tc.response.headers.get("Cache-Control")).toBe("no-cache");
  });

  it("cache control no cache header can be overridden by no store", async () => {
    await tc.get("cacheControlNoCacheOverriddenByNoStore");
    expect(tc.response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("cache control public with expiration header can be overridden by no store", async () => {
    await tc.get("cacheControlPublicWithMaxAgeOverriddenByNoStore");
    expect(tc.response.headers.get("Cache-Control")).toBe("no-store");
  });
});
