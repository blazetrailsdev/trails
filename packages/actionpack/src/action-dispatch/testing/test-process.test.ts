import { getFs, getOs, getPath } from "@blazetrails/activesupport";
import { describe, expect, it } from "vitest";

import { FlashHash } from "../middleware/flash.js";
import { CookieJar } from "../middleware/cookies.js";
import {
  TestProcess,
  cookies,
  flash,
  redirectToUrl,
  session,
  assigns,
  fileFixtureUpload,
  type TestProcessHost,
} from "./test-process.js";

function makeHost(overrides: Partial<TestProcessHost> = {}): TestProcessHost {
  return {
    request: { session: { user: 1 }, flash: new FlashHash(), cookies: { a: "1" } },
    response: { redirectUrl: "/somewhere" },
    constructor: { fileFixturePath: null },
    ...overrides,
  };
}

describe("TestProcess", () => {
  it("exposes a Rails-shaped module of helpers", () => {
    expect(Object.keys(TestProcess).sort()).toEqual(
      [
        "assigns",
        "cookies",
        "fileFixtureUpload",
        "fixtureFileUpload",
        "flash",
        "redirectToUrl",
        "session",
      ].sort(),
    );
  });

  it("session/flash/redirectToUrl delegate to request/response", () => {
    const host = makeHost();
    expect(session.call(host)).toEqual({ user: 1 });
    expect(flash.call(host)).toBeInstanceOf(FlashHash);
    expect(redirectToUrl.call(host)).toBe("/somewhere");
  });

  it("cookies memoizes a CookieJar built from request cookies", () => {
    const host = makeHost();
    const jar = cookies.call(host);
    expect(jar).toBeInstanceOf(CookieJar);
    expect(jar.get("a")).toBe("1");
    expect(cookies.call(host)).toBe(jar);
  });

  it("assigns raises the extracted-gem error", () => {
    expect(() => assigns.call(makeHost())).toThrow(/extracted to a gem/);
  });

  it("fileFixtureUpload returns an UploadedFile with the given mime type", () => {
    const dir = getFs().mkdtempSync!(getPath().join(getOs().tmpdir(), "trails-tp-"));
    const file = getPath().join(dir, "david.png");
    getFs().writeFileSync(file, "x");
    const host = makeHost();
    const upload = fileFixtureUpload.call(host, file, "image/png");
    expect(upload.contentType).toBe("image/png");
    expect(upload.originalFilename).toBe("david.png");
  });
});
