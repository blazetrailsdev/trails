import { describe, expect, it } from "vitest";
import { AbstractAdapter, Version } from "./abstract-adapter.js";

describe("AbstractAdapter::Version", () => {
  it("stringifies the parsed parts, not the string it was built from", () => {
    expect(new Version("8.0.31-log").toString()).toBe("8.0.31");
    expect(new Version("10.6.5-MariaDB").toString()).toBe("10.6.5");
    expect(new Version("5.7.22").toString()).toBe("5.7.22");
  });

  it("carries the full version string its caller passed", () => {
    const version = new Version("8.0.31", "8.0.31-log");
    expect(version.fullVersionString).toBe("8.0.31-log");
    expect(version.toString()).toBe("8.0.31");
  });

  it("has no full version string when the caller passed none", () => {
    expect(new Version("3.45.0").fullVersionString).toBeNull();
  });

  it("compares by parsed part, longer version winning a tie", () => {
    expect(new Version("8.0.31").compare("8.0.4")).toBe(1);
    expect(new Version("5.7.22").compare("5.7.22")).toBe(0);
    expect(new Version("10.2").compare("10.2.1")).toBe(-1);
  });
});

describe("AbstractAdapter#databaseVersion", () => {
  class AsyncVersionAdapter extends AbstractAdapter {
    fetches = 0;
    override async getDatabaseVersion(): Promise<Version> {
      this.fetches++;
      return new Version("8.0.31");
    }
  }

  it("is readable from a standalone adapter that has never connected", async () => {
    const adapter = new AsyncVersionAdapter();

    expect(String(await adapter.databaseVersion)).toBe("8.0.31");
  });

  it("fetches once, however many readers ask", async () => {
    const seen: string[] = [];
    class CheckingAdapter extends AsyncVersionAdapter {
      override async checkVersion(): Promise<void> {
        seen.push(String(await this.databaseVersion));
      }
    }
    const adapter = new CheckingAdapter();
    await adapter.configureConnection();
    await adapter.configureConnection();
    expect(seen).toEqual(["8.0.31", "8.0.31"]);
    expect(adapter.fetches).toBe(1);
  });
});
