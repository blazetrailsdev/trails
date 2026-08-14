/**
 * End-to-end smoke test: boots the real application and drives every flow
 * over real HTTP, asserting on the rendered HTML.
 *
 * Run with `pnpm smoke` (which sets `TRAILS_ENV=test`).
 *
 * This is deliberately dependency-free rather than a vitest suite: it is the
 * proof that a trails app serves HTML to an ordinary HTTP client, so it uses
 * `fetch` against a real listening socket and nothing else.
 */
import assert from "node:assert/strict";
import type { Server } from "node:http";
import { listen } from "../../src/server.js";
import { connect } from "../../src/config/application.js";
import { digestPassword } from "../../src/app/controllers/users-controller.js";
import { User } from "../../src/app/models/user.js";
import { Tweet } from "../../src/app/models/tweet.js";
import { Follow } from "../../src/app/models/follow.js";
import { Like } from "../../src/app/models/like.js";
import { Hashtag } from "../../src/app/models/hashtag.js";

/** A cookie-retaining HTTP client — the browser stand-in. */
class Client {
  private cookie = "";

  constructor(private readonly base: string) {}

  async get(path: string): Promise<Response> {
    return this.request("GET", path);
  }

  async post(path: string, form: Record<string, string>): Promise<Response> {
    return this.request("POST", path, new URLSearchParams(form).toString());
  }

  private async request(method: string, path: string, body?: string): Promise<Response> {
    const res = await fetch(`${this.base}${path}`, {
      method,
      redirect: "manual",
      headers: {
        ...(this.cookie ? { cookie: this.cookie } : {}),
        ...(body != null ? { "content-type": "application/x-www-form-urlencoded" } : {}),
      },
      body,
    });
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) this.cookie = setCookie.split(";")[0];
    return res;
  }

  /** POST then follow the redirect, as a browser would. */
  async submit(path: string, form: Record<string, string>): Promise<string> {
    const res = await this.post(path, form);
    assert.equal(res.status, 302, `expected ${path} to redirect, got ${res.status}`);
    const location = res.headers.get("location")!;
    const followed = await this.get(location);
    assert.equal(followed.status, 200, `expected ${location} to render`);
    return followed.text();
  }
}

async function resetDatabase(): Promise<void> {
  await connect();
  for (const model of [Like, Follow, Tweet, User, Hashtag]) await model.deleteAll();
  await User.createBang({
    handle: "ada",
    display_name: "Ada Lovelace",
    bio: "The first programmer.",
    password_digest: digestPassword("password"),
  });
}

let checks = 0;
function check(condition: boolean, message: string): void {
  assert.ok(condition, message);
  checks += 1;
  console.log(`  ok  ${message}`);
}

async function main(): Promise<void> {
  await resetDatabase();

  const server: Server = await listen(0);
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const base = `http://127.0.0.1:${port}`;

  try {
    const client = new Client(base);

    // --- The signed-out timeline renders HTML ---
    const home = await client.get("/");
    check(home.status === 200, "GET / returns 200");
    check(
      (home.headers.get("content-type") ?? "").startsWith("text/html"),
      "GET / is served as text/html",
    );
    const homeHtml = await home.text();
    check(homeHtml.startsWith("<!DOCTYPE html>"), "GET / renders the layout");
    check(homeHtml.includes("<h1>Timeline</h1>"), "GET / renders the tweets#index template");
    check(homeHtml.includes('<a href="/login">Log in</a>'), "signed out, the layout offers log in");

    // --- Sign up ---
    const signup = await client.get("/signup");
    check((await signup.text()).includes("Sign up"), "GET /signup renders the form");

    const afterSignup = await client.submit("/users", {
      "user[handle]": "dean",
      "user[display_name]": "Dean",
      "user[bio]": "Porting Rails.",
      "user[password]": "swordfish",
    });
    check(afterSignup.includes("Welcome, @dean!"), "sign up sets a flash shown after the redirect");
    check(afterSignup.includes("@dean</a>"), "sign up logs the new user in");

    // --- Post a tweet ---
    const afterTweet = await client.submit("/tweets", {
      "tweet[body]": "First tweet from a trails app.",
    });
    check(afterTweet.includes("Tweet posted."), "posting a tweet sets a flash");
    check(
      afterTweet.includes("First tweet from a trails app."),
      "the new tweet renders in the timeline",
    );
    check(!afterTweet.includes("Welcome, @dean!"), "the previous flash is single-use");

    // --- A validation failure re-renders the form, Rails-style ---
    const afterBlank = await client.post("/tweets", { "tweet[body]": "" });
    check(afterBlank.status === 422, "a blank tweet is rejected with 422");
    check(
      (await afterBlank.text()).includes("can&#39;t be blank"),
      "a blank tweet is rejected by the model",
    );

    // --- Profiles ---
    const profile = await client.get("/@ada");
    check(profile.status === 200, "GET /@ada returns 200");
    const profileHtml = await profile.text();
    check(profileHtml.includes("Ada Lovelace"), "the profile renders the display name");
    check(profileHtml.includes("0 followers"), "the profile counts followers");
    check(
      profileHtml.includes('<button type="submit">Follow</button>'),
      "the profile offers Follow",
    );

    // --- Follow / unfollow ---
    const afterFollow = await client.submit("/@ada/follow", {});
    check(afterFollow.includes("You now follow @ada."), "following sets a flash");
    check(afterFollow.includes("1 followers"), "the follower count updates");
    check(
      afterFollow.includes('<button type="submit">Unfollow</button>'),
      "the profile now offers Unfollow",
    );

    const followingPage = await client.get("/@dean/following");
    check((await followingPage.text()).includes("@ada"), "GET /@dean/following lists @ada");

    // --- Ada's tweet now appears in dean's home timeline ---
    const ada = (await User.findBy({ handle: "ada" }))!;
    await ada.tweets.createBang({ body: "The Analytical Engine weaves algebraic patterns." });
    const timeline = await (await client.get("/")).text();
    check(
      timeline.includes("The Analytical Engine weaves algebraic patterns."),
      "the home timeline includes tweets from people you follow",
    );

    // --- Like / unlike ---
    const adaTweet = (await Tweet.findBy({ user_id: ada.id }))!;
    const likeRes = await client.post(`/tweets/${adaTweet.id}/like`, {});
    check(likeRes.status === 302, "liking a tweet redirects back");
    check((await Like.where({ tweet_id: adaTweet.id }).count()) === 1, "the like is persisted");

    await client.post(`/tweets/${adaTweet.id}/unlike`, {});
    check((await Like.where({ tweet_id: adaTweet.id }).count()) === 0, "the like is removed");

    // --- A tweet permalink ---
    const permalink = await client.get(`/tweets/${adaTweet.id}`);
    check(permalink.status === 200, "GET /tweets/:id returns 200");
    check((await permalink.text()).includes("<h1>Tweet</h1>"), "the permalink renders show");

    // --- HTML escaping ---
    await ada.tweets.createBang({ body: "<script>alert(1)</script>" });
    const escaped = await (await client.get("/@ada")).text();
    check(escaped.includes("&lt;script&gt;"), "tweet bodies are HTML-escaped");
    check(!escaped.includes("<script>alert(1)</script>"), "the raw script tag is not emitted");

    // --- Log out ---
    const afterLogout = await client.submit("/logout", {});
    check(afterLogout.includes("Signed out."), "logging out sets a flash");
    check(afterLogout.includes('<a href="/login">Log in</a>'), "logging out clears the session");

    // --- The requireLogin filter ---
    const guarded = await client.get("/tweets/new");
    check(guarded.status === 302, "GET /tweets/new redirects when signed out");
    check(
      guarded.headers.get("location") === "/login",
      "the requireLogin filter sends you to /login",
    );
    check(
      (await (await client.get("/login")).text()).includes("Please log in first."),
      "the filter's flash is shown on the login page",
    );

    // --- Log back in ---
    const afterLogin = await client.submit("/login", { handle: "dean", password: "swordfish" });
    check(afterLogin.includes("Signed in as @dean."), "logging in with the right password works");

    const badLogin = await client.submit("/login", { handle: "dean", password: "wrong" });
    check(badLogin.includes("don&#39;t match"), "logging in with a bad password is rejected");

    // --- 404s ---
    const missing = await client.get("/@nobody");
    check(missing.status === 404, "an unknown handle returns 404");

    // --- ActiveRecord: callbacks, counter caches, HABTM, threading ---
    await client.submit("/login", { handle: "dean", password: "swordfish" });

    const tagged = await client.submit("/tweets", {
      "tweet[body]": "  Shipping #Trails today #trails  ",
    });
    check(
      tagged.includes("Shipping #Trails today"),
      "the beforeValidation callback trims the body",
    );
    check(
      (await Hashtag.where({ name: "trails" }).count()) === 1,
      "the afterSave callback creates each hashtag once, case-folded",
    );
    check(tagged.includes('href="/hashtags/trails"'), "the tweet renders its hashtag link");

    const dean = (await User.findBy({ handle: "dean" }))!;
    const tweet = (await Tweet.where({ user_id: dean.id }).order({ created_at: "desc" }))[0];
    check(
      Number(dean.tweets_count) === Number(await Tweet.where({ user_id: dean.id }).count()),
      "belongsTo counterCache matches the live count of users.tweets_count",
    );

    const hashtagPage = await client.get("/hashtags/trails");
    check(hashtagPage.status === 200, "GET /hashtags/:name returns 200");
    check(
      (await hashtagPage.text()).includes("Shipping #Trails today"),
      "the hashtag page lists tweets through the HABTM join table",
    );

    const threaded = await client.submit("/tweets", {
      "tweet[body]": "replying to myself",
      "tweet[reply_to_id]": String(tweet.id),
    });
    check(threaded.includes("replying to myself"), "a reply renders in its parent's thread");
    check(
      Number((await Tweet.findBy({ id: tweet.id }))!.replies_count) === 1,
      "the self-referential counterCache maintains replies_count",
    );
    check(
      (await Tweet.roots().count()) < (await Tweet.count()),
      "the roots scope excludes replies",
    );

    // --- Validations, errors, and i18n ---
    const tooLong = await client.post("/tweets", { "tweet[body]": "x".repeat(300) });
    check(tooLong.status === 422, "an invalid tweet re-renders the form with 422");
    const tooLongHtml = await tooLong.text();
    check(
      tooLongHtml.includes("is too long — keep it under 280 characters"),
      "the length error uses the model-scoped i18n override with %{count}",
    );
    check(
      tooLongHtml.includes('name="tweet[body]"'),
      "the invalid form is re-rendered, not redirected away from",
    );

    const badSignup = await client.post("/users", {
      "user[handle]": "Bad Handle!",
      "user[display_name]": "",
      "user[password]": "x",
    });
    const badSignupHtml = await badSignup.text();
    check(
      badSignupHtml.includes("may only contain letters, numbers and underscores"),
      "the format validator reports its custom message",
    );
    check(
      badSignupHtml.includes("Display name can&#39;t be blank"),
      "errors.fullMessages humanizes the attribute name",
    );
    check(
      badSignupHtml.includes("3 errors prevented"),
      "every validation error is reported at once, not one at a time",
    );

    const dupe = await client.post("/users", {
      "user[handle]": "dean",
      "user[display_name]": "Dean",
      "user[password]": "swordfish",
    });
    check(
      (await dupe.text()).includes("is already someone else&#39;s handle"),
      "the uniqueness error uses the model-scoped i18n override",
    );

    const doubleLike = await Like.createBang({ user_id: dean.id, tweet_id: tweet.id });
    const second = Like.new({ user_id: dean.id, tweet_id: tweet.id });
    check(!(await second.isValid()), "validatesUniqueness with a scope rejects a duplicate like");
    check(
      second.errors.fullMessagesFor("user_id").length > 0,
      "the scoped uniqueness error is attached to its attribute",
    );
    await doubleLike.destroy();

    // --- ActionView date helper over an ActiveRecord timestamp ---
    check(
      (await (await client.get("/")).text()).includes(" ago"),
      "time_ago_in_words renders against the record's created_at",
    );

    const explore = await client.get("/explore");
    check(explore.status === 200, "GET /explore returns 200");
    const exploreHtml = await explore.text();
    check(exploreHtml.includes("#trails"), "explore lists trending hashtags from the join query");
    check(exploreHtml.includes("Who to follow"), "explore renders the suggestion query");

    console.log(`\n${checks} checks passed.`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
