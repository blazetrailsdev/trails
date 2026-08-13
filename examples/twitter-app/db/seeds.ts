import { connect } from "../src/config/application.js";
import { digestPassword } from "../src/app/controllers/users-controller.js";
import { User } from "../src/app/models/user.js";
import { Tweet } from "../src/app/models/tweet.js";
import { Follow } from "../src/app/models/follow.js";
import { Like } from "../src/app/models/like.js";

export default async function seed(): Promise<void> {
  await connect();

  for (const model of [Like, Follow, Tweet, User]) await model.deleteAll();

  const people = [
    { handle: "dean", display_name: "Dean", bio: "Porting Rails, one method at a time." },
    { handle: "ada", display_name: "Ada Lovelace", bio: "The first programmer." },
    { handle: "grace", display_name: "Grace Hopper", bio: "Compilers, and a nanosecond of wire." },
  ];

  const users: Record<string, User> = {};
  for (const attrs of people) {
    users[attrs.handle] = await User.createBang({
      ...attrs,
      password_digest: digestPassword("password"),
    });
  }

  const tweets: Record<string, Tweet> = {};
  const posts: Array<[string, string]> = [
    ["dean", "First tweet from a server-rendered trails app."],
    ["ada", "The Analytical Engine weaves algebraic patterns."],
    ["ada", "Anything the engine can be told to do, it can do."],
    ["grace", "The most damaging phrase in the language is 'we've always done it this way'."],
  ];
  for (const [handle, body] of posts) {
    tweets[body] = await users[handle].tweets.createBang({ body });
  }

  await Follow.createBang({ follower_id: users.dean.id, followee_id: users.ada.id });
  await Follow.createBang({ follower_id: users.dean.id, followee_id: users.grace.id });
  await Follow.createBang({ follower_id: users.ada.id, followee_id: users.grace.id });

  await Like.createBang({
    user_id: users.dean.id,
    tweet_id: tweets["Anything the engine can be told to do, it can do."].id,
  });

  console.log(`Seeded ${people.length} users and ${posts.length} tweets.`);
  console.log("Log in as any of @dean, @ada, @grace with the password 'password'.");
}
