import { beforeEach, describe, expect, it } from "vitest";
import { FAKE_APP } from "./fixtures/fake-app.js";
import { Session } from "./index.js";

let session: Session;

beforeEach(() => {
  session = new Session(FAKE_APP);
});

describe("Rack::Test::Session#basic_authorize (trails)", () => {
  it("packs a non-ASCII credential's UTF-8 bytes as MRI does", async () => {
    session.basicAuthorize("usér", "päss");
    await session.request("/");

    expect(session.lastRequest().env["HTTP_AUTHORIZATION"]).toBe("Basic dXPDqXI6cMOkc3M=");
  });
});
