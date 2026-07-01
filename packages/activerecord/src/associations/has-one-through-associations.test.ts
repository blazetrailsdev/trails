/**
 * Mirrors vendor/rails/activerecord/test/cases/associations/has_one_through_associations_test.rb
 *
 * Faithful word-for-word port onto the canonical `TEST_SCHEMA`, the official
 * Rails models (Member/Club/Membership/Sponsor/Organization/MemberDetail/
 * MemberType/Minivan/Dashboard/Speedometer/Category/Author/Essay/Owner/Cpk/…),
 * and the real fixtures. No bespoke tables, no `_tableName` hacks.
 */
import { describe, it, expect } from "vitest";
import { ArgumentError } from "@blazetrails/activemodel";
import { Base, registerModel, enableSti, registerSubclass } from "../index.js";
import { fixtures } from "../test-helpers/fixtures.js";
import { assertQueriesMatch, assertQueriesCount } from "../testing/query-assertions.js";
import {
  HasOneThroughCantAssociateThroughCollection,
  HasOneAssociationPolymorphicThroughError,
} from "./errors.js";
import { Member } from "../test-helpers/models/member.js";
import { Club } from "../test-helpers/models/club.js";
import {
  Membership,
  CurrentMembership,
  SuperMembership,
  SelectedMembership,
  TenantMembership,
} from "../test-helpers/models/membership.js";
import { Sponsor } from "../test-helpers/models/sponsor.js";
import { Organization } from "../test-helpers/models/organization.js";
import { MemberDetail } from "../test-helpers/models/member-detail.js";
import { MemberType } from "../test-helpers/models/member-type.js";
import { Minivan } from "../test-helpers/models/minivan.js";
import { Dashboard } from "../test-helpers/models/dashboard.js";
import { Speedometer } from "../test-helpers/models/speedometer.js";
import { Category, SpecialCategory } from "../test-helpers/models/category.js";
import { Author, AuthorAddress } from "../test-helpers/models/author.js";
import { Essay } from "../test-helpers/models/essay.js";
import { Owner } from "../test-helpers/models/owner.js";
import { Post, FirstPost } from "../test-helpers/models/post.js";
import { Comment } from "../test-helpers/models/comment.js";
import { Categorization } from "../test-helpers/models/categorization.js";
import { Customer } from "../test-helpers/models/customer.js";
import { Carrier } from "../test-helpers/models/carrier.js";
import { CustomerCarrier } from "../test-helpers/models/customer-carrier.js";
import { ShopAccount } from "../test-helpers/models/shop-account.js";
import {
  CpkBook,
  CpkOrder,
  CpkBookWithOrderAgreements,
  CpkOrderAgreement,
} from "../test-helpers/models/cpk.js";

/** Load and return a singular association's target (Rails sync reader). */
async function readHasOne(owner: any, name: string): Promise<any> {
  return await owner.association(name).loadTarget();
}

/** The in-memory target of an association (Rails' cached reader), untyped. */
function tgt(owner: any, name: string): any {
  return owner.association(name).target;
}

describe("HasOneThroughAssociationsTest", () => {
  const {
    members,
    clubs,
    memberships,
    organizations,
    categories,
    authors,
    owners,
    minivans,
    dashboards,
    speedometers,
    posts,
  } = fixtures([
    "memberTypes",
    "members",
    "clubs",
    "memberships",
    "sponsors",
    "organizations",
    "minivans",
    "dashboards",
    "speedometers",
    "authors",
    "authorAddresses",
    "posts",
    "comments",
    "categories",
    "essays",
    "owners",
  ]);

  registerModel(Member);
  registerModel(Club);
  enableSti(Membership);
  registerModel(Membership);
  registerModel(CurrentMembership);
  registerModel(SuperMembership);
  registerModel(SelectedMembership);
  registerModel(TenantMembership);
  registerModel(Sponsor);
  registerModel(Organization);
  registerModel(MemberDetail);
  registerModel(MemberType);
  registerModel(Minivan);
  registerModel(Dashboard);
  registerModel(Speedometer);
  enableSti(Category);
  registerModel(Category);
  registerModel(SpecialCategory);
  registerSubclass(SpecialCategory);
  registerModel(Author);
  registerModel(AuthorAddress);
  registerModel(Essay);
  registerModel(Owner);
  registerModel(Post);
  registerModel(FirstPost);
  registerModel(Comment);
  registerModel(Categorization);
  registerModel(Customer);
  registerModel(Carrier);
  registerModel(CustomerCarrier);
  registerModel(ShopAccount);
  registerModel(CpkBook);
  registerModel(CpkOrder);
  registerModel(CpkBookWithOrderAgreements);
  registerModel(CpkOrderAgreement);

  it("has one through with has one", async () => {
    const member = members("groucho");
    expect((await readHasOne(member, "club"))?.id).toBe(clubs("boring_club").id);
  });

  it("has one through executes limited query", async () => {
    const member = members("groucho");
    const boringClub = clubs("boring_club");
    await assertQueriesMatch(/LIMIT|ROWNUM <=|FETCH FIRST/, undefined, false, async () => {
      expect((await readHasOne(member, "generalClub"))?.id).toBe(boringClub.id);
    });
  });

  it("creating association creates through record", async () => {
    const newMember = await Member.create({ name: "Chris" });
    (newMember.association("club") as any).writer(await Club.create({ name: "LRUG" }));
    await newMember.save();
    expect(await readHasOne(newMember, "currentMembership")).not.toBeNull();
    expect(await readHasOne(newMember, "club")).not.toBeNull();
  });

  // TRACKED-PENDING-CONVERGENCE (0023 hasone-through-write-side-and-nil-stale-gaps):
  // has_one_through `create` does not route through createThroughRecord — the
  // target is built with a bogus id and no join record is persisted.
  it.skip("association create constructor creates through record", async () => {
    const newMember = await Member.create({ name: "Chris" });
    await (newMember.association("club") as any).create();
    expect(await readHasOne(newMember, "currentMembership")).not.toBeNull();
    expect(await readHasOne(newMember, "club")).not.toBeNull();
  });

  // TRACKED-PENDING-CONVERGENCE (0023 hasone-through-write-side-and-nil-stale-gaps):
  // has_one_through `build` sets the target but never builds/persists the join
  // (through) record, so `current_membership` stays nil even after save.
  it.skip("creating association builds through record", async () => {
    const newMember = await Member.create({ name: "Chris" });
    const newClub = (newMember.association("club") as any).build();
    expect(tgt(newMember, "currentMembership")).toBeTruthy();
    expect(tgt(newMember, "club")).toBe(newClub);
    expect(newClub.isNewRecord()).toBe(true);
    expect(tgt(newMember, "currentMembership").isNewRecord()).toBe(true);
    expect(await newMember.save()).toBe(true);
    expect(newClub.isPersisted()).toBe(true);
    expect(tgt(newMember, "currentMembership").isPersisted()).toBe(true);
  });

  // TRACKED-PENDING-CONVERGENCE (0023 hasone-through-write-side-and-nil-stale-gaps):
  // has_one_through `build` sets the target but never builds/persists the join
  // (through) record, so `current_membership` stays nil even after save.
  it.skip("association build constructor builds through record", async () => {
    const newMember = await Member.create({ name: "Chris" });
    const newClub = (newMember.association("club") as any).build();
    expect(tgt(newMember, "currentMembership")).toBeTruthy();
    expect(tgt(newMember, "club")).toBe(newClub);
    expect(newClub.isNewRecord()).toBe(true);
    expect(tgt(newMember, "currentMembership").isNewRecord()).toBe(true);
    expect(await newMember.save()).toBe(true);
    expect(newClub.isPersisted()).toBe(true);
    expect(tgt(newMember, "currentMembership").isPersisted()).toBe(true);
  });

  // TRACKED-PENDING-CONVERGENCE (0023 hasone-through-write-side-and-nil-stale-gaps):
  // Assigning a has_one_through target on a new owner does not build the join
  // record in memory (`current_membership` is nil before save).
  it.skip("creating association builds through record for new", async () => {
    const newMember = new Member({ name: "Jane" });
    (newMember.association("club") as any).writer(clubs("moustache_club"));
    expect(tgt(newMember, "currentMembership")).toBeTruthy();
    expect(
      tgt(newMember, "currentMembership").club?.id ?? tgt(newMember, "currentMembership").club_id,
    ).toBeTruthy();
    expect(tgt(newMember, "club")?.id).toBe(clubs("moustache_club").id);
    expect(await newMember.save()).toBe(true);
    expect((await readHasOne(newMember, "club"))?.id).toBe(clubs("moustache_club").id);
  });

  it("building multiple associations builds through record", async () => {
    const memberType = await MemberType.create({});
    await Member.create({});
    const memberDetailWithOneAssociation = new MemberDetail({ memberType });
    expect(tgt(memberDetailWithOneAssociation, "member").isNewRecord()).toBe(true);
    const memberDetailWithTwoAssociations = new MemberDetail({
      memberType,
      admittable: await Member.create({}),
    });
    expect(tgt(memberDetailWithTwoAssociations, "member").isNewRecord()).toBe(true);
  });

  it("building works with has one through belongs to", async () => {
    const newMember = await Member.create({ name: "Joe" });
    await (newMember.association("currentMembership") as any).create();
    const newClub = (newMember.association("club") as any).build();
    expect(newMember.association("club").target).toBe(newClub);
  });

  it("creating multiple associations creates through record", async () => {
    const memberType = await MemberType.create({});
    await Member.create({});
    const memberDetailWithOneAssociation = await MemberDetail.create({ memberType });
    expect(tgt(memberDetailWithOneAssociation, "member").isNewRecord()).toBe(false);
    const memberDetailWithTwoAssociations = await MemberDetail.create({
      memberType,
      admittable: await Member.create({}),
    });
    expect(tgt(memberDetailWithTwoAssociations, "member").isNewRecord()).toBe(false);
  });

  // TRACKED-PENDING-CONVERGENCE (0023 hasone-through-write-side-and-nil-stale-gaps):
  // On a new owner, saving a has_one_through assignment creates the join record
  // but does not autosave the target (club.id stays nil), so both parent ids are
  // not set.
  it.skip("creating association sets both parent ids for new", async () => {
    const member = new Member({ name: "Sean Griffin" });
    const club = new Club({ name: "Da Club" });
    (member.association("club") as any).writer(club);
    await member.save();
    expect(member.id).toBeTruthy();
    expect(club.id).toBeTruthy();
    const currentMembership = await readHasOne(member, "currentMembership");
    expect(currentMembership.readAttribute("member_id")).toBe(Number(member.id));
    expect(currentMembership.readAttribute("club_id")).toBe(Number(club.id));
  });

  it("replace target record", async () => {
    const member = members("groucho");
    const newClub = await Club.create({ name: "Marx Bros" });
    (member.association("club") as any).writer(newClub);
    await member.save();
    await member.reload();
    expect((await readHasOne(member, "club"))?.id).toBe(newClub.id);
  });

  it("replacing target record deletes old association", async () => {
    const member = members("groucho");
    const before = (await Membership.count()) as number;
    const newClub = await Club.create({ name: "Bananarama" });
    (member.association("club") as any).writer(newClub);
    await member.save();
    await member.reload();
    expect((await Membership.count()) as number).toBe(before);
  });

  it("set record to nil should delete association", async () => {
    const member = members("groucho");
    (member.association("club") as any).writer(null);
    await member.save();
    await member.reload();
    expect(await readHasOne(member, "currentMembership")).toBeNull();
    expect(await readHasOne(member, "club")).toBeNull();
  });

  it("set record after delete association", async () => {
    const member = members("groucho");
    (member.association("club") as any).writer(null);
    await member.save();
    (member.association("club") as any).writer(clubs("moustache_club"));
    await member.save();
    await member.reload();
    expect((await readHasOne(member, "club"))?.id).toBe(clubs("moustache_club").id);
  });

  it("has one through polymorphic", async () => {
    const member = members("groucho");
    expect((await readHasOne(member, "sponsorClub"))?.id).toBe(clubs("moustache_club").id);
  });

  it("has one through eager loading", async () => {
    let loaded: any[] = [];
    await assertQueriesCount(3, false, async () => {
      loaded = await Member.all().includes("club").where("name = ?", "Groucho Marx");
    });
    expect(loaded.length).toBe(1);
    await assertQueriesCount(0, false, async () => {
      expect(loaded[0].association("club").target).not.toBeNull();
    });
  });

  it("has one through eager loading through polymorphic", async () => {
    let loaded: any[] = [];
    await assertQueriesCount(3, false, async () => {
      loaded = await Member.all().includes("sponsorClub").where("name = ?", "Groucho Marx");
    });
    expect(loaded.length).toBe(1);
    await assertQueriesCount(0, false, async () => {
      expect(loaded[0].association("sponsorClub").target).not.toBeNull();
    });
  });

  // TRACKED-PENDING-CONVERGENCE (0023 hasone-through-write-side-and-nil-stale-gaps):
  // the source-table-condition arm (hairyClub) passes on SQLite but preloads nil on
  // PG/MariaDB — eager-loading a has_one_through with a WHERE on the *source* table
  // fails to match across the through join on those adapters.
  it.skip("has one through with conditions eager loading", async () => {
    const member = members("groucho");
    // conditions on the through table
    expect(
      ((await Member.all().includes("favoriteClub").find(member.id)) as any).association(
        "favoriteClub",
      ).target?.id,
    ).toBe(clubs("moustache_club").id);
    await memberships("membership_of_favorite_club").updateColumns({ favorite: false });
    const refetched = (await Member.all().includes("favoriteClub").find(member.id)) as any;
    await refetched.reload();
    expect(refetched.association("favoriteClub").target).toBeNull();

    // conditions on the source table
    expect(
      ((await Member.all().includes("hairyClub").find(member.id)) as any).association("hairyClub")
        .target?.id,
    ).toBe(clubs("moustache_club").id);
    await clubs("moustache_club").updateColumns({ name: "Association of Clean-Shaven Persons" });
    const refetched2 = (await Member.all().includes("hairyClub").find(member.id)) as any;
    await refetched2.reload();
    expect(refetched2.association("hairyClub").target).toBeNull();
  });

  it("has one through polymorphic with source type", async () => {
    expect((await readHasOne(clubs("moustache_club"), "sponsoredMember"))?.id).toBe(
      members("groucho").id,
    );
  });

  it("eager has one through polymorphic with source type", async () => {
    const loaded = await Club.all()
      .includes("sponsoredMember")
      .where("name = ?", "Moustache and Eyebrow Fancier Club");
    // Only the eyebrow fanciers club has a sponsored_member
    await assertQueriesCount(0, false, () => {
      expect(loaded[0].association("sponsoredMember").target).not.toBeNull();
    });
  });

  it("has one through nonpreload eagerloading", async () => {
    let loaded: any[] = [];
    await assertQueriesCount(1, false, async () => {
      loaded = await Member.all()
        .includes("club")
        .where("members.name = ?", "Groucho Marx")
        .order("clubs.name")
        .references("clubs"); // force fallback
    });
    expect(loaded.length).toBe(1);
    await assertQueriesCount(0, false, () => {
      expect(loaded[0].association("club").target).not.toBeNull();
    });
  });

  it("has one through nonpreload eager loading through polymorphic", async () => {
    let loaded: any[] = [];
    await assertQueriesCount(1, false, async () => {
      loaded = await Member.all()
        .includes("sponsorClub")
        .where("members.name = ?", "Groucho Marx")
        .order("clubs.name")
        .references("clubs"); // force fallback
    });
    expect(loaded.length).toBe(1);
    await assertQueriesCount(0, false, () => {
      expect(loaded[0].association("sponsorClub").target).not.toBeNull();
    });
  });

  it("has one through nonpreload eager loading through polymorphic with more than one through record", async () => {
    const member = members("groucho");
    await new Sponsor({ sponsorClub: clubs("outrageous_club"), sponsorable: member }).save();
    let loaded: any[] = [];
    await assertQueriesCount(1, false, async () => {
      loaded = await Member.all()
        .includes("sponsorClub")
        .where("members.name = ?", "Groucho Marx")
        .order("clubs.name DESC")
        .references("clubs"); // force fallback
    });
    expect(loaded.length).toBe(1);
    await assertQueriesCount(0, false, () => {
      expect(loaded[0].association("sponsorClub").target).not.toBeNull();
    });
    expect(loaded[0].association("sponsorClub").target?.id).toBe(clubs("outrageous_club").id);
  });

  it("uninitialized has one through should return nil for unsaved record", async () => {
    expect(await readHasOne(new Member(), "club")).toBeNull();
  });

  it("assigning association correctly assigns target", async () => {
    const newMember = await Member.create({ name: "Chris" });
    const newClub = await Club.create({ name: "LRUG" });
    (newMember.association("club") as any).writer(newClub);
    expect(tgt(newMember, "club")?.id).toBe(newClub.id);
  });

  it.skip("has one through proxy should not respond to private methods", () => {
    // PERMANENT-SKIP: Ruby private-method visibility (NoMethodError when a private
    // method is called publicly) has no TypeScript runtime equivalent.
  });

  it.skip("has one through proxy should respond to private methods via send", () => {
    // PERMANENT-SKIP: Ruby private-method dispatch via `send` has no TypeScript
    // runtime equivalent.
  });

  it("assigning to has one through preserves decorated join record", async () => {
    const member = members("groucho");
    const organization = organizations("nsa");
    const before = (await MemberDetail.count()) as number;
    const memberDetail = new MemberDetail({ extra_data: "Extra" });
    (member.association("memberDetail") as any).writer(memberDetail);
    (member.association("organization") as any).writer(organization);
    await member.save();
    expect(((await MemberDetail.count()) as number) - before).toBe(1);
    expect((await readHasOne(member, "organization"))?.id).toBe(organization.id);
    const orgMembers = (await organization.association("members").loadTarget()) as any[];
    expect(orgMembers.some((m: any) => m.id === member.id)).toBe(true);
    expect((await readHasOne(member, "memberDetail"))?.readAttribute("extra_data")).toBe("Extra");
  });

  it("reassigning has one through", async () => {
    const member = members("groucho");
    const organization = organizations("nsa");
    const newOrganization = organizations("discordians");

    // Rails' `@organization.members` re-reads the collection on each access; the
    // trails proxy caches its loaded target, so reload before each membership check.
    const includesMember = async (o: any): Promise<boolean> => {
      await o.association("members").reload();
      return (o.association("members").target as any[]).some((m: any) => m.id === member.id);
    };

    let before = (await MemberDetail.count()) as number;
    const memberDetail = new MemberDetail({ extra_data: "Extra" });
    (member.association("memberDetail") as any).writer(memberDetail);
    (member.association("organization") as any).writer(organization);
    await member.save();
    expect(((await MemberDetail.count()) as number) - before).toBe(1);
    expect((await readHasOne(member, "organization"))?.id).toBe(organization.id);
    expect((await readHasOne(member, "memberDetail"))?.readAttribute("extra_data")).toBe("Extra");
    expect(await includesMember(organization)).toBe(true);
    expect(await includesMember(newOrganization)).toBe(false);

    before = (await MemberDetail.count()) as number;
    (member.association("organization") as any).writer(newOrganization);
    await member.save();
    expect((await MemberDetail.count()) as number).toBe(before);
    expect((await readHasOne(member, "organization"))?.id).toBe(newOrganization.id);
    expect((await readHasOne(member, "memberDetail"))?.readAttribute("extra_data")).toBe("Extra");
    expect(await includesMember(organization)).toBe(false);
    expect(await includesMember(newOrganization)).toBe(true);
  });

  it("preloading has one through on belongs to", async () => {
    await MemberDetail.deleteAll();
    const member = members("groucho");
    expect(await readHasOne(member, "memberType")).not.toBeNull();
    const organization = organizations("nsa");
    const memberDetail = new MemberDetail({});
    (member.association("memberDetail") as any).writer(memberDetail);
    (member.association("organization") as any).writer(organization);
    await member.save();
    await member.reload();
    let loaded: any[] = [];
    await assertQueriesCount(3, false, async () => {
      loaded = await MemberDetail.all().includes("memberType");
    });
    const newDetail = loaded[0];
    expect(newDetail.association("memberType").isLoaded()).toBe(true);
    await assertQueriesCount(0, false, () => {
      void newDetail.association("memberType").target;
    });
  });

  it("save of record with loaded has one through", async () => {
    const member = members("groucho");
    const club = await readHasOne(member, "club");
    expect(await readHasOne(club, "sponsoredMember")).not.toBeNull();

    await (await Club.find(club.id)).save();
    await (await Club.all().includes("sponsoredMember").find(club.id)).save();

    await (await readHasOne(club, "sponsor")).destroy();

    await (await Club.find(club.id)).save();
    await (await Club.all().includes("sponsoredMember").find(club.id)).save();
  });

  // TRACKED-PENDING-CONVERGENCE (0023 hasone-through-write-side-and-nil-stale-gaps):
  // passes on SQLite but fails on PG/MariaDB — `member.save()` does not persist the
  // lone has_one `memberDetail` child there (its `member_id` is never written), so
  // the `member_type` through resolves to nil. A cross-adapter has_one autosave gap.
  it.skip("through belongs to after destroy", async () => {
    const member = members("groucho");
    const memberDetail = new MemberDetail({ extra_data: "Extra" });
    (member.association("memberDetail") as any).writer(memberDetail);
    await member.save();

    expect(await readHasOne(memberDetail, "memberType")).not.toBeNull();
    await memberDetail.destroy();
    await assertQueriesCount(1, false, async () => {
      await memberDetail.association("memberType").reload();
      expect(await readHasOne(memberDetail, "memberType")).not.toBeNull();
    });

    await (await readHasOne(memberDetail, "member")).destroy();
    await assertQueriesCount(1, false, async () => {
      await memberDetail.association("memberType").reload();
      expect(memberDetail.association("memberType").target).toBeNull();
    });
  });

  it("value is properly quoted", async () => {
    const minivan = await Minivan.find("m1");
    // The point of the Rails test: loading must not raise (string PK quoting).
    await readHasOne(minivan, "dashboard");
  });

  it("has one through polymorphic with primary key option", async () => {
    const david = authors("david");
    expect((await readHasOne(david, "essayCategory"))?.id).toBe(categories("general").id);

    let joined = await Author.joins("essayCategory").where({
      "categories.id": categories("general").id,
    });
    expect(joined[0]?.id).toBe(authors("david").id);

    expect((await readHasOne(david, "essayOwner"))?.id).toBe(owners("blackbeard").id);

    joined = await Author.joins("essayOwner").where("owners.name = 'blackbeard'");
    expect(joined[0]?.id).toBe(authors("david").id);
  });

  it("has one through with primary key option", async () => {
    const david = authors("david");
    expect((await readHasOne(david, "essayCategory_2"))?.id).toBe(categories("general").id);

    const joined = await Author.joins("essayCategory_2").where({
      "categories.id": categories("general").id,
    });
    expect(joined[0]?.id).toBe(authors("david").id);
  });

  it("has one through with default scope on join model", async () => {
    const welcome = posts("welcome");
    const firstComment = ((await welcome.association("comments").loadTarget()) as any[])
      .slice()
      .sort((a: any, b: any) => Number(a.id) - Number(b.id))[0];
    const commentOnFirstPost = await readHasOne(authors("david"), "commentOnFirstPost");
    expect(commentOnFirstPost?.id).toBe(firstComment?.id);
  });

  it("has one through many raises exception", () => {
    expect(() => (members("groucho") as any).association("clubThroughMany")).toThrow(
      HasOneThroughCantAssociateThroughCollection,
    );
  });

  it("has one through polymorphic association", () => {
    const member = members("groucho");
    expect(() => (member as any).association("premiumClub")).toThrow(
      HasOneAssociationPolymorphicThroughError,
    );
  });

  it("has one through belongs to should update when the through foreign key changes", async () => {
    const minivan = minivans("cool_first");
    await readHasOne(minivan, "dashboard");
    const proxy = minivan.association("dashboard");
    expect(proxy.isStaleTarget?.() ?? false).toBe(false);
    expect((await readHasOne(minivan, "dashboard"))?.id).toBe(dashboards("cool_first").id);

    minivan.speedometer_id = speedometers("second").id as string;
    expect(proxy.isStaleTarget?.()).toBe(true);
    expect((await readHasOne(minivan, "dashboard"))?.id).toBe(dashboards("second").id);
  });

  // TRACKED-PENDING-CONVERGENCE (0023 hasone-through-write-side-and-nil-stale-gaps): after a
  // has_one_through belongs_to loads a nil target, `_staleState` is null and the
  // reader's stale-reload branch is guarded by `_staleState != null`, so setting
  // the through FK does not reload the (previously nil) target.
  it.skip("has one through belongs to setting belongs to foreign key after nil target loaded", async () => {
    const minivan = new Minivan();
    await readHasOne(minivan, "dashboard");
    const proxy = minivan.association("dashboard");
    minivan.speedometer_id = speedometers("second").id as string;
    expect(proxy.isStaleTarget?.()).toBe(true);
    expect((await readHasOne(minivan, "dashboard"))?.id).toBe(dashboards("second").id);
  });

  it("assigning has one through belongs to with new record owner", async () => {
    const minivan = new Minivan();
    const dashboard = dashboards("cool_first");
    (minivan.association("dashboard") as any).writer(dashboard);
    expect(tgt(minivan, "dashboard")?.id).toBe(dashboard.id);
    const speedometer = await readHasOne(minivan, "speedometer");
    expect((await readHasOne(speedometer, "dashboard"))?.id).toBe(dashboard.id);
  });

  it("has one through with custom select on join model default scope", async () => {
    expect((await readHasOne(members("groucho"), "selectedClub"))?.id).toBe(
      clubs("boring_club").id,
    );
  });

  it("has one through relationship cannot have a counter cache", () => {
    expect(() => {
      class Thing extends Base {
        static {
          this.hasOne("otherThing");
          this.hasOne("thing", { through: "otherThing", counterCache: true });
        }
      }
      registerModel(Thing);
      void Thing;
    }).toThrow(ArgumentError);
  });

  it("has one through do not cache association reader if the though method has default scopes", async () => {
    try {
      const customer = await Customer.create({});
      const carrier = await Carrier.create({});
      const customerCarrier = await CustomerCarrier.create({
        customer_id: customer.id,
        carrier_id: carrier.id,
      });
      const account = await ShopAccount.create({ customer_carrier_id: customerCarrier.id });

      (CustomerCarrier as any).currentCustomer = customer;

      expect((await readHasOne(account, "carrier"))?.id).toBe(carrier.id);

      (CustomerCarrier as any).currentCustomer = null;

      const otherCarrier = await Carrier.create({});
      const otherCustomer = await Customer.create({});
      const otherCustomerCarrier = await CustomerCarrier.create({
        customer_id: otherCustomer.id,
        carrier_id: otherCarrier.id,
      });
      const otherAccount = await ShopAccount.create({
        customer_carrier_id: otherCustomerCarrier.id,
      });

      expect((await readHasOne(otherAccount, "carrier"))?.id).toBe(otherCarrier.id);
    } finally {
      (CustomerCarrier as any).currentCustomer = null;
    }
  });

  // TRACKED-PENDING-CONVERGENCE (0023 hasone-through-write-side-and-nil-stale-gaps): a
  // has_one_through read on an unpersisted owner whose through belongs_to target
  // is persisted does not resolve via the in-memory through record.
  it.skip("loading cpk association with unpersisted owner", async () => {
    const order = await CpkOrder.create({ shop_id: 1 });
    const book = new CpkBookWithOrderAgreements({ id: [1, 2], order });
    const orderAgreement = await CpkOrderAgreement.create({ order });
    expect((await readHasOne(book, "orderAgreement"))?.id).toBe(orderAgreement.id);
  });

  it("cpk stale target", async () => {
    const order = await CpkOrder.create({ shop_id: 1 });
    const book = await CpkBookWithOrderAgreements.create({ id: [1, 2], order });
    await CpkOrderAgreement.create({ order });

    await readHasOne(book, "orderAgreement");
    (book.association("order") as any).writer(new CpkOrder());
    expect(book.association("orderAgreement").isStaleTarget?.()).toBe(true);
  });
});
