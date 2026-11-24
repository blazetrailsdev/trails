// Idempotent seed data, loaded by `bin/trails db:seed` (and by `db:setup` / `db:prepare`).
import { Follow } from "../app/models/follow.ts";
import { User } from "../app/models/user.ts";

const handles = [
  { handle: "ada", display_name: "Ada Lovelace", bio: "first programmer" },
  { handle: "grace", display_name: "Grace Hopper", bio: "compiler pioneer" },
  { handle: "alan", display_name: "Alan Turing" },
];

const users: User[] = [];
for (const attrs of handles) {
  // findOrCreateByBang keeps the seed idempotent across repeated runs.
  users.push(
    (await User.findOrCreateByBang({ handle: attrs.handle }, (user) =>
      user.assignAttributes(attrs),
    ))!,
  );
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
