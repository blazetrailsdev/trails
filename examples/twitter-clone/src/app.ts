import express, { type Request, type Response, type NextFunction } from "express";
import { RecordInvalid, RecordNotFound, RecordNotUnique } from "@blazetrails/activerecord";
import { User, Tweet, Follow, Like } from "./models/index.js";

/**
 * Wrap an async route so rejected promises hit Express's error handler
 * instead of crashing the process.
 */
const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

export function buildApp() {
  const app = express();
  app.use(express.json());

  // --- Users ---

  app.post(
    "/users",
    wrap(async (req, res) => {
      const { handle, display_name, bio } = (req.body ?? {}) as {
        handle?: string;
        display_name?: string;
        bio?: string;
      };
      const user = await User.createBang({ handle, display_name, bio });
      res.status(201).json(user.attributes);
    }),
  );

  app.get(
    "/users/:handle",
    wrap(async (req, res) => {
      const user = await User.findByBang({ handle: req.params.handle });
      res.json({
        ...user.attributes,
        followers: await user.followers.count(),
        following: await user.following.count(),
      });
    }),
  );

  // --- Tweets ---

  app.post(
    "/users/:handle/tweets",
    wrap(async (req, res) => {
      const user = await User.findByBang({ handle: req.params.handle });
      const { body } = (req.body ?? {}) as { body?: string };
      // `user.tweets.createBang` sets user_id automatically.
      const tweet = await user.tweets.createBang({ body });
      res.status(201).json(tweet.attributes);
    }),
  );

  // A user's own tweets, newest first.
  app.get(
    "/users/:handle/tweets",
    wrap(async (req, res) => {
      const user = await User.findByBang({ handle: req.params.handle });
      const tweets = await user.tweets.order("created_at", "desc");
      res.json(tweets.map((t) => t.attributes));
    }),
  );

  // The home timeline: tweets from everyone this user follows, newest first.
  app.get(
    "/users/:handle/timeline",
    wrap(async (req, res) => {
      const user = await User.findByBang({ handle: req.params.handle });
      const followeeIds = (await user.following).map((u) => u.id);
      const tweets = await Tweet.recent()
        .where({ user_id: followeeIds })
        .includes("author")
        .limit(50);
      res.json(
        tweets.map((t: Tweet) => ({
          id: t.id,
          body: t.body,
          author: t.author?.handle,
          created_at: t.created_at,
        })),
      );
    }),
  );

  // --- Follows ---

  app.post(
    "/users/:handle/follow/:target",
    wrap(async (req, res) => {
      const follower = await User.findByBang({ handle: req.params.handle });
      const followee = await User.findByBang({ handle: req.params.target });
      const follow = await Follow.createBang({
        follower_id: follower.id,
        followee_id: followee.id,
      });
      res.status(201).json(follow.attributes);
    }),
  );

  // --- Likes ---

  app.post(
    "/tweets/:id/like",
    wrap(async (req, res) => {
      const tweet = await Tweet.find(Number(req.params.id));
      const { handle } = (req.body ?? {}) as { handle?: string };
      const user = await User.findByBang({ handle });
      const like = await Like.createBang({ user_id: user.id, tweet_id: tweet.id });
      res.status(201).json({ ...like.attributes, likes: await tweet.likes.count() });
    }),
  );

  // --- Error handling: map ActiveRecord exceptions to HTTP statuses ---

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof RecordNotFound) {
      return res.status(404).json({ error: err.message });
    }
    if (err instanceof RecordInvalid) {
      return res.status(422).json({ error: err.message });
    }
    // A concurrent insert can lose the unique-index race after the app-level
    // uniqueness check passes; the DB raises RecordNotUnique. That's a client
    // conflict (duplicate), not an internal error.
    if (err instanceof RecordNotUnique) {
      return res.status(409).json({ error: err.message });
    }
    // Preserve client-error statuses — e.g. `express.json()` throws a 400 with
    // `status`/`statusCode` set on malformed JSON — instead of masking them as 500.
    const status =
      (err as { status?: number; statusCode?: number }).status ??
      (err as { statusCode?: number }).statusCode;
    if (typeof status === "number" && status >= 400 && status < 500) {
      return res.status(status).json({ error: (err as Error).message });
    }
    console.error(err);
    res.status(500).json({ error: "internal server error" });
  });

  return app;
}
