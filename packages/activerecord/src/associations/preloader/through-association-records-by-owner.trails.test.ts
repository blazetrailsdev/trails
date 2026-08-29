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

  async function throughLoader(owners: Member[], name: string): Promise<ThroughAssociation> {
    const loader = (
      await new Preloader({
        records: owners,
        associations: [name],
        associateByDefault: false,
      }).loaders()
    ).find((l) => l instanceof ThroughAssociation);
    if (!loader) throw new Error("expected a ThroughAssociation loader");
    return loader;
  }

  it("loads the through and source records when called before the batch runs them", async () => {
    const groucho = members("groucho");
    const loader = await throughLoader([groucho], "organizationMemberDetails_2");

    expect(loader.isRun()).toBe(false);

    const byOwner = await loader.recordsByOwner();

    const ids = (byOwner.get(groucho) ?? []).map((d) => Number(d.id)).sort();
    expect(ids).toEqual(
      [memberDetails("groucho"), memberDetails("some_other_guy")].map((d) => Number(d.id)).sort(),
    );
  });
});
