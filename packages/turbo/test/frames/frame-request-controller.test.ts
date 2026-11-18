import { beforeEach, describe, expect, it } from "vitest";
import { IntegrationTest } from "@blazetrails/actionpack/testing";
import { File } from "@blazetrails/ruby-compat";
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

  // BLOCKED: rack-etag-digests-only-array-bodies
  it.skip("frame requests get a unique etag", async () => {
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
