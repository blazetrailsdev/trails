// Port of vendor/did_you_mean/test/edit_distance/test_jaro_winkler.rb.
// Test names mirror the Ruby file so test:compare matches.
import { describe, it, expect } from "vitest";

import { JaroWinkler } from "../jaro-winkler.js";

function assertDistance(score: number, str1: string, str2: string): void {
  expect(round4(JaroWinkler.distance(str1, str2))).toBe(score);
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

describe("JaroWinklerTest", () => {
  it("jaro winkler distance", () => {
    assertDistance(0.9667, "henka", "henkan");
    assertDistance(1.0, "al", "al");
    assertDistance(0.9611, "martha", "marhta");
    assertDistance(0.8324, "jones", "johnson");
    assertDistance(0.9167, "abcvwxyz", "zabcvwxy");
    assertDistance(0.9583, "abcvwxyz", "cabvwxyz");
    assertDistance(0.84, "dwayne", "duane");
    assertDistance(0.8133, "dixon", "dicksonx");
    assertDistance(0.0, "fvie", "ten");
    assertDistance(0.9067, "does_exist", "doesnt_exist");
    assertDistance(1.0, "x", "x");
  });

  it("jarowinkler distance with utf8 strings", () => {
    assertDistance(0.9818, "變形金剛4:絕跡重生", "變形金剛4: 絕跡重生");
    assertDistance(0.8222, "連勝文", "連勝丼");
    assertDistance(0.8222, "馬英九", "馬英丸");
    assertDistance(0.6667, "良い", "いい");
  });
});
