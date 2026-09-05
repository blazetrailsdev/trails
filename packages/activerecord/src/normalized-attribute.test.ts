import { describe, it, expect, beforeEach } from "vitest";
import { Time as RubyTime } from "@blazetrails/date";
import { presence, titleize } from "@blazetrails/activesupport";
import { Base } from "./index.js";
import { Aircraft } from "./test-helpers/models/aircraft.js";
import { fixtures } from "./test-fixtures.js";

function noon(time: RubyTime): RubyTime {
  const utc = time.getutc();
  return RubyTime.utc(utc.year, utc.mon, utc.mday, 12, 0, 0);
}

class NormalizedAircraft extends Aircraft {
  declare manufactured_at: any;
  declare name: any;
  declare validated_name: string | undefined;

  static {
    this.normalizes("name", {
      with: (name: unknown) => {
        const present = presence(name as string | null);
        return present ? titleize(present) : present;
      },
    });
    this.normalizes("manufactured_at", {
      with: (time: unknown) => noon(time as RubyTime),
    });
    this.validate(function (this: NormalizedAircraft) {
      this.validated_name = this.name as string;
    });
  }
}

describe("NormalizedAttributeTest", () => {
  fixtures([]);

  let time: RubyTime;
  let aircraft: NormalizedAircraft;

  beforeEach(async () => {
    time = RubyTime.utc(1999, 12, 31, 12, 34, 56);
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

  it("normalizes changed-in-place value before validation", async () => {
    const nameAttr = aircraft._attributes.getAttribute("name") as unknown as {
      _value: unknown;
      _hasValue: boolean;
    };
    nameAttr._value = "fly high";
    nameAttr._hasValue = true;
    expect(aircraft.name).toBe("fly high");

    await aircraft.isValid();
    expect(aircraft.validated_name).toBe("Fly High");
  });

  it("normalizes value on demand", () => {
    const nameAttr = aircraft._attributes.getAttribute("name") as unknown as {
      _value: unknown;
      _hasValue: boolean;
    };
    nameAttr._value = "fly high";
    nameAttr._hasValue = true;
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
    aircraft.manufactured_at = time.getutc().xmlschema();
    expect(aircraft.manufactured_at).toEqual(noon(time));
  });

  it("ignores nil by default", () => {
    expect(NormalizedAircraft.normalizeValueFor("name", null)).toBeNull();
  });

  it("normalizes nil if apply_to_nil", () => {
    const IncludingNil = class extends Aircraft {};
    IncludingNil.normalizes("name", {
      with: (name: unknown) => (name ? titleize(name as string) : "Untitled"),
      applyToNil: true,
    });

    expect(IncludingNil.normalizeValueFor("name", null)).toBe("Untitled");
  });

  it("does not automatically normalize value from database", async () => {
    const created = await Aircraft.create({ name: "NOT titlecase" });
    const fromDatabase = await NormalizedAircraft.find(created.id);
    expect(fromDatabase.name).toBe("NOT titlecase");
  });

  it("finds record by normalized value", async () => {
    expect(aircraft.manufactured_at).toEqual(noon(time));
    const found = await NormalizedAircraft.findBy({ manufactured_at: time.getutc().xmlschema() });
    expect(found!.id).toBe(aircraft.id);
  });

  it("uses the same query when finding record by nil and normalized nil values", () => {
    expect(NormalizedAircraft.where({ name: null }).toSql()).toBe(
      NormalizedAircraft.where({ name: "" }).toSql(),
    );
  });

  it("can stack normalizations", () => {
    const TitlecaseThenReverse = class extends NormalizedAircraft {};
    TitlecaseThenReverse.normalizes("name", {
      with: (name: unknown) => (name as string).split("").reverse().join(""),
    });

    expect(TitlecaseThenReverse.normalizeValueFor("name", "titlecase THEN reverse")).toBe(
      "esreveR nehT esaceltiT",
    );
    expect(NormalizedAircraft.normalizeValueFor("name", "ONLY titlecase")).toBe("Only Titlecase");
  });

  it("minimizes number of times normalization is applied", async () => {
    const CountApplied = class extends Aircraft {};
    CountApplied.normalizes("name", { with: (name: unknown) => succ(name as string) });

    const counted = await CountApplied.createBang({ name: "0" });
    expect(counted.name).toBe("1");

    counted.name = "0";
    expect(counted.name).toBe("1");
    await counted.save();
    expect(counted.name).toBe("1");

    counted._attributes.writeCastValue("name", "0");
    expect(counted.name).toBe("0");
    await counted.save();
    expect(counted.name).toBe("1");
  });
});

function succ(value: string): string {
  return String(Number(value) + 1);
}

describe("normalizes on Base", () => {
  fixtures([]);

  it("normalizes attributes before persistence", async () => {
    class NormalizedUser extends Base {
      declare name: any;
      static _tableName = "aircraft";
      static {
        this.normalizes("name", {
          with: (name: unknown) => (typeof name === "string" ? name.trim().toLowerCase() : name),
        });
      }
    }

    const user = await NormalizedUser.create({ name: "  ALICE  " });
    expect(user.name).toBe("alice");
  });
});
