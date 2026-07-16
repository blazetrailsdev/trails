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
});
