// trails-only InternalMetadata cases — vendor/rails/activerecord/test/cases has
// no internal_metadata_test.rb, so these have no Rails counterpart to mirror.
import { describe, it, expect } from "vitest";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { InternalMetadata } from "./internal-metadata.js";
import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";

function fakeAdapter(defaultTimezone: string): DatabaseAdapter {
  return { defaultTimezone } as unknown as DatabaseAdapter;
}

type CurrentTimeHost = { currentTime(connection: DatabaseAdapter): string };

const metadataBuiltOverLocalAdapter = new InternalMetadata(
  fakeAdapter("local"),
) as unknown as CurrentTimeHost;

function currentTime(defaultTimezone: string): string {
  return metadataBuiltOverLocalAdapter.currentTime(fakeAdapter(defaultTimezone));
}

describe("InternalMetadata#currentTime", () => {
  it("formats as YYYY-MM-DD HH:mm:ss.SSS with no zone designator", () => {
    for (const tz of ["utc", "local"]) {
      expect(currentTime(tz)).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/);
    }
  });

  it("reads the clock the connection's default timezone selects", () => {
    const utcNow = Temporal.Now.instant().toString({
      smallestUnit: "minute",
      roundingMode: "trunc",
    });
    expect(currentTime("utc").slice(0, 16)).toBe(utcNow.slice(0, 16).replace("T", " "));

    const localNow = Temporal.Now.plainDateTimeISO().toString({
      smallestUnit: "minute",
      roundingMode: "trunc",
    });
    expect(currentTime("local").slice(0, 16)).toBe(localNow.slice(0, 16).replace("T", " "));
  });
});
