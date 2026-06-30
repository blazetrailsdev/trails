/**
 * Mirrors activerecord/test/cases/normalized_attribute_test.rb
 *
 * Rails drives the canonical `Aircraft` (`aircraft` table) plus a
 * `NormalizedAircraft < Aircraft` subclass carrying `normalizes` declarations.
 * Both shapes are canonical, so this file rides the worker-built `aircraft`
 * table via `setupFixtures` — no `defineSchema`, no bespoke adapter.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { presence, titleize } from "@blazetrails/activesupport";
import { Base } from "./index.js";
import { Aircraft } from "./test-helpers/models/aircraft.js";
import { setupFixtures } from "./test-helpers/fixtures.js";
import { useHandlerTransactionalFixtures } from "./test-helpers/use-handler-transactional-fixtures.js";

// Rails `Time#noon` — the same instant moved to 12:00:00 (midday) UTC.
function noon(time: Temporal.Instant): Temporal.Instant {
  return time
    .toZonedDateTimeISO("UTC")
    .with({ hour: 12, minute: 0, second: 0, millisecond: 0, microsecond: 0, nanosecond: 0 })
    .toInstant();
}

// Rails: class NormalizedAircraft < Aircraft (normalizes :name, :manufactured_at)
class NormalizedAircraft extends Aircraft {
  // Rails: attr_accessor :validated_name
  declare validated_name: string | undefined;

  static {
    this.normalizes("name", (name: unknown) => {
      const present = presence(name as string | null);
      return present ? titleize(present) : present;
    });
    this.normalizes("manufactured_at", (time: unknown) => noon(time as Temporal.Instant));
    // Rails: validate { self.validated_name = name.dup }
    this.validate(function (this: NormalizedAircraft) {
      this.validated_name = this.name as string;
    });
  }
}

describe("NormalizedAttributeTest", () => {
  setupFixtures();
  useHandlerTransactionalFixtures();

  let time: Temporal.Instant;
  let aircraft: NormalizedAircraft;

  beforeEach(async () => {
    time = Temporal.Instant.from("1999-12-31T12:34:56Z");
    aircraft = await NormalizedAircraft.createBang({
      name: "fly HIGH",
      manufactured_at: time,
    });
  });

  it("normalizes value from create", () => {
    expect(aircraft.name).toBe("Fly High");
  });

  it("normalizes value from update", async () => {
    await aircraft.updateBang({ name: "fly HIGHER" });
    expect(aircraft.name).toBe("Fly Higher");
  });

  it("normalizes value from assignment", () => {
    aircraft.name = "fly HIGHER";
    expect(aircraft.name).toBe("Fly Higher");
  });

  // Skipped pending RFC 0030 story `normalizes-query-and-in-place-type-decoration`:
  // `valid?` does not re-normalize changed-in-place attributes before
  // validation, so `validated_name` keeps the un-normalized in-place value.
  it.skip("normalizes changed-in-place value before validation", async () => {
    aircraft._attributes.set("name", "fly high");
    expect(aircraft.name).toBe("fly high");

    await aircraft.isValid();
    expect(aircraft.validated_name).toBe("Fly High");
  });

  it("normalizes value on demand", () => {
    aircraft._attributes.set("name", "fly high");
    expect(aircraft.name).toBe("fly high");

    aircraft.normalizeAttribute("name");
    expect(aircraft.name).toBe("Fly High");
  });

  it("normalizes value without record", () => {
    expect(NormalizedAircraft.normalizeValueFor("name", "titlecase ME")).toBe("Titlecase Me");
  });

  it("casts value when no normalization is declared", () => {
    expect(NormalizedAircraft.normalizeValueFor("wheels_count", "6")).toBe(6);
  });

  it("casts value before applying normalization", () => {
    aircraft.manufactured_at = time.toString();
    expect((aircraft.manufactured_at as Temporal.Instant).equals(noon(time))).toBe(true);
  });

  it("ignores nil by default", () => {
    expect(NormalizedAircraft.normalizeValueFor("name", null)).toBeNull();
  });

  it("normalizes nil if apply_to_nil", () => {
    const IncludingNil = class extends Aircraft {};
    IncludingNil.normalizes(
      "name",
      (name: unknown) => (name ? titleize(name as string) : "Untitled"),
      { applyToNil: true },
    );

    expect(IncludingNil.normalizeValueFor("name", null)).toBe("Untitled");
  });

  it("does not automatically normalize value from database", async () => {
    const created = await Aircraft.create({ name: "NOT titlecase" });
    const fromDatabase = await NormalizedAircraft.find(created.id);
    expect(fromDatabase.name).toBe("NOT titlecase");
  });

  // Skipped pending RFC 0030 story `normalizes-query-and-in-place-type-decoration`:
  // trails normalizes on write but does not wire NormalizedValueType into the
  // query path, so `find_by` does not normalize the query value (noon) here.
  it.skip("finds record by normalized value", async () => {
    expect((aircraft.manufactured_at as Temporal.Instant).equals(noon(time))).toBe(true);
    const found = await NormalizedAircraft.findBy({ manufactured_at: time.toString() });
    expect(found).not.toBeNull();
    expect(found!.id).toBe(aircraft.id);
  });

  // Skipped pending RFC 0030 story `normalizes-query-and-in-place-type-decoration`:
  // `where` does not normalize query values, so `where(name: "")` renders `= ''`
  // instead of normalizing `""` -> nil -> `IS NULL`.
  it.skip("uses the same query when finding record by nil and normalized nil values", () => {
    expect(NormalizedAircraft.where({ name: null }).toSql()).toBe(
      NormalizedAircraft.where({ name: "" }).toSql(),
    );
  });

  it("can stack normalizations", () => {
    const TitlecaseThenReverse = class extends NormalizedAircraft {};
    TitlecaseThenReverse.normalizes("name", (name: unknown) =>
      (name as string).split("").reverse().join(""),
    );

    expect(TitlecaseThenReverse.normalizeValueFor("name", "titlecase THEN reverse")).toBe(
      "esreveR nehT esaceltiT",
    );
    expect(NormalizedAircraft.normalizeValueFor("name", "ONLY titlecase")).toBe("Only Titlecase");
  });

  // Skipped pending RFC 0030 story `normalizes-query-and-in-place-type-decoration`:
  // the changed-in-place portion (`name.replace("0")` then `save`) requires
  // re-normalizing mutated values before save, which trails does not yet wire.
  it.skip("minimizes number of times normalization is applied", async () => {
    const CountApplied = class extends Aircraft {};
    CountApplied.normalizes("name", (name: unknown) => succ(name as string));

    const counted = await CountApplied.createBang({ name: "0" });
    expect(counted.name).toBe("1");

    counted.name = "0";
    expect(counted.name).toBe("1");
    await counted.save();
    expect(counted.name).toBe("1");

    // Rails mutates the name in place (`name.replace("0")`); JS strings are
    // immutable, so assign through the raw attribute to model the same
    // changed-in-place value, then let save re-normalize it.
    counted._attributes.set("name", "0");
    expect(counted.name).toBe("0");
    await counted.save();
    expect(counted.name).toBe("1");
  });
});

// Rails `String#succ` for the numeric case the test exercises ("0" -> "1").
function succ(value: string): string {
  return String(Number(value) + 1);
}

describe("normalizes on Base", () => {
  setupFixtures();
  useHandlerTransactionalFixtures();

  it("normalizes attributes before persistence", async () => {
    class NormalizedUser extends Base {
      static _tableName = "aircraft";
      static {
        this.normalizes("name", (name: unknown) =>
          typeof name === "string" ? name.trim().toLowerCase() : name,
        );
      }
    }

    const user = await NormalizedUser.create({ name: "  ALICE  " });
    expect(user.name).toBe("alice");
  });
});
