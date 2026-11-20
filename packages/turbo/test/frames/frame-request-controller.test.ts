import { beforeEach, describe, expect, it } from "vitest";
import { IntegrationTest } from "@blazetrails/actionpack/testing";
import { TestCase } from "@blazetrails/actionview/test-case.js";
import { File } from "@blazetrails/ruby-compat";
import { Assertion, assertRaises } from "@blazetrails/activesupport/testing/assertions";
import type { TestAssertions } from "../../lib/test-assertions.js";
import { app } from "../test-helper.js";
import { ApplicationController } from "../dummy/app/controllers/application-controller.js";
import "../dummy/app/controllers/trays-controller.js";

let t: IntegrationTest;

const trayPath = (options: { id: number }) =>
  (app.routes().urlHelpers() as unknown as Record<string, (o: object) => string>).trayPath(options);

async function withPrependedViewPath(path: string, block: () => Promise<void>): Promise<void> {
  const previousViewPaths = ApplicationController.viewPaths();
  try {
    ApplicationController.prependViewPath(path);
    await block();
  } finally {
    ApplicationController.viewPaths(previousViewPaths);
  }
}

describe("Turbo::FrameRequestControllerTest", () => {
  beforeEach(() => {
    t = new IntegrationTest(expect.getState().currentTestName!);
    t.app = app;
    app.reloadRoutesUnlessLoaded();
  });

  it("frame requests are rendered with a minimal layout", async () => {
    await t.get(trayPath({ id: 1 }));
    t.assertSelect("title", { count: 1 });

    await t.get(trayPath({ id: 1 }), { headers: { "Turbo-Frame": "true" } });
    t.assertSelect("title", { count: 0 });
  });

  it("frame request layout includes `head` content", async () => {
    await t.get(trayPath({ id: 1 }), { headers: { "Turbo-Frame": "true" } });

    t.assertSelect("head", { count: 1 });
    t.assertSelect("meta[name=test][content=present]");
    t.assertSelect("meta[name=csrf-param]");
    t.assertSelect("meta[name=csrf-token]");
  });

  it("frame request layout can be overridden", async () => {
    await withPrependedViewPath(File.expandPath("views", import.meta.dirname), async () => {
      await t.get(trayPath({ id: 1 }), { headers: { "Turbo-Frame": "true" } });
    });

    t.assertSelect("meta[name=test][content=present]");
    t.assertSelect("meta[name=alternative][content=present]");
  });

  it("frame requests get a unique etag", async () => {
    await t.get(trayPath({ id: 1 }));
    const etagWithoutFrame = t.response.headers.get("ETag");

    await t.get(trayPath({ id: 1 }), { headers: { "Turbo-Frame": "true" } });
    const etagWithFrame = t.response.headers.get("ETag");

    expect(etagWithFrame).not.toEqual(etagWithoutFrame);
  });

  it("turbo_frame_request_id returns the Turbo-Frame header value", async () => {
    const turboFrameRequestId = "test_frame_id";

    await t.get(trayPath({ id: 1 }));
    expect(String(t.response.body)).not.toMatch(new RegExp(turboFrameRequestId));

    await t.get(trayPath({ id: 1 }), { headers: { "Turbo-Frame": turboFrameRequestId } });
    expect(String(t.response.body)).toMatch(new RegExp(turboFrameRequestId));
  });
});

describe("Turbo::FrameRequestViewTest", () => {
  it("supports rendering context without request object", async () => {
    const tc = new TestCase(expect.getState().currentTestName!) as unknown as {
      rendered: unknown;
      assertDom(selector: string, options?: object): void;
    };
    await (tc as unknown as { beforeSetup(): Promise<void> }).beforeSetup();
    (tc as unknown as { setup(): void }).setup();
    tc.rendered = String(await ApplicationController.render({ template: "trays/show" }));

    tc.assertDom("html");
    tc.assertDom("html head");
    tc.assertDom("html head title", { text: "Dummy" });
    tc.assertDom("html body:not(.turbo-native)");
    tc.assertDom("html body:not(.turbo-native) turbo-frame#tray");
  });

  describe("Turbo::TestAssertions::FrameTest", () => {
    type Host = IntegrationTest &
      Pick<typeof TestAssertions, "assertTurboFrame" | "assertNoTurboFrame"> & {
        domId(recordOrClass: unknown, prefix?: string | null): string;
      };
    let t: Host;

    beforeEach(() => {
      t = new IntegrationTest(expect.getState().currentTestName!) as Host;
      t.app = app;
      app.reloadRoutesUnlessLoaded();
    });

    it("assert_turbo_frame passes with matching frame", async () => {
      await t.get(trayPath({ id: 1 }));
      t.assertTurboFrame("tray");
    });

    it("assert_turbo_frame fails without matching frame", async () => {
      await t.get(trayPath({ id: 1 }));
      await assertRaises([Assertion], {}, () => {
        t.assertTurboFrame("missing");
      });
    });

    it("assert_no_turbo_frame fails with matching frame", async () => {
      await t.get(trayPath({ id: 1 }));
      await assertRaises([Assertion], {}, () => {
        t.assertNoTurboFrame("tray");
      });
    });

    it("assert_no_turbo_frame fails without matching frame", async () => {
      await t.get(trayPath({ id: 1 }));
      t.assertNoTurboFrame("missing");
    });
  });
});
