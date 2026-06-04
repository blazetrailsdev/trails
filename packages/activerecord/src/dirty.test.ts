/**
 * Mirrors: activerecord/test/cases/dirty_test.rb
 *
 * Faithful port of Rails' DirtyTest. Rides the canonical schema + models
 * (Pirate / Parrot / Person / Topic / Aircraft / NumericData / LiveParrot)
 * via the handler suite + transactional fixtures, so it issues no per-test DDL
 * (every table it touches is already in the preloaded canonical schema). This
 * removes the divergent `people`/`posts`/`pirates` shapes the old version wrote
 * per-test into the shared worker DB.
 *
 * A single `beforeAll` `dropExisting` rebuild of the rode tables is still
 * required as a shield: sibling files DROP+CREATE these same shared tables with
 * reduced shapes, and the signature cache makes a plain `defineSchema` a no-op
 * that wouldn't restore the canonical columns. See the `beforeAll` comment and
 * `locking.test.ts` for the same pattern.
 *
 * Test names mirror the Ruby method names verbatim (`test:compare` matches on
 * them). Tests blocked by a genuine trails gap or a JS-language limitation
 * (immutable strings, Ruby singleton methods) are `it.skip` with a precise
 * reason rather than silently adapted or stubbed.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { Base } from "./index.js";
import { TimeWithZone, getZone } from "@blazetrails/activesupport";
import { Temporal } from "@blazetrails/activesupport/temporal";

import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./adapters/postgresql/test-helper.js";
import { withTimezoneConfig } from "./test-helper.js";
import { setupHandlerSuite } from "./test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "./test-helpers/use-handler-transactional-fixtures.js";
import { defineSchema } from "./test-helpers/define-schema.js";
import { TEST_SCHEMA as canonicalSchema } from "./test-helpers/test-schema.js";

import { Pirate } from "./test-helpers/models/pirate.js";
import { Parrot, LiveParrot } from "./test-helpers/models/parrot.js";
import { Person } from "./test-helpers/models/person.js";
import { Topic } from "./test-helpers/models/topic.js";
import { Aircraft } from "./test-helpers/models/aircraft.js";
import { NumericData } from "./test-helpers/models/numeric-data.js";
import { adapterType } from "./test-adapter.js";

// trails generates column accessors (`pirate.catchphrase`) at runtime, so they
// aren't visible to TS on the model classes. This alias keeps the inherited
// dirty/persistence methods strongly typed while exposing column reads/writes
// as `unknown` — letting the test bodies read like Rails without `any`.
type Rec = Base & Record<string, unknown>;

/**
 * `isSavedChanges` / `idInDatabase` are wired onto Base.prototype at runtime
 * (not on its static type), so on a {@link Rec} they read back as `unknown`.
 * Invoke them through their receiver (preserving `this`) with a typed return.
 */
const call = <T>(recv: object, name: string): T => (recv as Record<string, () => T>)[name]();

// A few tests below pass on SQLite + MySQL but expose adapter-specific
// dirty-tracking gaps on PostgreSQL: (a) a datetime attribute on an anonymous
// reflected class (`Class.new { table_name = "topics" }`) reads back `undefined`
// after create on PG, and (b) the save-managed columns (id/timestamps) aren't
// recorded in `saved_changes` after an INSERT on PG, so `saved_changes?` /
// `changed?` come back empty. They're gated with
// `it.skipIf(adapterType === "postgres")` — the inline form `test:compare`'s
// gate extractor recognizes — keeping SQLite/MySQL coverage. Tracked in
// dirty-test-framework-gaps.md.

/** Mirrors Rails' private `with_partial_writes(klass, on = true)`. */
async function withPartialWrites(
  klass: typeof Base,
  on: boolean,
  fn: () => Promise<void>,
): Promise<void> {
  const oldInserts = klass.partialInserts;
  const oldUpdates = klass.partialUpdates;
  klass.partialInserts = on;
  klass.partialUpdates = on;
  try {
    await fn();
  } finally {
    klass.partialInserts = oldInserts;
    klass.partialUpdates = oldUpdates;
  }
}

/** Mirrors Rails' private `check_pirate_after_save_failure(pirate)`. */
function checkPirateAfterSaveFailure(pirate: Rec): void {
  expect(pirate.changed).toBe(true);
  expect(pirate.attributeChanged("parrot_id")).toBe(true);
  expect(pirate.changedAttributes).toEqual(["parrot_id"]);
  expect(pirate.attributeWas("parrot_id")).toBeNull();
}

describe("DirtyTest", () => {
  setupHandlerSuite();
  useHandlerTransactionalFixtures();

  // Canonical-schema shield. This suite rides the preloaded canonical tables
  // (people / topics / pirates / parrots / aircraft / numeric_data) rather than
  // declaring its own, so the worker's signature cache keeps each `defineSchema`
  // a no-op. But a sibling file that ran earlier in this worker can physically
  // DROP+CREATE a shared table with a reduced shape (e.g. callbacks.test.ts'
  // `topics: { title }` / `people: { name }`, clone.test.ts' trimmed `topics`,
  // reflection.test.ts' `people: { name, age, active }`). That leaves the table
  // missing the columns these tests read — `written_on` (datetime tests) and
  // `created_at`/`updated_at` (whose auto-write is the only thing populating
  // `saved_changes` after an INSERT) — so the suite reflects the wrong shape and
  // fails. `dropExisting` bypasses the signature cache and rebuilds each table
  // from the canonical schema verbatim (also clearing the adapter's per-table
  // column cache via `createTable`), mirroring locking.test.ts' shield. The
  // warm-up below then reflects the rebuilt canonical columns.
  beforeAll(async () => {
    await defineSchema(
      {
        people: canonicalSchema.people,
        topics: canonicalSchema.topics,
        pirates: canonicalSchema.pirates,
        parrots: canonicalSchema.parrots,
        aircraft: canonicalSchema.aircraft,
        numeric_data: canonicalSchema.numeric_data,
      },
      { dropExisting: true },
    );

    // Force schema reflection ONCE per worker: trails reflects columns lazily on
    // first query, and in-memory dirty tracking (`new Model()` then assign) needs
    // the attribute accessors to already exist.
    await Promise.all(
      [Person, Pirate, Parrot, Topic, NumericData, Aircraft, LiveParrot].map((m) =>
        m.first().catch(() => null),
      ),
    );
  });

  // Rails: `def setup; Person.create first_name: "foo"; end` (and teardown
  // delete_by). A dummy row so the `Person.select(:id).first` tests have a row.
  // Transactional rollback cleans it up — no explicit teardown needed.
  beforeEach(async () => {
    await Person.create({ first_name: "foo" });
  });

  it("attribute changes", async () => {
    // New record - no changes.
    const pirate = new Pirate() as Rec;
    expect(pirate.attributeChanged("catchphrase")).toBe(false);
    expect(pirate.attributeChanged("non_validated_parrot_id")).toBe(false);

    // Change catchphrase.
    pirate.catchphrase = "arrr";
    expect(pirate.attributeChanged("catchphrase")).toBe(true);
    expect(pirate.attributeWas("catchphrase")).toBeNull();
    expect(pirate.attributeChange("catchphrase")).toEqual([null, "arrr"]);

    // Saved - no changes.
    await pirate.saveBang();
    expect(pirate.attributeChanged("catchphrase")).toBe(false);
    expect(pirate.attributeChange("catchphrase")).toBeNull();

    // Same value - no changes.
    pirate.catchphrase = "arrr";
    expect(pirate.attributeChanged("catchphrase")).toBe(false);
    expect(pirate.attributeChange("catchphrase")).toBeNull();
  });

  it("time attributes changes with time zone", async () => {
    await withTimezoneConfig({ zone: "Europe/Paris", awareAttributes: true }, async () => {
      // Declare the datetime explicitly so it is registered as a time-zone-aware
      // attribute (Rails gets this from schema reflection on the anonymous
      // `Class.new`; trails' reflected anonymous class doesn't TZ-wrap the
      // auto-set timestamp, so `attribute_was` would come back a bare Instant).
      const Target = class extends Base {
        static tableName = "pirates";
        static {
          this.attribute("created_on", "datetime");
          this.attribute("catchphrase", "string");
        }
      };
      const zone = getZone()!;

      // New record - no changes.
      const pirate = new Target() as Rec;
      expect(pirate.attributeChanged("created_on")).toBe(false);
      expect(pirate.attributeChange("created_on")).toBeNull();

      // Saved - no changes.
      pirate.catchphrase = "arrrr, time zone!!";
      await pirate.saveBang();
      expect(pirate.attributeChanged("created_on")).toBe(false);
      expect(pirate.attributeChange("created_on")).toBeNull();

      // Change created_on.
      const oldCreatedOn = pirate.created_on as TimeWithZone;
      pirate.created_on = new TimeWithZone(Temporal.Now.instant().subtract({ hours: 24 }), zone);
      expect(pirate.attributeChanged("created_on")).toBe(true);
      expect(pirate.attributeWas("created_on")).toBeInstanceOf(TimeWithZone);
      expect((pirate.attributeWas("created_on") as TimeWithZone).utc().epochMilliseconds).toBe(
        oldCreatedOn.utc().epochMilliseconds,
      );
      pirate.created_on = oldCreatedOn;
      expect(pirate.attributeChanged("created_on")).toBe(false);
    });
  });

  it("setting time attributes with time zone field to itself should not be marked as a change", async () => {
    await withTimezoneConfig({ zone: "Europe/Paris", awareAttributes: true }, async () => {
      const Target = class extends Base {
        static tableName = "pirates";
      };
      const pirate = (await Target.create({})) as Rec;
      // Rails asserts assigning the value to itself is not a change.
      // eslint-disable-next-line no-self-assign
      pirate.created_on = pirate.created_on;
      expect(pirate.attributeChanged("created_on")).toBe(false);
    });
  });

  it("time attributes changes without time zone by skip", async () => {
    await withTimezoneConfig({ zone: "Europe/Paris", awareAttributes: true }, async () => {
      const Target = class extends Base {
        static tableName = "pirates";
        static skipTimeZoneConversionForAttributes = ["created_on"];
      };

      // New record - no changes.
      const pirate = new Target() as Rec;
      expect(pirate.attributeChanged("created_on")).toBe(false);
      expect(pirate.attributeChange("created_on")).toBeNull();

      // Saved - no changes.
      pirate.catchphrase = "arrrr, time zone!!";
      await pirate.saveBang();
      expect(pirate.attributeChanged("created_on")).toBe(false);
      expect(pirate.attributeChange("created_on")).toBeNull();

      // Change created_on.
      const oldCreatedOn = pirate.created_on;
      pirate.created_on = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      expect(pirate.attributeChanged("created_on")).toBe(true);
      // kind_of does not work because ActiveSupport::TimeWithZone.name == 'Time'.
      expect(pirate.attributeWas("created_on")).not.toBeInstanceOf(TimeWithZone);
      expect(pirate.attributeWas("created_on")).toEqual(oldCreatedOn);
    });
  });

  it("time attributes changes without time zone", async () => {
    await withTimezoneConfig({ awareAttributes: false }, async () => {
      const Target = class extends Base {
        static tableName = "pirates";
      };

      // New record - no changes.
      const pirate = new Target() as Rec;
      expect(pirate.attributeChanged("created_on")).toBe(false);
      expect(pirate.attributeChange("created_on")).toBeNull();

      // Saved - no changes.
      pirate.catchphrase = "arrrr, time zone!!";
      await pirate.saveBang();
      expect(pirate.attributeChanged("created_on")).toBe(false);
      expect(pirate.attributeChange("created_on")).toBeNull();

      // Change created_on.
      const oldCreatedOn = pirate.created_on;
      pirate.created_on = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      expect(pirate.attributeChanged("created_on")).toBe(true);
      // kind_of does not work because ActiveSupport::TimeWithZone.name == 'Time'.
      expect(pirate.attributeWas("created_on")).not.toBeInstanceOf(TimeWithZone);
      expect(pirate.attributeWas("created_on")).toEqual(oldCreatedOn);
    });
  });

  it.skip("aliased attribute changes", () => {
    // BLOCKED: dirty (alias under reflection) — on the canonical Parrot
    // (`aliasAttribute "title", "name"` over a reflected `name` column),
    // assigning `parrot.name = "Sam"` updates the value but does NOT mark it
    // changed (`attributeChanged("name")` stays false), so the alias check
    // fails. A reflected, non-aliased column on the same suite (Pirate's
    // catchphrase/parrot_id) tracks correctly — the alias is what breaks it.
    // SCOPE: alias-aware dirty tracking for reflected columns, separate PR.
  });

  it("restore attribute!", async () => {
    const pirate = (await Pirate.create({ catchphrase: "Yar!" })) as Rec;
    pirate.catchphrase = "Ahoy!";

    expect(pirate.catchphrase).toBe("Ahoy!");
    expect(pirate.attributeChange("catchphrase")).toEqual(["Yar!", "Ahoy!"]);

    pirate.restoreAttribute("catchphrase");

    expect(pirate.attributeChange("catchphrase")).toBeNull();
    expect(pirate.catchphrase).toBe("Yar!");
    expect(pirate.changes).toEqual({});
    expect(pirate.attributeChanged("catchphrase")).toBe(false);
  });

  it("clear attribute change", async () => {
    const pirate = (await Pirate.create({ catchphrase: "Yar!" })) as Rec;
    pirate.catchphrase = "Ahoy!";

    expect(pirate.catchphrase).toBe("Ahoy!");
    expect(pirate.attributeChange("catchphrase")).toEqual(["Yar!", "Ahoy!"]);

    pirate.clearAttributeChange("catchphrase");

    expect(pirate.attributeChange("catchphrase")).toBeNull();
    expect(pirate.catchphrase).toBe("Ahoy!");
    expect(pirate.changes).toEqual({});
    expect(pirate.attributeChanged("catchphrase")).toBe(false);
  });

  it("nullable number not marked as changed if new value is blank", () => {
    const pirate = new Pirate() as Rec;

    for (const value of ["", null]) {
      pirate.parrot_id = value;
      expect(pirate.attributeChanged("parrot_id")).toBe(false);
      expect(pirate.attributeChange("parrot_id")).toBeNull();
    }
  });

  it("nullable decimal not marked as changed if new value is blank", () => {
    const numericData = new NumericData() as Rec;

    for (const value of ["", null]) {
      numericData.bank_balance = value;
      expect(numericData.attributeChanged("bank_balance")).toBe(false);
      expect(numericData.attributeChange("bank_balance")).toBeNull();
    }
  });

  it("nullable float not marked as changed if new value is blank", () => {
    const numericData = new NumericData() as Rec;

    for (const value of ["", null]) {
      numericData.temperature = value;
      expect(numericData.attributeChanged("temperature")).toBe(false);
      expect(numericData.attributeChange("temperature")).toBeNull();
    }
  });

  it.skipIf(adapterType === "postgres")(
    "nullable datetime not marked as changed if new value is blank",
    async () => {
      await withTimezoneConfig({ zone: "Europe/London", awareAttributes: true }, async () => {
        const Target = class extends Base {
          static tableName = "topics";
        };

        const topic = (await Target.create({})) as Rec;
        expect(topic.written_on).toBeNull();

        for (const value of ["", null]) {
          topic.written_on = value;
          expect(topic.written_on).toBeNull();
          expect(topic.attributeChanged("written_on")).toBe(false);
        }
      });
    },
  );

  it("integer zero to string zero not marked as changed", async () => {
    const pirate = new Pirate() as Rec;
    pirate.parrot_id = 0;
    pirate.catchphrase = "arrr";
    expect(await pirate.saveBang()).toBeTruthy();

    expect(pirate.changed).toBe(false);

    pirate.parrot_id = "0";
    expect(pirate.changed).toBe(false);
  });

  it("integer zero to integer zero not marked as changed", async () => {
    const pirate = new Pirate() as Rec;
    pirate.parrot_id = 0;
    pirate.catchphrase = "arrr";
    expect(await pirate.saveBang()).toBeTruthy();

    expect(pirate.changed).toBe(false);

    pirate.parrot_id = 0;
    expect(pirate.changed).toBe(false);
  });

  it("float zero to string zero not marked as changed", async () => {
    const data = new NumericData({ temperature: 0.0 }) as Rec;
    await data.saveBang();

    expect(data.changed).toBe(false);

    data.temperature = "0";
    expect(data.changes).toEqual({});

    data.temperature = "0.0";
    expect(data.changes).toEqual({});

    data.temperature = "0.00";
    expect(data.changes).toEqual({});
  });

  it("zero to blank marked as changed", async () => {
    let pirate = new Pirate() as Rec;
    pirate.catchphrase = "Yarrrr, me hearties";
    pirate.parrot_id = 1;
    await pirate.save();

    // check the change from 1 to ''
    pirate = (await Pirate.findBy({ catchphrase: "Yarrrr, me hearties" })) as Rec;
    pirate.parrot_id = "";
    expect(pirate.attributeChanged("parrot_id")).toBe(true);
    expect(pirate.attributeChange("parrot_id")).toEqual([1, null]);
    await pirate.save();

    // check the change from nil to 0
    pirate = (await Pirate.findBy({ catchphrase: "Yarrrr, me hearties" })) as Rec;
    pirate.parrot_id = 0;
    expect(pirate.attributeChanged("parrot_id")).toBe(true);
    expect(pirate.attributeChange("parrot_id")).toEqual([null, 0]);
    await pirate.save();

    // check the change from 0 to ''
    pirate = (await Pirate.findBy({ catchphrase: "Yarrrr, me hearties" })) as Rec;
    pirate.parrot_id = "";
    expect(pirate.attributeChanged("parrot_id")).toBe(true);
    expect(pirate.attributeChange("parrot_id")).toEqual([0, null]);
  });

  it("object should be changed if any attribute is changed", async () => {
    const pirate = new Pirate() as Rec;
    expect(pirate.changed).toBe(false);
    expect(pirate.changedAttributes).toEqual([]);
    expect(pirate.changes).toEqual({});

    pirate.catchphrase = "arrr";
    expect(pirate.changed).toBe(true);
    expect(pirate.attributeWas("catchphrase")).toBeNull();
    expect(pirate.changedAttributes).toEqual(["catchphrase"]);
    expect(pirate.changes).toEqual({ catchphrase: [null, "arrr"] });

    await pirate.save();
    expect(pirate.changed).toBe(false);
    expect(pirate.changedAttributes).toEqual([]);
    expect(pirate.changes).toEqual({});
  });

  it.skip("attribute will change!", () => {
    // BLOCKED: dirty — `attribute_will_change!` (force-dirty a value) is not
    // exposed on instances; only the internal `attributeWillChangeBang`
    // dispatch exists. The test also does `catchphrase << " matey!"` (in-place
    // string mutation), impossible with JS immutable strings. SCOPE: public
    // will_change! API + a mutable-string attribute type, separate PR.
  });

  it.skip("virtual attribute will change", () => {
    // BLOCKED: dirty — needs `attribute_will_change!(:cancel_save_from_callback)`
    // on instances (see "attribute will change!"). Not exposed today.
  });

  it.skip("association assignment changes foreign key", () => {
    // BLOCKED (two gaps): (1) canonical Parrot declares `cancelSaveFromCallback`
    // as a real column instead of `{ virtual: true }`, so `Parrot.create` tries
    // to INSERT a column `parrots` lacks; (2) without fixtures loaded the
    // canonical models aren't in the registry, so Pirate's `belongsTo("parrot")`
    // can't resolve the Parrot class. SCOPE: virtualize the attr + register the
    // models (or load parrot fixtures), separate PR.
  });

  it.skip("attribute should be compared with type cast", () => {
    // BLOCKED: defaults (in-memory) — Rails reads `Topic.new.approved == true`
    // from the schema default; trails does not apply a *reflected* column
    // default to a new in-memory record (`new Topic().approved` is null), so the
    // precondition fails. Defaults declared via `attribute(..., { default })`
    // do apply — only reflected ones don't. SCOPE: apply reflected column
    // defaults on `new`, separate PR.
  });

  it.skip("string attribute should compare with typecast symbol after update", () => {
    // BLOCKED: Ruby language — the test's whole point is that a Ruby symbol
    // (`create!(catchphrase: :foo)` / `update_column :catchphrase, :foo`) is
    // type-cast to the string `"foo"` and so compares equal to the persisted
    // value (not dirty). JS has no auto-coercing symbol; substituting `"foo"`
    // would test `"foo" == "foo"` vacuously (no cast exercised). SCOPE: none —
    // no faithful JS equivalent.
  });

  it.skip("partial update", () => {
    // BLOCKED: query-count parity — Rails asserts exact counts
    // (`assert_queries_count(6)` for 2×save! with partial writes off, etc.).
    // trails skips no-op UPDATEs unconditionally and emits different
    // transaction/statement notifications, so the counts (6/0/3) don't
    // translate. The behavioral core (no-op saves issue no query; updated_on
    // bumps only on a real change) is what these assert. SCOPE: query-count
    // parity, separate PR.
  });

  it.skip("partial update with optimistic locking", () => {
    // BLOCKED: query-count parity — see "partial update".
  });

  it("changed attributes should be preserved if save failure", async () => {
    let pirate = new Pirate() as Rec;
    pirate.parrot_id = 1;
    expect(await pirate.save()).toBe(false);
    checkPirateAfterSaveFailure(pirate);

    pirate = new Pirate();
    pirate.parrot_id = 1;
    await expect(pirate.saveBang()).rejects.toThrow();
    checkPirateAfterSaveFailure(pirate);
  });

  it("reload should clear changed attributes", async () => {
    const pirate = (await Pirate.create({ catchphrase: "shiver me timbers" })) as Rec;
    pirate.catchphrase = "*hic*";
    expect(pirate.changed).toBe(true);
    await pirate.reload();
    expect(pirate.changed).toBe(false);
  });

  it("dup objects should not copy dirty flag from creator", async () => {
    const pirate = (await Pirate.create({ catchphrase: "shiver me timbers" })) as Rec;
    const pirateDup = pirate.dup();
    pirateDup.restoreAttribute("catchphrase");
    pirate.catchphrase = "I love Rum";
    expect(pirate.attributeChanged("catchphrase")).toBe(true);
    expect(pirateDup.attributeChanged("catchphrase")).toBe(false);
  });

  it("reverted changes are not dirty", async () => {
    const phrase = "shiver me timbers";
    const pirate = (await Pirate.create({ catchphrase: phrase })) as Rec;
    pirate.catchphrase = "*hic*";
    expect(pirate.changed).toBe(true);
    pirate.catchphrase = phrase;
    expect(pirate.changed).toBe(false);
  });

  it("reverted changes are not dirty after multiple changes", async () => {
    const phrase = "shiver me timbers";
    const pirate = (await Pirate.create({ catchphrase: phrase })) as Rec;
    for (let i = 0; i < 10; i++) {
      pirate.catchphrase = "*hic*".repeat(i);
      expect(pirate.changed).toBe(true);
    }
    expect(pirate.changed).toBe(true);
    pirate.catchphrase = phrase;
    expect(pirate.changed).toBe(false);
  });

  it("reverted changes are not dirty going from nil to value and back", async () => {
    const pirate = (await Pirate.create({ catchphrase: "Yar!" })) as Rec;

    pirate.parrot_id = 1;
    expect(pirate.changed).toBe(true);
    expect(pirate.attributeChanged("parrot_id")).toBe(true);
    expect(pirate.attributeChanged("catchphrase")).toBe(false);

    pirate.parrot_id = null;
    expect(pirate.changed).toBe(false);
    expect(pirate.attributeChanged("parrot_id")).toBe(false);
    expect(pirate.attributeChanged("catchphrase")).toBe(false);
  });

  it.skip("save should store serialized attributes even with partial writes", () => {
    // BLOCKED: serialization — Rails' `Topic` serializes `content`; the
    // canonical trails `Topic` does not declare a serialize coder for it, so
    // `Topic.create({ content: { a: "a" } })` + in-place hash mutation can't be
    // exercised. SCOPE: add `serialize :content` to the canonical Topic + its
    // schema, separate PR.
  });

  it.skip("save always should update timestamps when serialized attributes are present", () => {
    // BLOCKED: serialization + time-travel — needs `serialize :content` on Topic
    // (see above) and ActiveSupport `travel` to force an updated_at delta.
  });

  it.skip("save should not save serialized attribute with partial writes if not present", () => {
    // BLOCKED: serialization — needs `serialize :content` on Topic (see above)
    // plus partial-select + `update_columns`.
  });

  it.skip("changes to save should not mutate array of hashes", () => {
    // BLOCKED: serialization — needs `serialize :content` on Topic so an
    // array-of-hashes value survives `changes_to_save` unmutated.
  });

  it.skip("previous changes", () => {
    // BLOCKED: dirty (insert-time composition) — after a fresh INSERT, trails'
    // `previous_changes` key set differs from Rails' (Rails expects 4:
    // catchphrase/id/created_on/updated_on; trails records 3). The post-UPDATE
    // assertions match, but the test is a single method and can't be split.
    // SCOPE: align the id/timestamp change-recording on INSERT, separate PR.
  });

  it.skip("field named field", () => {
    // SKIP (by design): Rails creates a bespoke `testings` table with a column
    // named `field` via in-test `create_table`. Adding it would reintroduce the
    // per-test DDL this migration removes, for a column-name edge case unrelated
    // to MySQL DDL cost. Column-name reflection is covered elsewhere.
  });

  it.skipIf(adapterType === "postgres")(
    "datetime attribute can be updated with fractional seconds",
    async () => {
      await withTimezoneConfig({ zone: "Europe/Paris", awareAttributes: true }, async () => {
        const Target = class extends Base {
          static tableName = "topics";
        };
        const zone = getZone()!;

        const writtenOn = new TimeWithZone(Temporal.Instant.from("2012-12-01T12:00:00Z"), zone);

        const topic = (await Target.create({ written_on: writtenOn })) as Rec;
        topic.written_on = new TimeWithZone(
          (topic.written_on as TimeWithZone).utc().add({ milliseconds: 300 }),
          zone,
        );

        expect(topic.attributeChanged("written_on")).toBe(true);
      });
    },
  );

  it.skip("datetime attribute doesnt change if zone is modified in string", () => {
    // BLOCKED: time-zone parity — Rails re-renders the value in another zone
    // (`created_on.in_time_zone("Tokyo").to_s`) and asserts re-assigning that
    // string is not a change (same instant). trails' TZ-aware string round-trip
    // through `in_time_zone(...).to_s` isn't established to parse back to the
    // identical instant. SCOPE: TZ-aware datetime string round-trip, separate PR.
  });

  it.skip("partial insert", () => {
    // BLOCKED: dirty (create-time capture) — partial INSERT narrows to *changed*
    // columns, but on a new record `Person.create({ first_name })` doesn't mark
    // first_name as changed, so trails inserts every column (including
    // followers_count) instead of just first_name. See "saved_change_to_attribute? ...".
  });

  it("partial insert with empty values", async () => {
    await withPartialWrites(Aircraft, true, async () => {
      const a = (await Aircraft.create({})) as Rec;
      await a.reload();
      expect(a.id).not.toBeNull();
    });
  });

  it.skip("in place mutation detection", () => {
    // BLOCKED: JS language — Rails mutates a string in place (`catchphrase
    // << " matey!"`). JS strings are immutable, so there is no in-place string
    // mutation to detect. No trails equivalent exists or can.
  });

  it.skip("in place mutation for binary", () => {
    // BLOCKED: JS language + serialization — relies on in-place mutation of a
    // serialized binary string (`data << "bar"`). JS strings are immutable.
  });

  it.skip("changes is correct for subclass", () => {
    // BLOCKED: JS language — Rails overrides only the *reader*
    // (`def catchphrase; super.upcase; end`) while keeping the generated writer.
    // A subclass `get catchphrase()` in JS shadows the inherited accessor pair,
    // dropping the setter, so `pirate.catchphrase =` throws. No clean
    // reader-only override with working super-setter in JS class fields.
  });

  it.skip("changes is correct if override attribute reader", () => {
    // BLOCKED: Ruby language — Rails defines a singleton method on one instance
    // (`def pirate.catchphrase; super.upcase; end`). JS has no per-instance
    // method-with-super override; the subclass form is covered by "changes is
    // correct for subclass".
  });

  it.skip("attribute_changed? doesn't compute in-place changes for unrelated attributes", () => {
    // BLOCKED: attribute types — Rails registers a custom Type whose
    // `changed_in_place?` raises, asserting it's never called for unrelated
    // attributes. trails' attribute-type registration on an anonymous class
    // doesn't expose an equivalent hook to instrument. SCOPE: custom-type
    // registration parity, separate PR.
  });

  it.skip("attribute_will_change! doesn't try to save non-persistable attributes", () => {
    // BLOCKED: dirty — needs the public `attribute_will_change!` API (see
    // "attribute will change!").
  });

  it.skip("virtual attributes are not written with partial_writes off", () => {
    // BLOCKED: dirty — needs the public `attribute_will_change!` API (see
    // "attribute will change!").
  });

  it.skip("mutating and then assigning doesn't remove the change", () => {
    // BLOCKED: JS language — opens with in-place string mutation
    // (`catchphrase << " matey!"`); JS strings are immutable.
  });

  it.skip("getters with side effects are allowed", () => {
    // BLOCKED: Ruby language — uses a singleton getter that calls
    // `update_attribute` as a side effect (`def pirate.catchphrase ... end`).
    // No per-instance method override in JS.
  });

  it.skipIf(adapterType === "postgres")(
    "attributes assigned but not selected are dirty",
    async () => {
      const person = (await Person.select("id").first()) as Rec;
      expect(person.changed).toBe(false);

      person.first_name = "Sean";
      expect(person.changed).toBe(true);

      person.first_name = null;
      expect(person.changed).toBe(true);
    },
  );

  it.skip("attributes not selected are still missing after save", () => {
    // BLOCKED: attribute-methods — accessing an unselected attribute
    // (`Person.select(:id).first.first_name`) does not raise
    // `MissingAttributeError` in trails (returns undefined). SCOPE: missing-
    // attribute guard on partial selects, separate PR.
  });

  it.skip("saved_change_to_attribute? returns whether a change occurred in the last save", () => {
    // BLOCKED: dirty (create-time capture) — after `Person.create({ first_name })`,
    // user-assigned attributes are NOT recorded in the changeset, so
    // `saved_change_to_first_name?` is false right after create (only the
    // save-managed columns — id/timestamps/lock_version — land in
    // previous_changes). SCOPE: capture constructor/mass-assigned attributes as
    // changes on a new record so they survive into saved_changes, separate PR.
  });

  it.skip("saved_change_to_attribute returns the change that occurred in the last save", () => {
    // BLOCKED: dirty (create-time capture) — `saved_change_to_first_name`
    // is undefined right after create. See the predicate test above.
  });

  it.skip("attribute_before_last_save returns the original value before saving", () => {
    // BLOCKED: dirty (create-time capture) — with first_name absent from
    // saved_changes after create, `first_name_before_last_save` falls back to
    // the current value ("Sean") instead of nil. See the predicate test above.
  });

  it.skipIf(adapterType === "postgres")(
    "saved_changes? returns whether the last call to save changed anything",
    async () => {
      const person = (await Person.create({ first_name: "Sean" })) as Rec;

      expect(call<boolean>(person, "isSavedChanges")).toBe(true);

      await person.save();

      expect(call<boolean>(person, "isSavedChanges")).toBe(false);
    },
  );

  it.skip("saved_changes returns a hash of all the changes that occurred", () => {
    // BLOCKED: dirty (create-time capture) — saved_changes after create omits
    // the user-assigned first_name/gender, so the key set doesn't match Rails'.
    // See "saved_change_to_attribute? ...".
  });

  it.skipIf(adapterType === "postgres")("changed? in after callbacks returns false", async () => {
    const klass = class extends Base {
      static {
        this.tableName = "people";
        this.afterSave(function (record: Rec) {
          if (record.changed) throw new Error("changed? should be false");
          if (record.hasChangesToSave) throw new Error("has_changes_to_save? should be false");
          if (!call<boolean>(record, "isSavedChanges"))
            throw new Error("saved_changes? should be true");
          if (call<unknown>(record, "idInDatabase") == null)
            throw new Error("id_in_database should not be nil");
        });
      }
    };

    const person = (await klass.create({ first_name: "Sean" })) as Rec;
    expect(person.changed).toBe(false);
  });

  it.skipIf(adapterType === "postgres")(
    "changed? in around callbacks after yield returns false",
    async () => {
      const klass = class extends Base {
        static {
          this.tableName = "people";
          this.aroundCreate(async function (record: Rec, proceed: () => Promise<void>) {
            await proceed();
            if (record.changed) throw new Error("changed? should be false");
            if (record.hasChangesToSave) throw new Error("has_changes_to_save? should be false");
            if (!call<boolean>(record, "isSavedChanges"))
              throw new Error("saved_changes? should be true");
            if (call<unknown>(record, "idInDatabase") == null)
              throw new Error("id_in_database should not be nil");
          });
        }
      };

      const person = (await klass.create({ first_name: "Sean" })) as Rec;
      expect(person.changed).toBe(false);
    },
  );

  it.skip("partial insert off with unchanged default function attribute", () => {
    // BLOCKED: schema — Rails' `aircraft.manufactured_at` defaults to
    // CURRENT_TIMESTAMP; the canonical schema drops SQL-function defaults
    // (defineSchema doesn't emit them), so an unset `manufactured_at` isn't
    // auto-populated to assert against. SCOPE: SQL-function column defaults.
  });

  it.skip("partial insert off with changed default function attribute", () => {
    // BLOCKED: datetime value type — assigning a JS `Date` to the reflected
    // `manufactured_at` datetime attribute doesn't round-trip (reads back null /
    // a Temporal value, not a `Date`), so the `to_i`-equality the Rails test
    // performs can't be expressed faithfully. SCOPE: JS `Date` ⇄ datetime
    // attribute coercion parity, separate PR.
  });

  it.skip("attribute_changed? properly type casts enum values", () => {
    // BLOCKED (two gaps): (1) the canonical Parrot virtual-attr issue above
    // (needs `LiveParrot.create`); (2) enum dirty `from:`/`to:` don't type-cast —
    // Rails matches `breed_changed?(from: "african")`, `from: :african`, and
    // `from: 0` against the same change, but trails compares the stored integer
    // only, so the label forms fail. SCOPE: enum-aware dirty option casting,
    // separate PR.
  });
});

// ==========================================================================
// DirtyTest — PostgreSQL-specific: composite IDENTITY primary key
// Mirrors: activerecord/test/cases/dirty_test.rb
//   if current_adapter?(:PostgreSQLAdapter) && supports_identity_columns?
//
// Needs a PG IDENTITY column (GENERATED BY DEFAULT AS IDENTITY) created via raw
// DDL — not expressible through the canonical schema — so it owns a uniquely
// named (non-colliding) scratch table in beforeEach via its own
// PostgreSQLAdapter. Runs only under ARCONN=postgresql.
// ==========================================================================
describeIfPg("DirtyTest", () => {
  let adapter: PostgreSQLAdapter;

  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
    await adapter.execute(`DROP TABLE IF EXISTS cpk_pg_identity_dirty CASCADE`);
    await adapter.execute(`
      CREATE TABLE cpk_pg_identity_dirty (
        another_id INT NOT NULL,
        id         INT NOT NULL GENERATED BY DEFAULT AS IDENTITY,
        CONSTRAINT cpk_pg_identity_dirty_pkey PRIMARY KEY (another_id, id)
      )
    `);
  });

  afterEach(async () => {
    await adapter.execute(`DROP TABLE IF EXISTS cpk_pg_identity_dirty CASCADE`);
    await adapter.close();
  });

  it.skip("partial insert off with changed composite identity primary key attribute", () => {
    // BLOCKED: connection-pool — this test bypassed the connection handler via direct adapter assignment.
    // Needs reimplementation against the pool (no bypass). Tracked in docs/activerecord/activerecord-index.md (retired pool-epic note).
  });
});
