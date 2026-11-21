import { beforeEach, describe, expect, it } from "vitest";
import { ArgumentError } from "@blazetrails/ruby-compat";
import { TimezoneOffset, TimezoneTransition } from "../../lib/index.js";
import { TimezoneDefiner } from "../../lib/format1/timezone-definer.js";
import { StringDeduper } from "../../lib/string-deduper.js";
import { assertRaises } from "../support/test-utils.js";

describe("TCTimezoneDefiner", () => {
  let stringDeduper: StringDeduper;
  let definer: TimezoneDefiner;

  beforeEach(() => {
    stringDeduper = new StringDeduper();
    definer = new TimezoneDefiner(stringDeduper);
  });

  it("transitions with timestamps", () => {
    definer.offset("o1", -17900, 0, "TESTLMT");
    definer.offset("o2", -18000, 3600, "TEST");
    definer.offset("o3", -18000, 0, "TESTD");
    definer.transition(2016, 3, "o2", 1456790400);
    definer.transition(2016, 9, "o3", 1472688000);
    definer.transition(2016, 3, "o2", 1488326400);

    const o1 = new TimezoneOffset(-17900, 0, "TESTLMT");
    const o2 = new TimezoneOffset(-18000, 3600, "TEST");
    const o3 = new TimezoneOffset(-18000, 0, "TESTD");
    const t1 = new TimezoneTransition(o2, o1, 1456790400);
    const t2 = new TimezoneTransition(o3, o2, 1472688000);
    const t3 = new TimezoneTransition(o2, o3, 1488326400);

    expect(definer.firstOffset()).toEqual(o1);
    expect(definer.transitions).toEqual([t1, t2, t3]);
  });

  it("transitions with timestamps and datetimes", () => {
    definer.offset("o1", -17900, 0, "TESTLMT");
    definer.offset("o2", -18000, 3600, "TEST");
    definer.offset("o3", -18000, 0, "TESTD");

    definer.transition(2016, 3, "o2", 1456790400, 212323550401, 86400);
    definer.transition(2016, 9, "o3", 1472688000, 212339448001, 86400);
    definer.transition(2016, 3, "o2", 1488326400, 212355086401, 86400);

    const o1 = new TimezoneOffset(-17900, 0, "TESTLMT");
    const o2 = new TimezoneOffset(-18000, 3600, "TEST");
    const o3 = new TimezoneOffset(-18000, 0, "TESTD");
    const t1 = new TimezoneTransition(o2, o1, 1456790400);
    const t2 = new TimezoneTransition(o3, o2, 1472688000);
    const t3 = new TimezoneTransition(o2, o3, 1488326400);

    expect(definer.firstOffset()).toEqual(o1);
    expect(definer.transitions).toEqual([t1, t2, t3]);
  });

  it("transition with datetime", () => {
    definer.offset("o1", -17900, 0, "TESTLMT");

    const error = assertRaises(ArgumentError, () => definer.transition(2016, 3, "o1", 4914897, 2));
    expect(error.message).toMatch(/\bDateTime\b/);
  });

  it("strings deduped", () => {
    const abbreviation = stringDeduper.dedupe("SYMDDLMT");

    definer.offset("o1", 3600, 0, "SYMDDLMT");

    expect(definer.firstOffset()!.abbreviation).toBe(abbreviation);
  });
});
