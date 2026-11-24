import { beforeEach, describe, expect, it } from "vitest";
import { RecordInvalid } from "@blazetrails/activerecord";
import { resetDatabase } from "../test-helper.ts";
import { Follow } from "../../app/models/follow.ts";
import { Tweet } from "../../app/models/tweet.ts";
import { User } from "../../app/models/user.ts";

describe("SmokeTest", () => {
  beforeEach(resetDatabase);

  it("follows, builds a timeline and rejects a duplicate handle", async () => {
    const alice = await User.createBang({ handle: "alice", display_name: "Alice" });
    const bob = await User.createBang({ handle: "bob", display_name: "Bob" });
    const carol = await User.createBang({ handle: "carol", display_name: "Carol" });

    await alice.tweets.createBang({ body: "hello world from alice" });
    await bob.tweets.createBang({ body: "bob's first tweet" });
    await bob.tweets.createBang({ body: "bob again" });
    await carol.tweets.createBang({ body: "carol lurking" });

    await Follow.createBang({ follower_id: alice.id, followee_id: bob.id });
    await Follow.createBang({ follower_id: alice.id, followee_id: carol.id });

    const following = await alice.following;
    expect(following.map((u) => u.handle).sort()).toEqual(["bob", "carol"]);
    expect((await bob.followers).map((u) => u.handle)).toEqual(["alice"]);

    const timeline = await Tweet.where({ user_id: following.map((u) => u.id) })
      .includes("author")
      .recent();
    const authors = [];
    for (const t of timeline) authors.push((await t.author)?.handle);
    expect(authors.sort()).toEqual(["bob", "bob", "carol"]);

    await expect(User.createBang({ handle: "alice", display_name: "Impostor" })).rejects.toThrow(
      RecordInvalid,
    );
  });
});
