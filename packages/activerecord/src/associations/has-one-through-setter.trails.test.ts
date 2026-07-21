/**
 * Trails-only assertions pinning WHEN a has_one_through assignment hits the DB.
 *
 * Rails' `HasOneThroughAssociation#replace`
 * (has_one_through_association.rb:9-13) calls `create_through_record`
 * synchronously, so for a *persisted* owner the join row is created / updated /
 * destroyed AT ASSIGNMENT (`through_proxy.create` / `through_record.update` /
 * `through_record.destroy`, :21-40) — never deferred to the owner's next save.
 * Only the `owner.new_record? || !save` arm (:36-37) defers, by *building* the
 * join record for the owner's first save to persist.
 *
 * In trails the assignment-time write needs `await`, so it lives on the
 * awaitable `set#{Name}` setter (RFC 0068). No Rails test pins the *timing*
 * distinction — Ruby's setter is synchronous, so there is nothing to defer and
 * nothing to assert. These tests exist so the immediate arms can't silently
 * regress into save-time deferral (the two-row race RFC 0068 exists to kill),
 * and so `_pendingReplace` can't quietly reacquire a persisted-owner role.
 *
 * Each persisted-owner case asserts against a freshly-`find`ed join row and
 * never calls `member.save()`, so a deferred implementation fails outright.
 */
import { describe, it, expect } from "vitest";
import { registerModel, enableSti } from "../index.js";
import { fixtures } from "../test-helpers/fixtures.js";
import { Member } from "../test-helpers/models/member.js";
import { Club } from "../test-helpers/models/club.js";
import { Membership, CurrentMembership } from "../test-helpers/models/membership.js";

type AwaitableClubSetter = { setClub(value: Club | null): Promise<void> };

describe("HasOneThroughSetterTrails", () => {
  const { members, clubs } = fixtures(["members", "clubs", "memberships"]);

  registerModel(Member);
  registerModel(Club);
  enableSti(Membership);
  registerModel(Membership);
  registerModel(CurrentMembership);

  it("assigning to a persisted owner updates the existing join row inline", async () => {
    const member = members("some_other_guy");
    const membership = await member.loadHasOne("currentMembership");
    expect(membership).not.toBeNull();

    const newClub = clubs("moustache_club");
    await (member as unknown as AwaitableClubSetter).setClub(newClub);

    // Rails' `through_record.update(attributes)` arm (:34) — already visible in
    // the DB, with no `member.save()` anywhere.
    const reloaded = await CurrentMembership.find(membership!.id);
    expect(Number(reloaded.readAttribute("club_id"))).toBe(Number(newClub.id));
  });

  it("assigning to a persisted owner with no join row creates it inline", async () => {
    const member = await Member.create({ name: "Joinless" });
    expect(await member.loadHasOne("currentMembership")).toBeNull();

    const club = clubs("boring_club");
    await (member as unknown as AwaitableClubSetter).setClub(club);

    // Rails' `through_proxy.create(attributes)` arm (:39).
    const created = await CurrentMembership.findBy({ member_id: member.id });
    expect(created).not.toBeNull();
    expect(Number(created!.readAttribute("club_id"))).toBe(Number(club.id));
  });

  it("assigning nil to a persisted owner destroys the join row inline", async () => {
    const member = members("some_other_guy");
    const membership = await member.loadHasOne("currentMembership");
    expect(membership).not.toBeNull();

    await (member as unknown as AwaitableClubSetter).setClub(null);

    // Rails' `through_record.destroy` arm (:21-22).
    expect(await CurrentMembership.findBy({ id: membership!.id })).toBeNull();
    expect(member.club).toBeNull();
  });

  it("assigning to a new owner defers the join row to the owner's first save", async () => {
    const member = Member.new({ name: "Unsaved" });
    const club = clubs("boring_club");

    // A new owner takes Rails' `through_proxy.build` arm (:36-37), which needs
    // no `await` — the plain property setter is the faithful surface here.
    member.club = club;

    // Built in memory and readable immediately, but NOT yet in the DB.
    expect(member.club).toBe(club);
    const built = member.currentMembership;
    expect(built).not.toBeNull();
    expect(built!.isNewRecord()).toBe(true);
    expect(await CurrentMembership.findBy({ club_id: club.id, member_id: null })).toBeNull();

    await member.save();

    const persisted = await CurrentMembership.findBy({ member_id: member.id });
    expect(persisted).not.toBeNull();
    expect(Number(persisted!.readAttribute("club_id"))).toBe(Number(club.id));
  });
});
