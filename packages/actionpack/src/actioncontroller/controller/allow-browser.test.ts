import { afterEach, describe, it, expect } from "vitest";
import { Base } from "../base.js";
import { Request } from "../../actiondispatch/request.js";
import { Response } from "../../actiondispatch/response.js";
import { Notifications } from "@blazetrails/activesupport";
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

// ==========================================================================
// controller/allow_browser_test.rb
// ==========================================================================
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
    expect(c.status).toBe(426);
  });

  it("blocked browser below version limit with method name", async () => {
    const C = createController(SPECIFIC_VERSIONS, "headUpgradeRequired", {
      only: ["helloMethodName"],
    });
    const c = new C();
    await c.dispatch("helloMethodName", makeRequest(FIREFOX_114), makeResponse());
    expect(c.status).toBe(426);
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
    expect(c.status).toBe(426);
  });

  it("allowed browsers above specific version limit", async () => {
    const C = createController(
      SPECIFIC_VERSIONS,
      function (this: Base) {
        this.head(426);
      },
      { only: ["hello"] },
    );

    for (const ua of [SAFARI_17_2_0, CHROME_120, OPERA_106]) {
      const c = new C();
      await c.dispatch("hello", makeRequest(ua), makeResponse());
      expect(c.status).toBe(200);
    }
  });

  it("browsers against modern limit", async () => {
    const C = createController(
      "modern",
      function (this: Base) {
        this.head(426);
      },
      { only: ["modern"] },
    );

    const allowed = [SAFARI_17_2_0, CHROME_120, OPERA_106];
    for (const ua of allowed) {
      const c = new C();
      await c.dispatch("modern", makeRequest(ua), makeResponse());
      expect(c.status).toBe(200);
    }

    const blocked = [CHROME_118];
    for (const ua of blocked) {
      const c = new C();
      await c.dispatch("modern", makeRequest(ua), makeResponse());
      expect(c.status).toBe(426);
    }
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
    expect(c.status).toBe(200);

    const C2 = createController(
      "modern",
      function (this: Base) {
        this.head(426);
      },
      { only: ["modern"] },
    );
    const c2 = new C2();
    await c2.dispatch("modern", makeRequest(GOOGLE_BOT), makeResponse());
    expect(c2.status).toBe(200);
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
    await c.dispatch("modern", makeRequest(CHROME_118), makeResponse());

    expect(events.length).toBe(1);
    expect(events[0].name).toBe("browser_block.action_controller");
    expect(events[0].payload.versions).toBe("modern");
    expect(events[0].payload.user_agent).toBe(CHROME_118);
    expect(events[0].payload.method).toBe("GET");
    expect(c.status).toBe(426);
  });
});
