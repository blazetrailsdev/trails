import { describe, expect, it } from "vitest";
import { Temporal } from "@blazetrails/date";
import { isBlank, isPresent, presence, TimeWithZone, TimeZone } from "../../index.js";
import { assertNotPredicate, assertPredicate } from "../../testing/assertions.js";

const NOW = new Temporal.Instant(1_700_000_000_000_000_000n);
const TIMES = [
  new Date(NOW.epochMilliseconds),
  new TimeWithZone(NOW, TimeZone.create("UTC")),
  NOW,
  NOW.toZonedDateTimeISO("UTC"),
  Temporal.PlainDate.from("2026-08-13"),
  Temporal.PlainDateTime.from("2026-08-13T12:00:00"),
  Temporal.PlainTime.from("12:00:00"),
];

class EmptyTrue {
  isEmpty() {
    return 0;
  }
}

class EmptyFalse {
  isEmpty() {
    return null;
  }
}

const BLANK = [new EmptyTrue(), null, false, "", "   ", "  \n\t  \r ", "\u3000", "\u00a0", [], {}];
const NOT = [
  new EmptyFalse(),
  new (class {})(),
  true,
  0,
  1,
  "a",
  [null],
  new Map([[null, 0]]),
  ...TIMES,
];

describe("BlankTest", () => {
  it("blank", () => {
    for (const v of BLANK) expect(isBlank(v), `${String(v)} should be blank`).toEqual(true);
    for (const v of NOT) expect(isBlank(v), `${String(v)} should not be blank`).toEqual(false);
  });

  it("blank with bundled string encodings", () => {
    assertPredicate(" ", isBlank);
    assertNotPredicate("a", isBlank);
  });

  it("present", () => {
    for (const v of BLANK)
      expect(isPresent(v), `${String(v)} should not be present`).toEqual(false);
    for (const v of NOT) expect(isPresent(v), `${String(v)} should be present`).toEqual(true);
  });

  it("presence", () => {
    for (const v of BLANK)
      expect(presence(v), `${String(v)}.presence should return nil`).toBeUndefined();
    for (const v of NOT) expect(presence(v), `${String(v)}.presence should return self`).toEqual(v);
  });
});
