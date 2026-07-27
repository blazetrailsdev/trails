/**
 * trails-specific strict-loading invariants with no Rails counterpart.
 *
 * These guard the `find_target?` gate (a new-record strict-loading owner
 * WITHOUT the foreign key present returns nil/[] silently instead of
 * raising). They were relocated verbatim out of
 * strict-loading.test.ts (which mirrors strict_loading_test.rb) so the
 * convention file tracks Rails 1:1.
 */
import { describe, it, expect } from "vitest";
import { findTarget } from "./associations/singular-association.js";
import { StrictLoadingViolationError, registerModel } from "./index.js";
import { findTarget as findHasManyTarget } from "./associations/has-many-association.js";
import { fixtures } from "./test-helpers/fixtures.js";
import { Developer, AuditLog } from "./test-helpers/models/developer.js";
import { Ship } from "./test-helpers/models/ship.js";
import { Project } from "./test-helpers/models/project.js";
import { Firm } from "./test-helpers/models/company.js";

interface ReflectionHost {
  _reflectOnAssociation(name: string): { options: Record<string, unknown> };
}

// The loaders mirror Rails' `find_target?` gate
// (association.rb:320-321): `violates_strict_loading?` is reached only from
// inside `find_target`, which `find_target?` enters when
// `!owner.new_record? || foreign_key_present?`. So a new-record strict-loading
// owner WITHOUT the foreign key present returns nil/[] silently instead of
// raising; once the FK (belongs_to) or owner PK (has_one/has_many via
// `ForeignAssociation#foreign_key_present?`) is present, it raises again.
//
// HABTM is NOT in that second group. Rails installs it as
// `has_many name, scope, **hm_options` through a generated middle reflection
// (associations.rb:1896-1905), so the runtime association is
// `HasManyThroughAssociation` and `foreign_key_present?` comes from
// `ThroughAssociation` (through_association.rb:90-93), which is true only when
// the through reflection is a `belongs_to`. The middle reflection is a
// `has_many` onto the join model, so it is always false — a new HABTM owner
// never reaches `find_target` no matter what the owner PK holds, and only a
// persisted owner raises.
//
// Uses the canonical `Developer` and friends — the
// same models Rails' strict_loading_test.rb drives (`has_many :audit_logs`,
// `has_one :ship`, `belongs_to :firm`, `has_and_belongs_to_many :projects`).
describe("StrictLoadingNewRecordFindTargetTest", () => {
  // `fixtures` wires the handler suite internally; the `developers`
  // fixture gives a persisted owner for the unchanged-behavior assertion.
  const { developers } = fixtures(["developers"]);
  // The loaders resolve target classes by name from the registry; register the
  // canonical targets so `Developer`'s declared associations resolve.
  registerModel(Developer);
  registerModel(AuditLog);
  registerModel(Ship);
  registerModel(Project);
  registerModel(Firm);

  const optionsFor = (name: string) =>
    (Developer as unknown as ReflectionHost)._reflectOnAssociation(name).options;

  it("does not raise on lazy loading a has_many on a new strict-loading owner without the foreign key", async () => {
    const developer = new Developer({ name: "New Dev" });
    developer.strictLoadingBang();
    expect(developer.isNewRecord()).toBe(true);
    await expect(
      findHasManyTarget(developer, "auditLogs", optionsFor("auditLogs")),
    ).resolves.toEqual([]);
  });

  it("does not raise on lazy loading a has_one on a new strict-loading owner without the foreign key", async () => {
    const developer = new Developer({ name: "New Dev" });
    developer.strictLoadingBang();
    await expect(findTarget(developer, "ship", optionsFor("ship"), "hasOne")).resolves.toBeNull();
  });

  it("does not raise on lazy loading a belongs_to on a new strict-loading owner without the foreign key", async () => {
    const developer = new Developer({ name: "New Dev" });
    developer.strictLoadingBang();
    await expect(
      findTarget(developer, "firm", optionsFor("firm"), "belongsTo"),
    ).resolves.toBeNull();
  });

  it("does not raise on lazy loading a habtm on a new strict-loading owner without the foreign key", async () => {
    const developer = new Developer({ name: "New Dev" });
    developer.strictLoadingBang();
    await expect(developer.projects.toArray()).resolves.toEqual([]);
  });

  it("does not raise on lazy loading a belongs_to on a persisted strict-loading owner without the foreign key", async () => {
    // belongs_to_association.rb:124 find_target? = !loaded? && foreign_key_present?
    // — no new-record branch, so a persisted owner with a nil FK never reaches
    // find_target and never raises (matches the OO belongs_to association).
    const developer = await Developer.find(developers("david").id);
    developer.firm_id = null as unknown as number;
    developer.strictLoadingBang();
    expect(developer.isNewRecord()).toBe(false);
    await expect(
      findTarget(developer, "firm", optionsFor("firm"), "belongsTo"),
    ).resolves.toBeNull();
  });

  it("raises on lazy loading a belongs_to on a new strict-loading owner with the foreign key present", async () => {
    const developer = new Developer({ name: "New Dev", firm_id: 1 });
    developer.strictLoadingBang();
    expect(developer.isNewRecord()).toBe(true);
    await expect(findTarget(developer, "firm", optionsFor("firm"), "belongsTo")).rejects.toThrow(
      StrictLoadingViolationError,
    );
  });

  it("raises on lazy loading a has_many on a new strict-loading owner with the primary key present", async () => {
    const developer = new Developer({ name: "New Dev", id: 1 });
    developer.strictLoadingBang();
    expect(developer.isNewRecord()).toBe(true);
    await expect(
      findHasManyTarget(developer, "auditLogs", optionsFor("auditLogs")),
    ).rejects.toThrow(StrictLoadingViolationError);
  });

  it("still raises on lazy loading a strict-loading has_many on a persisted owner", async () => {
    const developer = await Developer.find(developers("david").id);
    developer.strictLoadingBang();
    expect(developer.isNewRecord()).toBe(false);
    await expect(
      findHasManyTarget(developer, "auditLogs", optionsFor("auditLogs")),
    ).rejects.toThrow(StrictLoadingViolationError);
  });
});
