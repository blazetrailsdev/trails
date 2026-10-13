import { describe, it, expect } from "vitest";
import { registerModel, RecordInvalid } from "../index.js";
import { fixtures } from "../test-fixtures.js";
import { Author } from "../test-helpers/models/author.js";
import { Club } from "../test-helpers/models/club.js";
import { SpecialComment } from "../test-helpers/models/comment.js";
import { Member } from "../test-helpers/models/member.js";
import { Membership, CurrentMembership } from "../test-helpers/models/membership.js";
import { Post } from "../test-helpers/models/post.js";
import type { SingularAssociation } from "./singular-association.js";

function club(member: Member): SingularAssociation {
  return member.association("club") as SingularAssociation;
}

function currentMembership(member: Member): SingularAssociation {
  return member.association("currentMembership") as SingularAssociation;
}

async function memberWithClub(): Promise<{ newMember: Member; oldClub: Club }> {
  const newMember = await Member.create({ name: "Joe" });
  const oldClub = await Club.create({ name: "Old Club" });
  await club(newMember).writer(oldClub);
  await newMember.save();
  return { newMember, oldClub };
}

async function clubIdOf(membershipId: unknown): Promise<number> {
  return Number((await Membership.find(membershipId)).readAttribute("club_id"));
}

describe("HasOneThroughAssociationsTest", () => {
  const { members, clubs } = fixtures([
    "members",
    "clubs",
    "memberships",
    "authors",
    "posts",
    "comments",
  ]);

  registerModel(Member);
  registerModel(Club);
  Membership.inheritanceColumn = "type";
  registerModel(Membership);
  registerModel(CurrentMembership);
  registerModel(Author);
  registerModel(Post);
  registerModel(SpecialComment);

  it("building with a loaded join row preserves unrelated in-memory changes on it", async () => {
    const newMember = await Member.create({ name: "Joe" });
    const membership = (await currentMembership(newMember).create()) as Membership;
    membership.writeAttribute("favorite", true);
    const newClub = (await club(newMember).build()) as Club;
    expect(await newMember.save()).toBe(true);
    const reloaded = await Membership.find(membership.id);
    expect(Number(reloaded.readAttribute("club_id"))).toBe(Number(newClub.id));
    expect(reloaded.readAttribute("favorite")).toBe(true);
  });

  it("building works with has one through belongs to with unloaded existing join row", async () => {
    const { newMember } = await memberWithClub();
    const membershipId = (await currentMembership(newMember).reader)!.id;

    const refetched = await Member.find(newMember.id);
    const newClub = (await club(refetched).build()) as Club;

    const countForMember = () => Membership.where({ member_id: refetched.id }).count();
    const before = await countForMember();
    expect(await refetched.save()).toBe(true);
    expect(await countForMember()).toBe(before);
    expect(newClub.isPersisted()).toBe(true);
    expect(await clubIdOf(membershipId)).toBe(Number(newClub.id));
  });

  it("unloaded reconcile does not permanently disable the through association autosave", async () => {
    const { newMember } = await memberWithClub();

    const refetched = await Member.find(newMember.id);
    await club(refetched).build();
    expect(await refetched.save()).toBe(true);

    const laterClub = await Club.create({ name: "Later Club" });
    const newMembership = (await currentMembership(refetched).build({
      club: laterClub,
    })) as Membership;
    expect(await refetched.save()).toBe(true);
    expect(newMembership.isPersisted()).toBe(true);
  });

  it("creating works with has one through belongs to with unloaded existing join row", async () => {
    const { newMember } = await memberWithClub();
    const membershipId = (await currentMembership(newMember).reader)!.id;

    const refetched = await Member.find(newMember.id);
    const countForMember = () => Membership.where({ member_id: refetched.id }).count();
    const before = await countForMember();
    const newClub = (await club(refetched).create({ name: "New Club" })) as Club;
    expect(await refetched.save()).toBe(true);
    expect(await countForMember()).toBe(before);
    expect((await club(refetched).reader)?.id).toBe(newClub.id);
    expect(await clubIdOf(membershipId)).toBe(Number(newClub.id));
  });

  it("creating with unloaded existing join row updates the join row without an owner save", async () => {
    const { newMember, oldClub } = await memberWithClub();
    const membershipId = (await currentMembership(newMember).reader)!.id;

    const refetched = await Member.find(newMember.id);
    const countForMember = () => Membership.where({ member_id: refetched.id }).count();
    const before = await countForMember();
    const newClub = (await club(refetched).create({ name: "New Club" })) as Club;

    expect(await countForMember()).toBe(before);
    expect(await clubIdOf(membershipId)).toBe(Number(newClub.id));
    expect(await clubIdOf(membershipId)).not.toBe(Number(oldClub.id));
  });

  it("raising create with an invalid record still reconciles an unloaded join row", async () => {
    const author = await Author.create({ name: "David" });
    const post = await Post.create({ title: "t", body: "b", author_id: author.id });
    const comment = await SpecialComment.create({ post_id: post.id, body: "sc" });

    const refetched = await SpecialComment.find(comment.id);
    const authorsBefore = await Author.count();
    await expect(refetched.association("author").createBang({})).rejects.toThrow(RecordInvalid);

    expect(await Author.count()).toBe(authorsBefore);
    expect((await Post.find(post.id)).author_id).toBeNull();
  });

  it("creating with no existing join row only builds the join record", async () => {
    const newMember = await Member.create({ name: "Joe" });
    const countForMember = () => Membership.where({ member_id: newMember.id }).count();

    const newClub = (await club(newMember).create({ name: "New Club" })) as Club;
    expect(await countForMember()).toBe(0);
    expect(currentMembership(newMember).target!.isNewRecord()).toBe(true);

    expect(await newMember.save()).toBe(true);
    expect(await countForMember()).toBe(1);
    const membership = await Membership.where({ member_id: newMember.id }).first();
    expect(Number(membership?.readAttribute("club_id"))).toBe(Number(newClub.id));
  });

  it("building with unloaded existing join row reconciles regardless of through-proxy access order", async () => {
    const { newMember } = await memberWithClub();

    const refetched = await Member.find(newMember.id);
    refetched.association("currentMembership");
    const newClub = (await club(refetched).build()) as Club;
    const countForMember = () => Membership.where({ member_id: refetched.id }).count();
    const before = await countForMember();
    expect(await refetched.save()).toBe(true);
    expect(await countForMember()).toBe(before);
    expect(newClub.isPersisted()).toBe(true);
  });

  it("repeated build on unloaded existing join row keeps the last club", async () => {
    const { newMember } = await memberWithClub();
    const membershipId = (await currentMembership(newMember).reader)!.id;

    const refetched = await Member.find(newMember.id);
    await club(refetched).build({ name: "First" });
    const finalClub = (await club(refetched).build({ name: "Final" })) as Club;
    expect(await refetched.save()).toBe(true);
    expect(await clubIdOf(membershipId)).toBe(Number(finalClub.id));
  });

  it("re-assigning the same target record on a persisted owner is a no-op", async () => {
    const member = members("groucho");
    const before = await Membership.count();
    await club(member).writer(await club(member).reader);
    await member.save();
    await member.reload();
    expect((await club(member).reader)?.id).toBe(clubs("boring_club").id);
    expect(await Membership.count()).toBe(before);
  });
});
