import { describe, expect, it } from "vitest";
import { bodyFromString } from "@blazetrails/rack";
import { IntegrationTest } from "./integration.js";

describe("Integration::Session delegated readers (allow_nil: true)", () => {
  it("return nil before the first request", () => {
    const session = new IntegrationTest();
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
