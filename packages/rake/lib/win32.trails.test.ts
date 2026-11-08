import { afterEach, describe, expect, it, vi } from "vitest";
import { Application } from "./application.js";
import { Win32 } from "./win32.js";

describe("Win32", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("standardSystemDir takes the Windows arm", () => {
    vi.spyOn(Win32, "isWindows").mockReturnValue(true);
    vi.spyOn(Win32, "win32SystemDir").mockReturnValue("C:/HP/Rake");

    const app = new Application() as unknown as { standardSystemDir(): string };

    expect(app.standardSystemDir()).toBe("C:/HP/Rake");
  });
});
