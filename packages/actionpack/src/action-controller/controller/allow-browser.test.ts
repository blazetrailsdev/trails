import { afterEach, describe, it } from "vitest";
import { Base } from "../base.js";
import { assertResponse } from "../../action-dispatch/testing/assertions/response.js";
import { Request } from "../../action-dispatch/http/request.js";
import { Response } from "../../action-dispatch/http/response.js";
import {
  assertEmpty,
  assertEqual,
  assertNotEmpty,
  Notifications,
} from "@blazetrails/activesupport";
import type { BrowserVersions } from "../metal/allow-browser.js";

afterEach(() => {
  Notifications.unsubscribeAll();
});

const CHROME_118 =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118 Safari/537.36";
const CHROME_120 =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";
const SAFARI_17_2_0 =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2.0 Safari/605.1.15";
const FIREFOX_114 =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/114.0";
const IE_11 = "Mozilla/5.0 (Windows NT 10.0; WOW64; Trident/7.0; rv:11.0) like Gecko";
const OPERA_106 =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 OPR/106.0.0.0";
const GOOGLE_BOT =
  "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/W.X.Y.Z Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

const SPECIFIC_VERSIONS: BrowserVersions = {
  safari: "16.4",
  chrome: "119",
  firefox: "123",
  opera: "106",
  ie: false,
};

function makeRequest(userAgent: string): Request {
  return new Request({
    REQUEST_METHOD: "GET",
    PATH_INFO: "/hello",
    HTTP_HOST: "localhost",
    HTTP_USER_AGENT: userAgent,
  });
}

function makeResponse(): Response {
  return new Response();
}

function createController(
  versions: BrowserVersions,
  blockOption?: ((this: Base) => void) | string,
  actionFilter?: { only?: string[] },
) {
  class AllowBrowserController extends Base {
    async hello() {
      this.head(200);
    }

    async helloMethodName() {
      this.head(200);
    }

    async modern() {
      this.head(200);
    }

    private headUpgradeRequired() {
      this.head(426);
    }
  }

  AllowBrowserController.allowBrowser({
    versions,
    block: blockOption,
    ...actionFilter,
  });

  return AllowBrowserController;
}

describe("AllowBrowserTest", () => {
  it("blocked browser below version limit with callable", async () => {
    const C = createController(
      SPECIFIC_VERSIONS,
      function (this: Base) {
        this.head(426);
      },
      { only: ["hello"] },
    );
    const c = new C();
    await c.dispatch("hello", makeRequest(FIREFOX_114), makeResponse());
    assertResponse.call(c, "upgrade_required");
  });

  it("blocked browser below version limit with method name", async () => {
    const C = createController(SPECIFIC_VERSIONS, "headUpgradeRequired", {
      only: ["helloMethodName"],
    });
    const c = new C();
    await c.dispatch("helloMethodName", makeRequest(FIREFOX_114), makeResponse());
    assertResponse.call(c, "upgrade_required");
  });

  it("blocked browser by name", async () => {
    const C = createController(
      SPECIFIC_VERSIONS,
      function (this: Base) {
        this.head(426);
      },
      { only: ["hello"] },
    );
    const c = new C();
    await c.dispatch("hello", makeRequest(IE_11), makeResponse());
    assertResponse.call(c, "upgrade_required");
  });

  it("allowed browsers above specific version limit", async () => {
    const C = createController(
      SPECIFIC_VERSIONS,
      function (this: Base) {
        this.head(426);
      },
      { only: ["hello"] },
    );

    let c = new C();
    await c.dispatch("hello", makeRequest(SAFARI_17_2_0), makeResponse());
    assertResponse.call(c, "ok");

    c = new C();
    await c.dispatch("hello", makeRequest(CHROME_120), makeResponse());
    assertResponse.call(c, "ok");

    c = new C();
    await c.dispatch("hello", makeRequest(OPERA_106), makeResponse());
    assertResponse.call(c, "ok");
  });

  it("browsers against modern limit", async () => {
    const C = createController(
      "modern",
      function (this: Base) {
        this.head(426);
      },
      { only: ["modern"] },
    );

    let c = new C();
    await c.dispatch("modern", makeRequest(SAFARI_17_2_0), makeResponse());
    assertResponse.call(c, "ok");

    c = new C();
    await c.dispatch("modern", makeRequest(CHROME_118), makeResponse());
    assertResponse.call(c, "upgrade_required");

    c = new C();
    await c.dispatch("modern", makeRequest(CHROME_120), makeResponse());
    assertResponse.call(c, "ok");

    c = new C();
    await c.dispatch("modern", makeRequest(OPERA_106), makeResponse());
    assertResponse.call(c, "ok");
  });

  it("bots", async () => {
    const C = createController(
      SPECIFIC_VERSIONS,
      function (this: Base) {
        this.head(426);
      },
      { only: ["hello"] },
    );
    const c = new C();
    await c.dispatch("hello", makeRequest(GOOGLE_BOT), makeResponse());
    assertResponse.call(c, "ok");

    const C2 = createController(
      "modern",
      function (this: Base) {
        this.head(426);
      },
      { only: ["modern"] },
    );
    const c2 = new C2();
    await c2.dispatch("modern", makeRequest(GOOGLE_BOT), makeResponse());
    assertResponse.call(c2, "ok");
  });

  it("a blocked request instruments a browser_block.action_controller event", async () => {
    const events: Array<{ name: string; payload: Record<string, unknown> }> = [];
    Notifications.subscribe(
      "browser_block.action_controller",
      (event: { name: string; payload: Record<string, unknown> }) => {
        events.push(event);
      },
    );

    const C = createController(
      "modern",
      function (this: Base) {
        this.head(426);
      },
      { only: ["modern"] },
    );
    const c = new C();
    const request = makeRequest(CHROME_118);
    await c.dispatch("modern", request, makeResponse());

    const [event, ...rest] = events;

    assertEqual(request, event.payload.request);
    assertNotEmpty(event.payload.versions);
    assertEmpty(rest);
  });
});
