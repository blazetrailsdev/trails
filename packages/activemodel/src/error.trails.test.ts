import { describe, it, expect } from "vitest";
import { Temporal } from "@blazetrails/date";
import { Range } from "@blazetrails/activesupport";
import { Error as ModelError } from "./error.js";

// Ruby `Date#==`, `Time#==` and `Range#==` are VALUE equality, and `error.rb`
// leans on Ruby `==` at every comparison site — `match?` (:171),
// `strict_match?` (:187) and `==` (:190-192). JS `===` is identity for all
// three, so two separately-built but equal option values used to miss.
// Rails' own validators put exactly these shapes in `options`
// (`validates_length_of :name, in: 5..20`, `greater_than: some_time`).
describe("Error option value equality", () => {
  const base = {} as never;

  it("compares two separately-constructed equal Ranges as equal", () => {
    const error = new ModelError(base, "name", ":too_long", { count: new Range(5, 20) });

    expect(error.match("name", ":too_long", { count: new Range(5, 20) })).toBe(true);
    expect(error.match("name", ":too_long", { count: new Range(5, 21) })).toBe(false);
    expect(error.match("name", ":too_long", { count: new Range(5, 20, true) })).toBe(false);
    expect(error.strictMatch("name", ":too_long", { count: new Range(5, 20) })).toBe(true);
    expect(
      error.equals(new ModelError(base, "name", ":too_long", { count: new Range(5, 20) })),
    ).toBe(true);
  });

  it("compares two separately-constructed equal Times as equal", () => {
    // Ruby `Time#==` is the instant. A Temporal value answers its own
    // `equals`, which is the arm `optionsEqual` sends `==` to, so this half
    // needs no special case — it is covered here because `greater_than:` is a
    // shape the comparison validators really put in `options`.
    const at = () => Temporal.Instant.from("2026-08-20T00:00:00Z");
    const error = new ModelError(base, "startsAt", ":greater_than", { count: at() });

    expect(error.match("startsAt", ":greater_than", { count: at() })).toBe(true);
    expect(
      error.match("startsAt", ":greater_than", {
        count: Temporal.Instant.from("2026-08-21T00:00:00Z"),
      }),
    ).toBe(false);
    expect(error.strictMatch("startsAt", ":greater_than", { count: at() })).toBe(true);
    expect(error.equals(new ModelError(base, "startsAt", ":greater_than", { count: at() }))).toBe(
      true,
    );
  });
});
