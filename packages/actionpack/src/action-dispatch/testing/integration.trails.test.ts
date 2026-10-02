import { describe, expect, it } from "vitest";
import { bodyFromString } from "@blazetrails/rack";
import { RuntimeError } from "@blazetrails/ruby-compat";
import { IntegrationTest } from "./integration.js";

describe("Integration::Session delegated readers (allow_nil: true)", () => {
  it("return nil before the first request", () => {
    const session = new IntegrationTest();
    expect(session.status).toBeNull();
    expect(session.statusMessage).toBeNull();
    expect(session.headers).toBeNull();
    expect(session.body).toBeNull();
    expect(session.isRedirect).toBeNull();
    expect(session.path).toBeNull();
  });

  it("delegate to the last response and request", async () => {
    const session = new IntegrationTest();
    session.app = async () => [302, { location: "/there" }, bodyFromString("moved")];
    session.hostBang("rubyonrails.com");
    await session.get("/here");
    expect(session.statusMessage).toBe("Found");
    expect(session.headers!.get("location")).toBe("/there");
    expect(session.body).toBe("moved");
    expect(session.isRedirect).toBe(true);
    expect(session.path).toBe("/here");
    expect(session.request.host).toBe("rubyonrails.com");
  });
});

describe("Integration::RequestHelpers#follow_redirect!", () => {
  function redirecting(status: number): IntegrationTest {
    const session = new IntegrationTest();
    session.app = async (env) =>
      env.PATH_INFO === "/there"
        ? [200, {}, bodyFromString(`${env.REQUEST_METHOD} ${env.HTTP_REFERER}`)]
        : [status, { location: "http://www.example.com/there" }, bodyFromString("")];
    return session;
  }

  it("sets HTTP_REFERER on the caller's headers unless that key is present", async () => {
    const session = redirecting(302);
    await session.get("/here?a=1");
    const headers: Record<string, string> = { referer: "http://elsewhere.test/" };
    expect(await session.followRedirectBang({ headers })).toBe(200);
    expect(headers["HTTP_REFERER"]).toBe("http://www.example.com/here?a=1");
    expect(session.body).toBe("GET http://www.example.com/here?a=1");

    await session.get("/here");
    await session.followRedirectBang({ headers: { HTTP_REFERER: "http://given.test/" } });
    expect(session.body).toBe("GET http://given.test/");
  });

  it("re-sends the request's verb on a 307 and a 308, and GET otherwise", async () => {
    for (const [status, verb] of [
      [307, "POST"],
      [308, "POST"],
      [303, "GET"],
    ] as const) {
      const session = redirecting(status);
      await session.post("/here");
      await session.followRedirectBang();
      expect(session.body).toBe(`${verb} http://www.example.com/here`);
    }
  });

  it("raises RuntimeError naming the status when the last response is not a redirect", async () => {
    const session = new IntegrationTest();
    session.app = async () => [200, {}, bodyFromString("ok")];
    await session.get("/here");
    await expect(session.followRedirectBang()).rejects.toThrow(
      new RuntimeError("not a redirect! 200 OK"),
    );
  });
});

describe("RoutingAssertions#method_missing", () => {
  it("forwards a named route helper to the controller, and nothing else", () => {
    const test = new IntegrationTest() as IntegrationTest & {
      itemsPath?(): string;
      nope?: unknown;
    };
    test.routes.draw(function () {
      this.get("/items", { to: "items#index", as: "items" });
    });
    expect(test.itemsPath).toBeUndefined();
    test.controller = { itemsPath: () => "/items" } as unknown as IntegrationTest["controller"];
    expect(test.itemsPath!()).toBe("/items");
    expect(test.nope).toBeUndefined();
  });
});

describe("Integration::Session includes TestProcess", () => {
  it("session, flash and redirect_to_url read the last request and response", async () => {
    const session = new IntegrationTest();
    session.app = async () => [302, { location: "/there" }, bodyFromString("moved")];
    await session.get("/here");
    expect(session.session()).toBe(session.request.session);
    expect(session.flash()).toBe(session.request.flash);
    expect(session.redirectToUrl()).toBe(session.response.redirectUrl);
    expect(session.redirectToUrl()).toMatch(/\/there$/);
  });

  it("flash has no guard for a session that made no request", () => {
    expect(() => new IntegrationTest().flash()).toThrow(TypeError);
  });
});
