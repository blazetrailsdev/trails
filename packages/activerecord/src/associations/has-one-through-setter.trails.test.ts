import { describe, it, expect } from "vitest";
import { registerModel } from "../index.js";
import { fixtures } from "../test-fixtures.js";
import { Member } from "../test-helpers/models/member.js";
import { Club } from "../test-helpers/models/club.js";
import { Membership, CurrentMembership } from "../test-helpers/models/membership.js";

type AwaitableClubSetter = { setClub(value: Club | null): Promise<void> };

describe("HasOneThroughSetterTrails", () => {
  const { members, clubs } = fixtures(["members", "clubs", "memberships"]);

  registerModel(Member);
  registerModel(Club);
  Membership.inheritanceColumn = "type";
  registerModel(Membership);
  registerModel(CurrentMembership);

  it("assigning to a persisted owner updates the existing join row inline", async () => {
    const member = members("some_other_guy");
    const membership = await member.loadHasOne("currentMembership");
    expect(membership).not.toBeNull();

    const newClub = clubs("moustache_club");
    await (member as unknown as AwaitableClubSetter).setClub(newClub);

    const reloaded = await CurrentMembership.find(membership!.id);
    expect(Number(reloaded.readAttribute("club_id"))).toBe(Number(newClub.id));
  });

  it("assigning to a persisted owner with no join row creates it inline", async () => {
    const member = await Member.create({ name: "Joinless" });
    expect(await member.loadHasOne("currentMembership")).toBeNull();

    const club = clubs("boring_club");
    await (member as unknown as AwaitableClubSetter).setClub(club);

    const created = await CurrentMembership.findBy({ member_id: member.id });
    expect(created).not.toBeNull();
    expect(Number(created!.readAttribute("club_id"))).toBe(Number(club.id));
  });

  it("assigning nil to a persisted owner destroys the join row inline", async () => {
    const member = members("some_other_guy");
    const membership = await member.loadHasOne("currentMembership");
    expect(membership).not.toBeNull();

    await (member as unknown as AwaitableClubSetter).setClub(null);

    expect(await CurrentMembership.findBy({ id: membership!.id })).toBeNull();
    expect(member.club).toBeNull();
  });

  it("assigning to a new owner defers the join row to the owner's first save", async () => {
    const member = Member.new({ name: "Unsaved" });
    const club = clubs("boring_club");
    const rowCount = async () => Number(await CurrentMembership.count());
    const before = await rowCount();

    await (member as unknown as AwaitableClubSetter).setClub(club);

    expect(member.club).toBe(club);
    const built = member.currentMembership;
    expect(built).not.toBeNull();
    expect(built!.isNewRecord()).toBe(true);
    expect(await rowCount()).toBe(before);

    await member.save();

    expect(await rowCount()).toBe(before + 1);

    const persisted = await CurrentMembership.findBy({ member_id: member.id });
    expect(persisted).not.toBeNull();
    expect(Number(persisted!.readAttribute("club_id"))).toBe(Number(club.id));
  });
});
