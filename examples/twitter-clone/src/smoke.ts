/**
 * End-to-end smoke test driving the models directly (no HTTP). The `smoke`
 * script sets `TRAILS_ENV=test`, which `config/database.ts` maps to an
 * in-memory SQLite DB; this migrates it from scratch. Run with `pnpm smoke`.
 */
import { RecordInvalid } from "@blazetrails/activerecord";
import { connect, loadModelSchemas } from "./db.js";
import { migrate } from "./migrator.js";
import { User, Tweet, Follow } from "./models/index.js";

async function main() {
  await connect();
  await migrate();
  await loadModelSchemas();

  const alice = await User.createBang({ handle: "alice", display_name: "Alice" });
  const bob = await User.createBang({ handle: "bob", display_name: "Bob" });
  const carol = await User.createBang({ handle: "carol", display_name: "Carol" });

  await alice.tweets.createBang({ body: "hello world from alice" });
  await bob.tweets.createBang({ body: "bob's first tweet" });
  await bob.tweets.createBang({ body: "bob again" });
  await carol.tweets.createBang({ body: "carol lurking" });

  // alice follows bob and carol.
  await Follow.createBang({ follower_id: alice.id, followee_id: bob.id });
  await Follow.createBang({ follower_id: alice.id, followee_id: carol.id });

  const following = await alice.following;
  console.log(
    "alice follows:",
    following.map((u) => u.handle),
  );

  const bobFollowers = await bob.followers;
  console.log(
    "bob's followers:",
    bobFollowers.map((u) => u.handle),
  );

  // Home timeline for alice: tweets from bob + carol, newest first.
  const followeeIds = following.map((u) => u.id);
  const timeline = await Tweet.recent().where({ user_id: followeeIds }).includes("author");
  console.log("alice's timeline:");
  for (const t of timeline) {
    console.log(`  @${t.author?.handle}: ${t.body}`);
  }

  // Validation: uniqueness on handle.
  try {
    await User.createBang({ handle: "alice", display_name: "Impostor" });
    console.error("FAIL: duplicate handle should have raised");
    process.exit(1);
  } catch (err) {
    // Assert it's the expected validation failure — not a DB constraint error
    // or some other unexpected throw masquerading as success.
    if (!(err instanceof RecordInvalid)) {
      console.error("FAIL: expected RecordInvalid, got:", err);
      process.exit(1);
    }
    console.log("duplicate handle rejected:", err.message);
  }

  console.log("\nSmoke test passed ✅");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
