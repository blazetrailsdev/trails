import { User, Follow } from "../src/models/index.js";

/**
 * Idempotent seed data — the analog of Rails' `db/seeds.rb`, run by
 * `pnpm db:seed` (and as part of `db:setup` / `db:prepare`). Assumes the
 * connection is already established and model schemas loaded.
 */
export async function seed(): Promise<void> {
  const handles = [
    { handle: "ada", display_name: "Ada Lovelace", bio: "first programmer" },
    { handle: "grace", display_name: "Grace Hopper", bio: "compiler pioneer" },
    { handle: "alan", display_name: "Alan Turing" },
  ];

  const users = [];
  for (const attrs of handles) {
    // findOrCreateBy keeps the seed idempotent across repeated runs.
    users.push(await User.findOrCreateBy({ handle: attrs.handle }, attrs));
  }
  const [ada, grace, alan] = users;

  if ((await ada.tweets.count()) === 0) {
    await ada.tweets.createBang({ body: "writing notes on the Analytical Engine ✍️" });
    await grace.tweets.createBang({ body: "found a literal bug in the relay 🦟" });
    await alan.tweets.createBang({ body: "can machines think? 🤔" });
  }

  await Follow.findOrCreateBy({ follower_id: ada.id, followee_id: grace.id });
  await Follow.findOrCreateBy({ follower_id: ada.id, followee_id: alan.id });
  await Follow.findOrCreateBy({ follower_id: grace.id, followee_id: ada.id });

  console.log(`Seeded ${await User.count()} users, ${await Follow.count()} follows.`);
}
