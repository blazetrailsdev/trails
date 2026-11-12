import { describe, expect, it } from "vitest";
import { ArgumentError } from "@blazetrails/activemodel";
import {
  combineMultiStatements,
  isWriteQuery,
  isMaxAllowedPacketReached,
  maxAllowedPacket,
  type MaxAllowedPacketHost,
} from "../../../../lib/connection-adapters/mysql/database-statements.js";

function hostReporting(value: number | null): MaxAllowedPacketHost & { calls: number } {
  const host: MaxAllowedPacketHost & { calls: number } = {
    calls: 0,
    async showVariable(name: string) {
      expect(name).toBe("max_allowed_packet");
      host.calls += 1;
      return value;
    },
    maxAllowedPacket() {
      return maxAllowedPacket.call(host);
    },
  };
  return host;
}

describe("MySQL::DatabaseStatements max_allowed_packet", () => {
  it("reads the ceiling from the server and memoizes it", async () => {
    const host = hostReporting(1024);
    expect(await maxAllowedPacket.call(host)).toBe(1024);
    expect(await maxAllowedPacket.call(host)).toBe(1024);
    expect(host.calls).toBe(1);
  });

  it("raises rather than combining when the server does not answer", async () => {
    const host = hostReporting(null);
    await expect(isMaxAllowedPacketReached.call(host, "SELECT 1", undefined)).rejects.toThrow(
      /comparison of Integer with nil failed/,
    );
  });

  it("splits statements against the server-reported ceiling", async () => {
    const host = hostReporting(32);
    const statements = ["SELECT 1234567890", "SELECT 1234567890"];
    expect(await combineMultiStatements.call(host, statements)).toEqual(statements);
  });

  it("concatenates statements that fit under the server-reported ceiling", async () => {
    const host = hostReporting(1024);
    expect(await combineMultiStatements.call(host, ["SELECT 1", "SELECT 2"])).toEqual([
      "SELECT 1;\nSELECT 2",
    ]);
  });

  it("raises when a single statement exceeds the ceiling", async () => {
    const host = hostReporting(8);
    await expect(
      isMaxAllowedPacketReached.call(host, "SELECT 1234567890", undefined),
    ).rejects.toThrow(/Fixtures set is too large 17\./);
  });
});

describe("Mysql2::DatabaseStatements#isWriteQuery", () => {
  it("retries the match against the bytes when the first match raises ArgumentError", () => {
    let matches = 0;
    const sql = {
      toString() {
        if (matches++ === 0) throw new ArgumentError("invalid byte sequence in UTF-8");
        return "SELECT 1";
      },
    } as unknown as string;

    expect(isWriteQuery(sql)).toBe(false);
  });

  it("re-raises anything but ArgumentError", () => {
    const sql = {
      toString() {
        throw new TypeError("boom");
      },
    } as unknown as string;

    expect(() => isWriteQuery(sql)).toThrow(TypeError);
  });
});
