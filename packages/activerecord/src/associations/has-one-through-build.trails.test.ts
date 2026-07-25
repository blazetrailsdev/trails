/**
 * Trails-only assertion pinning the query SHAPE of `build#{name}` on an
 * UNLOADED has_one_through with a persisted owner.
 *
 * Rails' `HasOneThroughAssociation#replace` has no `load_target`; its
 * `create_through_record` (has_one_through_association.rb:15-19) loads the
 * *through* proxy instead. So `member.buildClub(...)` must issue the
 * join-model (`memberships`) SELECT and NEVER the target-join (`clubs INNER
 * JOIN memberships`) SELECT that a direct-FK has_one's `load_target` would
 * run. No Rails test pins this shape — the has_one_through /
 * has_one_through_disable_joins / nested_attributes suites all pass both with
 * and without the fix (an `assert_queries_count` alone matches both). Hence a
 * dedicated shape assertion here.
 */
import { describe, it, expect } from "vitest";
import { registerModel, enableSti } from "../index.js";
import { fixtures } from "../test-helpers/fixtures.js";
import { Notifications, NotificationEvent } from "@blazetrails/activesupport";
import { SQLCounter, type SqlPayload } from "../testing/query-assertions.js";
import { Member } from "../test-helpers/models/member.js";
import { Club } from "../test-helpers/models/club.js";
import { Membership, CurrentMembership } from "../test-helpers/models/membership.js";

describe("HasOneThroughBuildTrails", () => {
  const { members } = fixtures(["members", "clubs", "memberships"]);

  registerModel(Member);
  registerModel(Club);
  enableSti(Membership);
  registerModel(Membership);
  registerModel(CurrentMembership);

  it("buildClub on an unloaded through loads the through proxy, not the target join", async () => {
    const member = members("groucho");
    expect(member.association("club").isLoaded()).toBe(false);

    const counter = new SQLCounter();
    const sub = Notifications.subscribe("sql.active_record", (event: NotificationEvent) => {
      counter.call(event.name, event.transactionId, event.payload as SqlPayload);
    });

    let built: Club;
    try {
      built = await (
        member as unknown as { buildClub(attrs: Record<string, unknown>): Promise<Club> }
      ).buildClub({ name: "New Club" });
    } finally {
      Notifications.unsubscribe(sub);
    }

    const queries = counter.log;

    // No `clubs INNER JOIN memberships` target load — Rails never issues it.
    expect(queries.some((q) => /clubs/i.test(q) && /inner join/i.test(q))).toBe(false);
    expect(queries.some((q) => /clubs/i.test(q))).toBe(false);

    // Exactly the through-proxy load, as `create_through_record` runs.
    const membershipLoads = queries.filter((q) => /from\s+["'`]?memberships/i.test(q));
    expect(membershipLoads.length).toBe(1);

    // The built target is the freshly-built new club, reconciled onto the
    // existing (loaded) join row.
    expect(built).toBeInstanceOf(Club);
    expect(built.isNewRecord()).toBe(true);
    expect(member.association("club").target).toBe(built);
  });

  it("buildClub then save reconciles the existing join row without duplicating it", async () => {
    const member = members("groucho");
    // Scope the join-row count to this member — a shared parallel DB races a
    // global CurrentMembership.count against concurrent fixture reloads.
    const joinCount = async (): Promise<number> =>
      (await CurrentMembership.where({ member_id: member.id }).count()) as number;
    const before = await joinCount();

    const newClub = await (
      member as unknown as { buildClub(attrs: Record<string, unknown>): Promise<Club> }
    ).buildClub({ name: "Brand New Club" });
    await member.save();

    // Rails' create_through_record `update`s the loaded join row rather than
    // inserting a second one — the count is unchanged and the through now
    // points at the freshly-persisted club.
    expect(await joinCount()).toBe(before);
    expect(newClub.isPersisted()).toBe(true);
    await member.association("club").reload();
    expect((member.association("club").target as Club | null)?.id).toBe(newClub.id);
  });

  it("buildClub over a loaded through target does not touch the displaced club", async () => {
    const member = members("groucho");
    const displaced = (await (member as unknown as { club: Promise<Club | null> }).club) as Club;
    expect(displaced).toBeInstanceOf(Club);
    expect(member.association("club").isLoaded()).toBe(true);
    const joinsBefore = (await CurrentMembership.where({ member_id: member.id }).count()) as number;

    const built = await (
      member as unknown as { buildClub(attrs: Record<string, unknown>): Promise<Club> }
    ).buildClub({ name: "Displacing Club" });

    expect(built.isNewRecord()).toBe(true);
    expect(member.association("club").target).toBe(built);
    expect(displaced.hasChangesToSave).toBe(false);

    await member.save();

    const reloadedDisplaced = await Club.find(displaced.id);
    expect(reloadedDisplaced.name).toBe(displaced.name);
    expect((await CurrentMembership.where({ member_id: member.id }).count()) as number).toBe(
      joinsBefore,
    );
    await member.association("club").reload();
    expect((member.association("club").target as Club | null)?.id).toBe(built.id);
  });

  it("createClub over a loaded through target does not touch the displaced club", async () => {
    const member = members("groucho");
    const displaced = (await (member as unknown as { club: Promise<Club | null> }).club) as Club;
    expect(displaced).toBeInstanceOf(Club);
    const joinsBefore = (await CurrentMembership.where({ member_id: member.id }).count()) as number;

    const created = await (
      member as unknown as { createClub(attrs: Record<string, unknown>): Promise<Club> }
    ).createClub({ name: "Created Displacing Club" });

    expect(created.isPersisted()).toBe(true);
    expect(member.association("club").target).toBe(created);
    expect(displaced.hasChangesToSave).toBe(false);

    await member.save();

    const reloadedDisplaced = await Club.find(displaced.id);
    expect(reloadedDisplaced.name).toBe(displaced.name);
    expect((await CurrentMembership.where({ member_id: member.id }).count()) as number).toBe(
      joinsBefore,
    );
    await member.association("club").reload();
    expect((member.association("club").target as Club | null)?.id).toBe(created.id);
  });
});
