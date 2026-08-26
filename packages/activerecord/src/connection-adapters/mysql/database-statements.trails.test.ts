import { describe, expect, it } from "vitest";
import {
  combineMultiStatements,
  isMaxAllowedPacketReached,
  maxAllowedPacket,
  type MaxAllowedPacketHost,
} from "./database-statements.js";

function hostReporting(value: string | null): MaxAllowedPacketHost & { calls: number } {
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
    const host = hostReporting("1024");
    expect(await maxAllowedPacket.call(host)).toBe(1024);
    expect(await maxAllowedPacket.call(host)).toBe(1024);
    expect(host.calls).toBe(1);
  });

  it("raises rather than combining when the server does not answer", async () => {
    const host = hostReporting(null);
    await expect(isMaxAllowedPacketReached.call(host, "SELECT 1", undefined)).rejects.toThrow(
      /Fixtures set is too large 8\./,
    );
  });

  it("splits statements against the server-reported ceiling", async () => {
    const host = hostReporting("32");
    const statements = ["SELECT 1234567890", "SELECT 1234567890"];
    expect(await combineMultiStatements.call(host, statements)).toEqual(statements);
  });

  it("concatenates statements that fit under the server-reported ceiling", async () => {
    const host = hostReporting("1024");
    expect(await combineMultiStatements.call(host, ["SELECT 1", "SELECT 2"])).toEqual([
      "SELECT 1;\nSELECT 2",
    ]);
  });

  it("raises when a single statement exceeds the ceiling", async () => {
    const host = hostReporting("8");
    await expect(
      isMaxAllowedPacketReached.call(host, "SELECT 1234567890", undefined),
    ).rejects.toThrow(/Fixtures set is too large 17\./);
  });
});
