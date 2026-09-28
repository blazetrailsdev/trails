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
