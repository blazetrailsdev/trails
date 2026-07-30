/**
 * Preloader::ThroughAssociation#records_by_owner forces its child loaders.
 *
 * Rails reaches `through_records_by_owner` / `source_records_by_owner` through
 * the public `records_by_owner` reader, which forces `load_records` before
 * answering (preloader/association.rb:148-151), so neither reader can observe
 * an unloaded child loader. trails' readers are synchronous — `middle_records`
 * is reached from `runnable_loaders` / `future_classes`, which cannot await —
 * so `recordsByOwner` awaits the children itself.
 *
 * The `Batch` runner always runs the through and source loaders before calling
 * `recordsByOwner`, so this pins the *direct* call, which nothing else covers:
 * without the forcing step the merges would read empty child caches and
 * memoize an empty result instead of loading the records.
 */
import { describe, it, expect } from "vitest";
import { registerModel } from "../../index.js";
import { fixtures } from "../../test-fixtures.js";
import { Preloader } from "../preloader.js";
import { ThroughAssociation } from "./through-association.js";
import { Member } from "../../test-helpers/models/member.js";
import { MemberDetail } from "../../test-helpers/models/member-detail.js";
import { Organization } from "../../test-helpers/models/organization.js";

registerModel(Member);
registerModel(MemberDetail);
registerModel(Organization);

describe("Preloader::ThroughAssociation#records_by_owner child forcing", () => {
  const { members, memberDetails } = fixtures(["members", "organizations", "memberDetails"]);

  function throughLoader(owners: Member[], name: string): ThroughAssociation {
    const loader = new Preloader({
      records: owners,
      associations: [name],
      associateByDefault: false,
    }).loaders.find((l) => l instanceof ThroughAssociation);
    if (!loader) throw new Error("expected a ThroughAssociation loader");
    return loader;
  }

  it("loads the through and source records when called before the batch runs them", async () => {
    const groucho = members("groucho");
    const loader = throughLoader([groucho], "organizationMemberDetails_2");

    expect(loader.isRun()).toBe(false);

    const byOwner = await loader.recordsByOwner();

    const ids = (byOwner.get(groucho) ?? []).map((d) => Number(d.id)).sort();
    expect(ids).toEqual(
      [memberDetails("groucho"), memberDetails("some_other_guy")].map((d) => Number(d.id)).sort(),
    );
  });
});
