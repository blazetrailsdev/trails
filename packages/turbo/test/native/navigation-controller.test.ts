import { beforeEach, describe, expect, it } from "vitest";
import { IntegrationTest } from "@blazetrails/actionpack/testing";
import { app } from "../test-helper.js";
import "../dummy/app/controllers/trays-controller.js";

let t: IntegrationTest;

const urlHelpers = () =>
  app.routes().urlHelpers() as unknown as Record<string, (options?: object) => string>;
const trayPath = (options: { id: number }) => urlHelpers().trayPath(options);
const traysPath = () => urlHelpers().traysPath();
const historicalLocationUrl = (action: string, options: object = {}) =>
  urlHelpers()[`turbo${action[0].toUpperCase()}${action.slice(1)}HistoricalLocationUrl`]({
    host: "www.example.com",
    ...options,
  });

function headerForHotwireNativeApp(): Record<string, string> {
  return { HTTP_USER_AGENT: "MyApp iOS/3.0 Hotwire Native (build 13; iPad Air 2); iOS 9.3" };
}

function headerForReferer(): Record<string, string> {
  return { HTTP_REFERER: "/past_place" };
}

describe("Turbo::Native::NavigationControllerTest", () => {
  beforeEach(() => {
    t = new IntegrationTest(expect.getState().currentTestName!);
    t.app = app;
    app.reloadRoutesUnlessLoaded();
  });

  it("recede, resume, or refresh when native or redirect when not", async () => {
    for (const action of ["recede", "resume", "refresh"]) {
      await t.post(traysPath(), { params: { return_to: `${action}_or_redirect` } });
      t.assertRedirectedTo(trayPath({ id: 1 }));

      await t.post(traysPath(), {
        params: { return_to: `${action}_or_redirect` },
        headers: headerForHotwireNativeApp(),
      });
      t.assertRedirectedTo(historicalLocationUrl(action));
    }
  });

  it("recede, resume, or refresh when native or redirect back when not", async () => {
    for (const action of ["recede", "resume", "refresh"]) {
      await t.post(traysPath(), { params: { return_to: `${action}_or_redirect_back` } });
      t.assertRedirectedTo(trayPath({ id: 5 }));

      await t.post(traysPath(), {
        params: { return_to: `${action}_or_redirect_back` },
        headers: headerForReferer(),
      });
      t.assertRedirectedTo("/past_place");

      await t.post(traysPath(), {
        params: { return_to: `${action}_or_redirect_back` },
        headers: { ...headerForHotwireNativeApp(), ...headerForReferer() },
      });
      t.assertRedirectedTo(historicalLocationUrl(action));
    }
  });

  it("include options in URL when redirecting native app", async () => {
    await t.post(traysPath(), { params: { return_to: "refresh_or_redirect_with_options" } });
    t.assertRedirectedTo(trayPath({ id: 5 }));

    await t.post(traysPath(), {
      params: { return_to: "refresh_or_redirect_with_options" },
      headers: headerForHotwireNativeApp(),
    });
    t.assertRedirectedTo(historicalLocationUrl("refresh", { notice: "confirmed", custom: 123 }));
  });

  it("historical location url sends text/html", async () => {
    await t.get(historicalLocationUrl("refresh"));

    t.assertResponse(":ok");
    expect(t.response.contentType).toBe("text/html; charset=utf-8");
  });
});
