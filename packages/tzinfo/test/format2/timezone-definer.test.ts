import { beforeEach, describe, expect, it } from "vitest";
import { ArgumentError } from "@blazetrails/ruby-compat";
import { TimezoneOffset, TimezoneTransition } from "../../lib/index.js";
import { TimezoneDefiner } from "../../lib/format2/timezone-definer.js";
import { StringDeduper } from "../../lib/string-deduper.js";
import { assertRaises } from "../test-utils.js";

describe("TCTimezoneDefiner", () => {
  let stringDeduper: StringDeduper;
  let definer: TimezoneDefiner;

  beforeEach(() => {
    stringDeduper = new StringDeduper();
    definer = new TimezoneDefiner(stringDeduper);
  });

  it("no offsets or transitions", () => {
    expect(definer.firstOffset()).toBeNull();
    expect(definer.transitions).toEqual([]);
  });

  it("single offset no transitions", () => {
    definer.offset("o1", -17900, 0, "TESTLMT");

    const o1 = new TimezoneOffset(-17900, 0, "TESTLMT");

    expect(definer.firstOffset()).toEqual(o1);
    expect(definer.transitions).toEqual([]);
  });

  it("single offset single transition", () => {
    definer.offset("o1", -17900, 0, "TESTLMT");
    definer.transition("o1", 1456790400);

    const o1 = new TimezoneOffset(-17900, 0, "TESTLMT");
    const t1 = new TimezoneTransition(o1, o1, 1456790400);

    expect(definer.firstOffset()).toEqual(o1);
    expect(definer.transitions).toEqual([t1]);
  });

  it("multiple offsets single transition", () => {
    definer.offset("o1", -17900, 0, "TESTLMT");
    definer.offset("o2", -18000, 3600, "TEST");
    definer.transition("o2", 1456790400);

    const o1 = new TimezoneOffset(-17900, 0, "TESTLMT");
    const o2 = new TimezoneOffset(-18000, 3600, "TEST");
    const t1 = new TimezoneTransition(o2, o1, 1456790400);

    expect(definer.firstOffset()).toEqual(o1);
    expect(definer.transitions).toEqual([t1]);
  });

  it("multiple offsets multiple transitions", () => {
    definer.offset("o1", -17900, 0, "TESTLMT");
    definer.offset("o2", -18000, 3600, "TEST");
    definer.offset("o3", -18000, 0, "TESTD");
    definer.transition("o2", 1456790400);
    definer.transition("o3", 1472688000);
    definer.transition("o2", 1488326400);

    const o1 = new TimezoneOffset(-17900, 0, "TESTLMT");
    const o2 = new TimezoneOffset(-18000, 3600, "TEST");
    const o3 = new TimezoneOffset(-18000, 0, "TESTD");
    const t1 = new TimezoneTransition(o2, o1, 1456790400);
    const t2 = new TimezoneTransition(o3, o2, 1472688000);
    const t3 = new TimezoneTransition(o2, o3, 1488326400);

    expect(definer.firstOffset()).toEqual(o1);
    expect(definer.transitions).toEqual([t1, t2, t3]);
  });

  it("offset already defined", () => {
    definer.offset("o1", -17900, 0, "TESTLMT");
    definer.offset("o2", 18000, 0, "TEST");

    const error = assertRaises(ArgumentError, () => definer.offset("o2", 1800, 3600, "TESTD"));
    expect(error.message).toMatch(/\bid\b/);
  });

  it("transition with no offsets", () => {
    const error = assertRaises(ArgumentError, () => definer.transition("o1", 1456790400));
    expect(error.message).toMatch(/\boffset_id\b/);
  });

  it("transition with undefined offset", () => {
    definer.offset("o1", -17900, 0, "TESTLMT");
    definer.transition("o1", 1456790400);

    const error = assertRaises(ArgumentError, () => definer.transition("o2", 1472688000));
    expect(error.message).toMatch(/\boffset_id\b/);
  });

  it("transition not increased", () => {
    definer.offset("o1", -17900, 0, "TESTLMT");
    definer.transition("o1", 1456790400);

    const error = assertRaises(ArgumentError, () => definer.transition("o1", 1456790400));
    expect(error.message).toMatch(/\btimestamp\b/);
  });

  it("transition decreased", () => {
    definer.offset("o1", -17900, 0, "TESTLMT");
    definer.transition("o1", 1456790400);

    const error = assertRaises(ArgumentError, () => definer.transition("o1", 1456790399));
    expect(error.message).toMatch(/\btimestamp\b/);
  });

  it("strings deduped", () => {
    const abbreviation = stringDeduper.dedupe("DEFDDSMT");

    definer.offset("o1", 3600, 0, "DEFDDSMT");
    expect(definer.firstOffset()!.abbreviation).toBe(abbreviation);
  });

  for (let n = 0; n <= 5; n++) {
    it(`subsequent rules ${n} args`, () => {
      const args = Array.from({ length: n + 1 }, (_, i) => i);
      expect(definer.subsequentRules(...args)).toBeNull();
    });
  }
});
