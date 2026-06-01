/**
 * Mirrors Rails activerecord/test/cases/associations/has_one_through_associations_test.rb
 */
import { describe, it, expect, beforeAll } from "vitest";
import { Base, registerModel } from "../index.js";
import { setupHandlerSuite } from "../test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "../test-helpers/use-handler-transactional-fixtures.js";
import {
  Associations,
  loadHasOne,
  loadHasMany,
  buildThroughAssociation,
  createThroughAssociation,
} from "../associations.js";
import {
  HasOneThroughCantAssociateThroughCollection,
  HasOneAssociationPolymorphicThroughError,
} from "./errors.js";
import {
  assertQueriesMatch,
  assertQueriesCount,
  assertNoQueries,
} from "../testing/query-assertions.js";
import { defineSchema, type Schema } from "../test-helpers/define-schema.js";

const TEST_SCHEMA = {
  clubs: { name: "string" },
  memberships: { member_id: "integer", club_id: "integer", type: "string" },
  members: { name: "string" },
  hotp_clubs: { name: "string" },
  hotp_sponsors: {
    sponsorable_id: "integer",
    sponsorable_type: "string",
    club_id: "integer",
  },
  hotp_members: { name: "string" },
  hotep_clubs: { name: "string" },
  hotep_sponsors: {
    sponsorable_id: "integer",
    sponsorable_type: "string",
    club_id: "integer",
  },
  hotep_members: { name: "string" },
  st_clubs: { name: "string" },
  st_sponsors: {
    club_id: "integer",
    sponsorable_id: "integer",
    sponsorable_type: "string",
  },
  st_members: { name: "string" },
  st_orgs: { name: "string" },
  es_clubs: { name: "string" },
  es_sponsors: {
    club_id: "integer",
    sponsorable_id: "integer",
    sponsorable_type: "string",
  },
  es_members: { name: "string" },
  es_orgs: { name: "string" },
  np_clubs: { name: "string" },
  np_sponsors: {
    sponsorable_id: "integer",
    sponsorable_type: "string",
    club_id: "integer",
  },
  np_members: { name: "string" },
  npm_clubs: { name: "string" },
  npm_sponsors: {
    sponsorable_id: "integer",
    sponsorable_type: "string",
    club_id: "integer",
  },
  npm_members: { name: "string" },
  ce_clubs: { name: "string" },
  ce_memberships: { member_id: "integer", club_id: "integer", favorite: "boolean" },
  ce_members: { name: "string" },
  pa_clubs: { name: "string" },
  pa_members: { name: "string", admittable_id: "integer", admittable_type: "string" },
  many_members: { name: "string" },
  things: {},
  cpk_clubs3: {
    columns: { region_id: "integer", id: "integer", name: "string" },
    primaryKey: ["region_id", "id"],
  },
  cpk_memberships3: {
    cpk_club_region_id: "integer",
    cpk_club_id: "integer",
    member_name: "string",
  },
  cpk_clubs2: {
    columns: { region_id: "integer", id: "integer", name: "string" },
    primaryKey: ["region_id", "id"],
  },
  cpk_memberships2: {
    cpk_club2_region_id: "integer",
    cpk_club2_id: "integer",
  },
} satisfies Schema;

describe("HasOneThroughAssociationsTest", () => {
  setupHandlerSuite();
  useHandlerTransactionalFixtures();

  class Club extends Base {
    static {
      this.attribute("name", "string");
    }
  }

  class Membership extends Base {
    static {
      this.attribute("member_id", "integer");
      this.attribute("club_id", "integer");
      this.attribute("type", "string");
    }
  }

  class Member extends Base {
    static {
      this.attribute("name", "string");
    }
  }

  beforeAll(async () => {
    await defineSchema(TEST_SCHEMA);
    registerModel(Club);
    registerModel(Membership);
    registerModel(Member);
    // Set up associations: Member has_one :membership, has_one :club through :membership
    (Member as any)._associations = [];
    (Membership as any)._associations = [];
    (Club as any)._associations = [];
    Associations.hasOne.call(Member, "membership", {
      className: "Membership",
      foreignKey: "member_id",
    });

    Associations.hasOne.call(Member, "club", {
      className: "Club",
      through: "membership",
      source: "club",
    });
    Associations.belongsTo.call(Membership, "member", {
      className: "Member",
      foreignKey: "member_id",
    });

    Associations.belongsTo.call(Membership, "club", { className: "Club", foreignKey: "club_id" });
  });

  it("has one through with has one", async () => {
    // member -> membership -> club
    const club = await Club.create({ name: "Rails Club" });
    const member = await Member.create({ name: "DHH" });
    await Membership.create({ member_id: member.id, club_id: club.id });
    // Load membership for member
    const membership = await loadHasOne(member, "membership", {
      className: "Membership",
      foreignKey: "member_id",
    });
    expect(membership).not.toBeNull();
    // Load club through membership
    const loadedClub = await loadHasOne(membership!, "club", {
      className: "Club",
      foreignKey: "id",
      primaryKey: "club_id",
    });
    expect(loadedClub).not.toBeNull();
    expect(loadedClub!.name).toBe("Rails Club");
  });

  it("has one through executes limited query", async () => {
    const club = await Club.create({ name: "Boring Club" });
    const member = await Member.create({ name: "Groucho" });
    await Membership.create({ member_id: member.id, club_id: club.id });
    await assertQueriesMatch(/LIMIT/i, undefined, false, async () => {
      const loaded = await member.loadHasOne("club");
      expect(loaded).not.toBeNull();
      expect((loaded as any).name).toBe("Boring Club");
    });
  });

  it("creating association creates through record", async () => {
    const member = await Member.create({ name: "DHH" });
    const club = await createThroughAssociation(member, "club", { name: "Rails Club" });
    expect(club.isPersisted()).toBe(true);
    expect(club.name).toBe("Rails Club");
    // Verify the membership was created
    const memberships = await Membership.all().where({ member_id: member.id }).toArray();
    expect(memberships.length).toBe(1);
    expect(memberships[0].readAttribute("club_id")).toBe(club.id);
  });

  it("association create constructor creates through record", async () => {
    const member = await Member.create({ name: "DHH" });
    const club = await createThroughAssociation(member, "club", { name: "New Club" });
    expect(club.isPersisted()).toBe(true);
    const memberships = await Membership.all().where({ member_id: member.id }).toArray();
    expect(memberships.length).toBe(1);
  });

  it("creating association builds through record", async () => {
    const member = await Member.create({ name: "DHH" });
    const { target, through } = buildThroughAssociation(member, "club", { name: "Built Club" });
    expect(target.isNewRecord()).toBe(true);
    expect(target.name).toBe("Built Club");
    expect(through.isNewRecord()).toBe(true);
    expect(through.readAttribute("member_id")).toBe(member.id);
  });

  it("association build constructor builds through record", async () => {
    const member = await Member.create({ name: "DHH" });
    const { target, through } = buildThroughAssociation(member, "club", { name: "Constructed" });
    expect(target.isNewRecord()).toBe(true);
    expect(through.isNewRecord()).toBe(true);
  });

  it("creating association builds through record for new", async () => {
    const member = new Member({ name: "New Member" });
    const { target, through } = buildThroughAssociation(member, "club", { name: "New Club" });
    expect(target.isNewRecord()).toBe(true);
    expect(through.isNewRecord()).toBe(true);
    // Owner PK is null since member is new, through FK should be null too
    expect(through.readAttribute("member_id")).toBeNull();
  });

  it.skip("building multiple associations builds through record", () => {
    // BLOCKED: fixture — MemberDetail (member_type_id + admittable polymorphic) model not defined in test suite
  });

  it.skip("building works with has one through belongs to", () => {
    // BLOCKED: fixture — current_membership / has_one :through :belongs_to chain fixture setup not defined
  });

  it("creating multiple associations creates through record", async () => {
    const member1 = await Member.create({ name: "Member1" });
    const member2 = await Member.create({ name: "Member2" });
    const club1 = await createThroughAssociation(member1, "club", { name: "Club1" });
    const club2 = await createThroughAssociation(member2, "club", { name: "Club2" });
    expect(club1.isPersisted()).toBe(true);
    expect(club2.isPersisted()).toBe(true);
    const allMemberships = await Membership.all().toArray();
    expect(allMemberships.length).toBe(2);
  });

  it("creating association sets both parent ids for new", async () => {
    const member = await Member.create({ name: "DHH" });
    const club = await createThroughAssociation(member, "club", { name: "FK Test" });
    const membership = (await Membership.all().where({ member_id: member.id }).toArray())[0];
    expect(membership.readAttribute("member_id")).toBe(member.id);
    expect(membership.readAttribute("club_id")).toBe(club.id);
  });

  it("replace target record", async () => {
    // Replace club by updating the through record's FK
    const club1 = await Club.create({ name: "Club1" });
    const club2 = await Club.create({ name: "Club2" });
    const member = await Member.create({ name: "Replacer" });
    const membership = await Membership.create({ member_id: member.id, club_id: club1.id });
    // Replace: update membership to point to club2
    membership.club_id = club2.id;
    await membership.save();
    const reloaded = await loadHasOne(member, "membership", {
      className: "Membership",
      foreignKey: "member_id",
    });
    expect(reloaded!.club_id).toBe(club2.id);
  });

  it("replacing target record deletes old association", async () => {
    // Delete old membership and create new one
    const club1 = await Club.create({ name: "OldClub" });
    const club2 = await Club.create({ name: "NewClub" });
    const member = await Member.create({ name: "Deleter" });
    const oldMembership = await Membership.create({ member_id: member.id, club_id: club1.id });
    await oldMembership.destroy();
    await Membership.create({ member_id: member.id, club_id: club2.id });
    const membership = await loadHasOne(member, "membership", {
      className: "Membership",
      foreignKey: "member_id",
    });
    expect(membership).not.toBeNull();
    expect(membership!.club_id).toBe(club2.id);
  });

  it("set record to nil should delete association", async () => {
    // When the through record is destroyed, the through association is nil
    const club = await Club.create({ name: "Nil Club" });
    const member = await Member.create({ name: "NilMember" });
    const membership = await Membership.create({ member_id: member.id, club_id: club.id });
    // Destroy the membership (through record)
    await membership.destroy();
    const loaded = await loadHasOne(member, "membership", {
      className: "Membership",
      foreignKey: "member_id",
    });
    expect(loaded).toBeNull();
  });

  it("has one through polymorphic", async () => {
    // member -> sponsor (has_one, polymorphic as: sponsorable) -> club (belongs_to)
    // has_one :sponsor_club, through: :sponsor, source: :club (where sponsor.sponsorable is polymorphic)
    class HotpClub extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class HotpSponsor extends Base {
      static {
        this.attribute("sponsorable_id", "integer");
        this.attribute("sponsorable_type", "string");
        this.attribute("club_id", "integer");
      }
    }
    class HotpMember extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    registerModel(HotpClub);
    registerModel(HotpSponsor);
    registerModel(HotpMember);
    Associations.hasOne.call(HotpMember, "sponsor", {
      className: "HotpSponsor",
      as: "sponsorable",
    });
    Associations.hasOne.call(HotpMember, "sponsorClub", {
      through: "sponsor",
      source: "club",
      className: "HotpClub",
    });
    Associations.belongsTo.call(HotpSponsor, "club", {
      className: "HotpClub",
      foreignKey: "club_id",
    });
    const club = await HotpClub.create({ name: "Moustache Club" });
    const member = await HotpMember.create({ name: "Groucho" });
    await HotpSponsor.create({
      sponsorable_id: member.id,
      sponsorable_type: "HotpMember",
      club_id: club.id,
    });
    const sponsorClub = await loadHasOne(member, "sponsorClub", {
      through: "sponsor",
      source: "club",
      className: "HotpClub",
    });
    expect(sponsorClub).not.toBeNull();
    expect(sponsorClub!.name).toBe("Moustache Club");
  });

  it("has one through eager loading", async () => {
    // member -> membership (hasOne) -> club (hasOne through)
    Associations.hasOne.call(Member, "membership", {
      className: "Membership",
      foreignKey: "member_id",
    });
    Associations.hasOne.call(Member, "club", {
      className: "Club",
      through: "membership",
      source: "club",
    });
    Associations.belongsTo.call(Membership, "club", { className: "Club", foreignKey: "club_id" });
    const club = await Club.create({ name: "Eager Club" });
    const member = await Member.create({ name: "Eager Member" });
    await Membership.create({ member_id: member.id, club_id: club.id });
    const members = await Member.all().includes("club").toArray();
    expect(members).toHaveLength(1);
    const preloaded = (members[0] as any)._preloadedAssociations?.get("club");
    expect(preloaded).not.toBeNull();
    expect(preloaded?.name).toBe("Eager Club");
  });

  it("has one through eager loading through polymorphic", async () => {
    // member -> sponsor (has_one, as: sponsorable) -> club (belongs_to)
    // member has_one :sponsor_club, through: :sponsor, source: :club
    class HotepClub extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class HotepSponsor extends Base {
      static {
        this.attribute("sponsorable_id", "integer");
        this.attribute("sponsorable_type", "string");
        this.attribute("club_id", "integer");
      }
    }
    class HotepMember extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    registerModel(HotepClub);
    registerModel(HotepSponsor);
    registerModel(HotepMember);
    Associations.hasOne.call(HotepMember, "sponsor", {
      className: "HotepSponsor",
      as: "sponsorable",
    });
    Associations.hasOne.call(HotepMember, "sponsorClub", {
      through: "sponsor",
      source: "club",
      className: "HotepClub",
    });
    Associations.belongsTo.call(HotepSponsor, "club", {
      className: "HotepClub",
      foreignKey: "club_id",
    });
    const club = await HotepClub.create({ name: "Polymorphic Eager Club" });
    const member = await HotepMember.create({ name: "Groucho" });
    await HotepSponsor.create({
      sponsorable_id: member.id,
      sponsorable_type: "HotepMember",
      club_id: club.id,
    });
    const members = await HotepMember.all().includes("sponsorClub").toArray();
    expect(members).toHaveLength(1);
    const preloaded = (members[0] as any)._preloadedAssociations?.get("sponsorClub");
    expect(preloaded).not.toBeNull();
    expect(preloaded?.name).toBe("Polymorphic Eager Club");
  });

  it("has one through with conditions eager loading", async () => {
    class CeClub extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class CeMembership extends Base {
      static {
        this.attribute("member_id", "integer");
        this.attribute("club_id", "integer");
        this.attribute("favorite", "boolean");
      }
    }
    class CeMember extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    registerModel(CeClub);
    registerModel(CeMembership);
    registerModel(CeMember);
    Associations.hasOne.call(CeMember, "membership", {
      className: "CeMembership",
      foreignKey: "member_id",
    });
    Associations.belongsTo.call(CeMembership, "club", {
      className: "CeClub",
      foreignKey: "club_id",
    });
    // conditions on the through table
    Associations.hasOne.call(CeMember, "favoriteClub", {
      className: "CeClub",
      through: "membership",
      source: "club",
      scope: (rel: any) => rel.where({ ce_memberships: { favorite: true } }),
    });
    // conditions on the source table
    Associations.hasOne.call(CeMember, "hairyClub", {
      className: "CeClub",
      through: "membership",
      source: "club",
      scope: (rel: any) => rel.where({ ce_clubs: { name: "Moustache and Eyebrow Fancier Club" } }),
    });

    const club = await CeClub.create({ name: "Moustache and Eyebrow Fancier Club" });
    const member = await CeMember.create({ name: "Groucho" });
    const membership = await CeMembership.create({
      member_id: member.id,
      club_id: club.id,
      favorite: true,
    });

    // conditions on the through table — includes-only preload (no references).
    // The through-table WHERE is copied onto the through query; Rails:
    // `Member.all.merge!(includes: :favorite_club)`.
    let loaded = await CeMember.all().includes("favoriteClub").toArray();
    expect((loaded[0] as any).association("favoriteClub").target?.name).toBe(
      "Moustache and Eyebrow Fancier Club",
    );
    await membership.update({ favorite: false });
    loaded = await CeMember.all().includes("favoriteClub").toArray();
    expect((loaded[0] as any).association("favoriteClub").target).toBeNull();

    // conditions on the source table
    loaded = await CeMember.all().includes("hairyClub").toArray();
    expect((loaded[0] as any).association("hairyClub").target?.name).toBe(
      "Moustache and Eyebrow Fancier Club",
    );
    await club.update({ name: "Association of Clean-Shaven Persons" });
    loaded = await CeMember.all().includes("hairyClub").toArray();
    expect((loaded[0] as any).association("hairyClub").target).toBeNull();
  });

  it("has one through polymorphic with source type", async () => {
    class StClub extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class StSponsor extends Base {
      static {
        this.attribute("club_id", "integer");
        this.attribute("sponsorable_id", "integer");
        this.attribute("sponsorable_type", "string");
      }
    }
    class StMember extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class StOrg extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    registerModel(StClub);
    registerModel(StSponsor);
    registerModel(StMember);
    registerModel(StOrg);
    Associations.hasOne.call(StClub, "sponsor", { className: "StSponsor", foreignKey: "club_id" });
    Associations.hasOne.call(StClub, "sponsoredMember", {
      className: "StMember",
      through: "sponsor",
      source: "sponsorable",
      sourceType: "StMember",
    });
    Associations.belongsTo.call(StSponsor, "sponsorable", { polymorphic: true });

    const memberClub = await StClub.create({ name: "Moustache Club" });
    const member = await StMember.create({ name: "Groucho" });
    await StSponsor.create({
      club_id: memberClub.id,
      sponsorable_id: member.id,
      sponsorable_type: "StMember",
    });

    // A club whose sponsor is an Organization — sourceType filter must exclude it
    const orgClub = await StClub.create({ name: "Boring Club" });
    const org = await StOrg.create({ name: "NSA" });
    await StSponsor.create({
      club_id: orgClub.id,
      sponsorable_id: org.id,
      sponsorable_type: "StOrg",
    });

    const sponsoredMember = await memberClub.loadHasOne("sponsoredMember");
    expect(sponsoredMember).not.toBeNull();
    expect((sponsoredMember as any).name).toBe("Groucho");

    const noMember = await orgClub.loadHasOne("sponsoredMember");
    expect(noMember).toBeNull();
  });

  it("eager has one through polymorphic with source type", async () => {
    class EsClub extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class EsSponsor extends Base {
      static {
        this.attribute("club_id", "integer");
        this.attribute("sponsorable_id", "integer");
        this.attribute("sponsorable_type", "string");
      }
    }
    class EsMember extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class EsOrg extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    registerModel(EsClub);
    registerModel(EsSponsor);
    registerModel(EsMember);
    registerModel(EsOrg);
    Associations.hasOne.call(EsClub, "sponsor", { className: "EsSponsor", foreignKey: "club_id" });
    Associations.hasOne.call(EsClub, "sponsoredMember", {
      className: "EsMember",
      through: "sponsor",
      source: "sponsorable",
      sourceType: "EsMember",
    });
    Associations.belongsTo.call(EsSponsor, "sponsorable", { polymorphic: true });

    const memberClub = await EsClub.create({ name: "Moustache Club" });
    const member = await EsMember.create({ name: "Groucho" });
    await EsSponsor.create({
      club_id: memberClub.id,
      sponsorable_id: member.id,
      sponsorable_type: "EsMember",
    });

    // A club whose sponsor is an Organization — sourceType filter must exclude it
    const orgClub = await EsClub.create({ name: "Boring Club" });
    const org = await EsOrg.create({ name: "NSA" });
    await EsSponsor.create({
      club_id: orgClub.id,
      sponsorable_id: org.id,
      sponsorable_type: "EsOrg",
    });

    const clubs = await EsClub.all().includes("sponsoredMember").toArray();
    expect(clubs).toHaveLength(2);

    const byId = new Map(clubs.map((c: any) => [c.id, c]));
    const memberClubLoaded = byId.get(memberClub.id) as any;
    const orgClubLoaded = byId.get(orgClub.id) as any;

    const preloaded = memberClubLoaded._preloadedAssociations?.get("sponsoredMember");
    expect(preloaded).toBeDefined();
    expect(preloaded).not.toBeNull();
    expect((preloaded as any).name).toBe("Groucho");

    // org-sponsored club must have a nil preloaded entry (key present, value null)
    expect(orgClubLoaded._preloadedAssociations?.has("sponsoredMember")).toBe(true);
    expect(orgClubLoaded._preloadedAssociations?.get("sponsoredMember")).toBeNull();
  });

  it("has one through nonpreload eagerloading", async () => {
    Associations.hasOne.call(Member, "membership", {
      className: "Membership",
      foreignKey: "member_id",
    });
    Associations.hasOne.call(Member, "club", {
      className: "Club",
      through: "membership",
      source: "club",
    });
    Associations.belongsTo.call(Membership, "club", { className: "Club", foreignKey: "club_id" });
    const club = await Club.create({ name: "Eager Club" });
    const member = await Member.create({ name: "Groucho Marx" });
    await Membership.create({ member_id: member.id, club_id: club.id });
    // order references clubs table → forces JOIN-based (non-preload) eager load
    let members: any[] = [];
    await assertQueriesCount(1, false, async () => {
      members = await Member.all()
        .includes("club")
        .references("clubs")
        .where({ name: "Groucho Marx" })
        .order("clubs.name")
        .toArray();
    });
    expect(members).toHaveLength(1);
    await assertNoQueries(false, async () => {
      const loaded = members[0].association("club");
      expect(loaded.isLoaded()).toBe(true);
      expect(loaded.target?.name).toBe("Eager Club");
    });
  });

  it("has one through nonpreload eager loading through polymorphic", async () => {
    class NpClub extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class NpSponsor extends Base {
      static {
        this.attribute("sponsorable_id", "integer");
        this.attribute("sponsorable_type", "string");
        this.attribute("club_id", "integer");
      }
    }
    class NpMember extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    registerModel(NpClub);
    registerModel(NpSponsor);
    registerModel(NpMember);
    Associations.hasOne.call(NpMember, "sponsor", { className: "NpSponsor", as: "sponsorable" });
    Associations.hasOne.call(NpMember, "sponsorClub", {
      through: "sponsor",
      source: "sponsorClub",
      className: "NpClub",
    });
    Associations.belongsTo.call(NpSponsor, "sponsorClub", {
      className: "NpClub",
      foreignKey: "club_id",
    });
    const club = await NpClub.create({ name: "Eager Club" });
    const member = await NpMember.create({ name: "Groucho Marx" });
    await NpSponsor.create({
      sponsorable_id: member.id,
      sponsorable_type: "NpMember",
      club_id: club.id,
    });
    let members: any[] = [];
    await assertQueriesCount(1, false, async () => {
      members = await NpMember.all()
        .includes("sponsorClub")
        .references("np_clubs")
        .where({ name: "Groucho Marx" })
        .order("np_clubs.name")
        .toArray();
    });
    expect(members).toHaveLength(1);
    await assertNoQueries(false, async () => {
      const loaded = members[0].association("sponsorClub");
      expect(loaded.isLoaded()).toBe(true);
      expect(loaded.target?.name).toBe("Eager Club");
    });
  });

  it("has one through nonpreload eager loading through polymorphic with more than one through record", async () => {
    class NpmClub extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class NpmSponsor extends Base {
      static {
        this.attribute("sponsorable_id", "integer");
        this.attribute("sponsorable_type", "string");
        this.attribute("club_id", "integer");
      }
    }
    class NpmMember extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    registerModel(NpmClub);
    registerModel(NpmSponsor);
    registerModel(NpmMember);
    Associations.hasOne.call(NpmMember, "sponsor", { className: "NpmSponsor", as: "sponsorable" });
    Associations.hasOne.call(NpmMember, "sponsorClub", {
      through: "sponsor",
      source: "sponsorClub",
      className: "NpmClub",
    });
    Associations.belongsTo.call(NpmSponsor, "sponsorClub", {
      className: "NpmClub",
      foreignKey: "club_id",
    });
    const club = await NpmClub.create({ name: "Boring Club" });
    const outrageous = await NpmClub.create({ name: "Outrageous Club" });
    const member = await NpmMember.create({ name: "Groucho Marx" });
    await NpmSponsor.create({
      sponsorable_id: member.id,
      sponsorable_type: "NpmMember",
      club_id: club.id,
    });
    await NpmSponsor.create({
      sponsorable_id: member.id,
      sponsorable_type: "NpmMember",
      club_id: outrageous.id,
    });
    let members: any[] = [];
    await assertQueriesCount(1, false, async () => {
      members = await NpmMember.all()
        .includes("sponsorClub")
        .references("npm_clubs")
        .where({ name: "Groucho Marx" })
        .order("npm_clubs.name DESC")
        .toArray();
    });
    expect(members).toHaveLength(1);
    await assertNoQueries(false, async () => {
      const loaded = members[0].association("sponsorClub");
      expect(loaded.isLoaded()).toBe(true);
      expect(loaded.target?.name).toBe("Outrageous Club");
    });
  });

  it("uninitialized has one through should return nil for unsaved record", async () => {
    const member = new Member({ name: "Unsaved" });
    expect(member.isNewRecord()).toBe(true);
    // New record has no id, so has_one through should be null
    const membership =
      member.id == null
        ? null
        : await loadHasOne(member, "membership", {
            className: "Membership",
            foreignKey: "member_id",
          });
    expect(membership).toBeNull();
  });

  it("assigning association correctly assigns target", async () => {
    // Assign a club to a member through membership and verify the target is correct
    const club = await Club.create({ name: "AssignClub" });
    const member = await Member.create({ name: "AssignMember" });
    await Membership.create({ member_id: member.id, club_id: club.id });
    const membership = await loadHasOne(member, "membership", {
      className: "Membership",
      foreignKey: "member_id",
    });
    expect(membership).not.toBeNull();
    const loadedClub = await loadHasOne(membership!, "club", {
      className: "Club",
      foreignKey: "id",
      primaryKey: "club_id",
    });
    expect(loadedClub).not.toBeNull();
    expect(loadedClub!.name).toBe("AssignClub");
  });

  it.skip("has one through proxy should not respond to private methods", () => {
    // BLOCKED: unknown — Ruby private-method visibility (NoMethodError on private) has no TS equivalent
  });

  it.skip("has one through proxy should respond to private methods via send", () => {
    // BLOCKED: unknown — Ruby send / private-method dispatch has no TS equivalent
  });

  it.skip("assigning to has one through preserves decorated join record", () => {
    // BLOCKED: fixture — MemberDetail / Organization fixture models not defined in test suite
  });

  it("reassigning has one through", async () => {
    // Reassign by updating the through record's FK to a different club
    const club1 = await Club.create({ name: "ReassignClub1" });
    const club2 = await Club.create({ name: "ReassignClub2" });
    const member = await Member.create({ name: "ReassignMember" });
    const membership = await Membership.create({ member_id: member.id, club_id: club1.id });
    // Reassign to club2
    membership.club_id = club2.id;
    await membership.save();
    const reloaded = await loadHasOne(member, "membership", {
      className: "Membership",
      foreignKey: "member_id",
    });
    expect(reloaded!.club_id).toBe(club2.id);
    const loadedClub = await loadHasOne(reloaded!, "club", {
      className: "Club",
      foreignKey: "id",
      primaryKey: "club_id",
    });
    expect(loadedClub!.name).toBe("ReassignClub2");
  });

  it("preloading has one through on belongs to", async () => {
    // member -> membership (hasOne) -> club (hasOne through)
    Associations.hasOne.call(Member, "membership", {
      className: "Membership",
      foreignKey: "member_id",
    });
    Associations.hasOne.call(Member, "club", {
      className: "Club",
      through: "membership",
      source: "club",
    });
    Associations.belongsTo.call(Membership, "club", { className: "Club", foreignKey: "club_id" });
    const club = await Club.create({ name: "Preload Club" });
    const member = await Member.create({ name: "Preload Member" });
    await Membership.create({ member_id: member.id, club_id: club.id });
    const members = await Member.all().includes("club").toArray();
    expect(members).toHaveLength(1);
    const preloaded = (members[0] as any)._preloadedAssociations?.get("club");
    expect(preloaded).not.toBeNull();
    expect(preloaded?.name).toBe("Preload Club");
  });

  it("save of record with loaded has one through", async () => {
    const club = await Club.create({ name: "Save Club" });
    const member = await Member.create({ name: "SaveMember" });
    await Membership.create({ member_id: member.id, club_id: club.id });
    // Load the through association
    const membership = await loadHasOne(member, "membership", {
      className: "Membership",
      foreignKey: "member_id",
    });
    expect(membership).not.toBeNull();
    // Saving the member after loading through should still work
    member.name = "UpdatedMember";
    await member.save();
    const reloaded = await Member.find(member.id as number);
    expect(reloaded.name).toBe("UpdatedMember");
  });

  it("through belongs to after destroy", async () => {
    // After destroying the through record, the through association returns nil
    const club = await Club.create({ name: "DestroyClub" });
    const member = await Member.create({ name: "DestroyMember" });
    const membership = await Membership.create({ member_id: member.id, club_id: club.id });
    await membership.destroy();
    const loaded = await loadHasOne(member, "membership", {
      className: "Membership",
      foreignKey: "member_id",
    });
    expect(loaded).toBeNull();
  });

  it.skip("value is properly quoted", () => {
    // BLOCKED: fixture — Minivan / Dashboard / Speedometer fixture models not defined in test suite
  });

  it.skip("has one through polymorphic with primary key option", () => {
    // BLOCKED: fixture — Author / Essay / Owner fixture models with custom primary_key option not defined
  });

  it.skip("has one through with primary key option", () => {
    // BLOCKED: fixture — Author / Essay / Category fixture models with custom primary_key option not defined
  });

  it.skip("has one through with default scope on join model", () => {
    // BLOCKED: fixture — Author / Post / Comment fixture models not defined
    // BLOCKED: associations — ThroughAssociation.targetScope chain merge (default_scope on join model) not implemented
  });

  it("has one through many raises exception", () => {
    class ManyMember extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    registerModel(ManyMember);
    Associations.hasMany.call(ManyMember, "memberships", {
      className: "Membership",
      foreignKey: "member_id",
    });
    Associations.hasOne.call(ManyMember, "clubThroughMany", {
      className: "Club",
      through: "memberships",
      source: "club",
    });
    const rec = new ManyMember({ name: "Test" });
    // Accessing the through-collection association should raise
    expect(() => rec.association("clubThroughMany")).toThrow(
      HasOneThroughCantAssociateThroughCollection,
    );
  });

  it("has one through polymorphic association", () => {
    class PaClub extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class PaMember extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("admittable_id", "integer");
        this.attribute("admittable_type", "string");
      }
    }
    registerModel(PaClub);
    registerModel(PaMember);
    Associations.belongsTo.call(PaMember, "admittable", { polymorphic: true });
    Associations.hasOne.call(PaMember, "premiumClub", {
      through: "admittable",
      className: "PaClub",
    });
    const member = new PaMember({ name: "Groucho" });
    expect(() => member.association("premiumClub")).toThrow(
      HasOneAssociationPolymorphicThroughError,
    );
  });

  it("has one through belongs to should update when the through foreign key changes", async () => {
    // When the through record's FK changes, the resolved target should change too
    const club1 = await Club.create({ name: "FKClub1" });
    const club2 = await Club.create({ name: "FKClub2" });
    const member = await Member.create({ name: "FKMember" });
    const membership = await Membership.create({ member_id: member.id, club_id: club1.id });
    // Initially points to club1
    let loadedClub = await loadHasOne(membership, "club", {
      className: "Club",
      foreignKey: "id",
      primaryKey: "club_id",
    });
    expect(loadedClub!.name).toBe("FKClub1");
    // Change FK
    membership.club_id = club2.id;
    await membership.save();
    // Re-load should point to club2
    const reloadedMembership = await Membership.find(membership.id as number);
    loadedClub = await loadHasOne(reloadedMembership, "club", {
      className: "Club",
      foreignKey: "id",
      primaryKey: "club_id",
    });
    expect(loadedClub!.name).toBe("FKClub2");
  });

  it("has one through belongs to setting belongs to foreign key after nil target loaded", async () => {
    // After loading nil (no membership), setting FK on a new membership should resolve
    const club = await Club.create({ name: "NilFKClub" });
    const member = await Member.create({ name: "NilFKMember" });
    // No membership initially
    const nilMembership = await loadHasOne(member, "membership", {
      className: "Membership",
      foreignKey: "member_id",
    });
    expect(nilMembership).toBeNull();
    // Now create a membership
    const membership = await Membership.create({ member_id: member.id, club_id: club.id });
    const loadedMembership = await loadHasOne(member, "membership", {
      className: "Membership",
      foreignKey: "member_id",
    });
    expect(loadedMembership).not.toBeNull();
    expect(loadedMembership!.club_id).toBe(club.id);
  });

  it("assigning has one through belongs to with new record owner", async () => {
    const club = await Club.create({ name: "Rails Club" });
    const member = new Member({ name: "New Member" });
    // Assign club via through association on a new (unsaved) owner
    (member.association("club") as any).writer(club);
    expect(member.association("club").target).toBe(club);
    await member.save();
    // After save, membership should be created linking member to club
    const memberships = await Membership.all().where({ member_id: member.id }).toArray();
    expect(memberships.length).toBe(1);
    expect(memberships[0].readAttribute("club_id")).toBe(club.id);
  });

  it.skip("has one through with custom select on join model default scope", () => {
    // BLOCKED: associations — default_scope with custom SELECT on join model not wired into through scope chain
  });

  it("has one through relationship cannot have a counter cache", () => {
    expect(() => {
      class Thing extends Base {}
      registerModel(Thing);
      Associations.hasOne.call(Thing, "club_thing", {
        className: "Club",
        through: "membership",
        counterCache: true,
      });
    }).toThrow(/counter_cache/);
  });

  it.skip("has one through do not cache association reader if the though method has default scopes", () => {
    // BLOCKED: associations — scope-based association-scope cache invalidation not implemented
    // BLOCKED: associations — default_scope with custom SELECT on join model not wired into through scope chain
  });

  it("loading cpk association with unpersisted owner", async () => {
    class CpkClub extends Base {
      static {
        this._tableName = "cpk_clubs3";
        this.attribute("region_id", "integer");
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.primaryKey = ["region_id", "id"];
      }
    }
    class CpkMembership3 extends Base {
      static {
        this._tableName = "cpk_memberships3";
        this.attribute("cpk_club_region_id", "integer");
        this.attribute("cpk_club_id", "integer");
        this.attribute("member_name", "string");
      }
    }
    Associations.hasMany.call(CpkClub, "cpkMembership3s", {
      foreignKey: ["cpk_club_region_id", "cpk_club_id"],
      className: "CpkMembership3",
    });
    registerModel("CpkClub", CpkClub);
    registerModel("CpkMembership3", CpkMembership3);
    // Unpersisted owner — PK values are null
    const club = new CpkClub({ name: "New Club" });
    const memberships = await loadHasMany(club, "cpkMembership3s", {
      foreignKey: ["cpk_club_region_id", "cpk_club_id"],
      className: "CpkMembership3",
    });
    expect(memberships).toEqual([]);
  });

  it("cpk stale target", async () => {
    class CpkClub2 extends Base {
      static {
        this._tableName = "cpk_clubs2";
        this.attribute("region_id", "integer");
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.primaryKey = ["region_id", "id"];
      }
    }
    class CpkMembership2 extends Base {
      static {
        this._tableName = "cpk_memberships2";
        this.attribute("cpk_club2_region_id", "integer");
        this.attribute("cpk_club2_id", "integer");
      }
    }
    Associations.hasOne.call(CpkClub2, "cpkMembership2", {
      foreignKey: ["cpk_club2_region_id", "cpk_club2_id"],
      className: "CpkMembership2",
    });
    registerModel("CpkClub2", CpkClub2);
    registerModel("CpkMembership2", CpkMembership2);
    const club = await CpkClub2.create({ region_id: 1, id: 1, name: "Club" });
    const membership = await CpkMembership2.create({ cpk_club2_region_id: 1, cpk_club2_id: 1 });
    // Load association to verify it works
    const loaded = await loadHasOne(club, "cpkMembership2", {
      foreignKey: ["cpk_club2_region_id", "cpk_club2_id"],
      className: "CpkMembership2",
    });
    expect(loaded).not.toBeNull();
    // Delete the membership — now the target is stale
    await membership.destroy();
    const reloaded = await loadHasOne(club, "cpkMembership2", {
      foreignKey: ["cpk_club2_region_id", "cpk_club2_id"],
      className: "CpkMembership2",
    });
    expect(reloaded).toBeNull();
  });

  it("creating through record when through record destroyed reloads before reuse", async () => {
    // Rails: createThroughRecord guards against reusing a destroyed through-record
    // by reloading the proxy before proceeding.
    const club1 = await Club.create({ name: "Old Club" });
    const member = await Member.create({ name: "Groucho" });
    const membership = await Membership.create({ member_id: member.id, club_id: club1.id });
    // Destroy the membership so it's marked destroyed in memory
    await membership.destroy();
    expect(membership.isDestroyed()).toBe(true);
    // Now create a new through association — should not try to reuse the destroyed record
    const newClub = await createThroughAssociation(member, "club", { name: "New Club" });
    expect(newClub.isPersisted()).toBe(true);
    expect(newClub.name).toBe("New Club");
    // A fresh membership should exist in the DB
    const memberships = await Membership.all().where({ member_id: member.id }).toArray();
    expect(memberships.length).toBe(1);
    expect(memberships[0].club_id).toBe(newClub.id);
  });

  it("set record after delete association", async () => {
    const club = await Club.create({ name: "Rails Club" });
    const member = await Member.create({ name: "DHH" });
    const membership = await Membership.create({ member_id: member.id, club_id: club.id });
    // Delete the membership
    await membership.destroy();
    // Create a new membership
    const newMembership = await Membership.create({ member_id: member.id, club_id: club.id });
    expect(newMembership.isPersisted()).toBe(true);
    // Load the membership again for the member
    const loaded = await loadHasOne(member, "membership", {
      className: "Membership",
      foreignKey: "member_id",
    });
    expect(loaded).not.toBeNull();
    expect(loaded!.club_id).toBe(club.id);
  });
});
