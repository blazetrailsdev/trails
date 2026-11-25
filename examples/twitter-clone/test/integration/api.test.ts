import { beforeEach, describe, expect, it } from "vitest";
import { ApplicationIntegrationTest, resetDatabase } from "../test-helper.ts";

describe("ApiTest", () => {
  beforeEach(resetDatabase);

  it("creates users, tweets, follows and likes over HTTP", async () => {
    const t = new ApplicationIntegrationTest("api");
    await t.post("/users", { params: { handle: "alice", display_name: "Alice" }, as: ":json" });
    expect(t.response.status).toBe(201);
    await t.post("/users", { params: { handle: "bob", display_name: "Bob" }, as: ":json" });

    await t.post("/users/bob/tweets", { params: { body: "hello from bob" }, as: ":json" });
    expect(t.response.status).toBe(201);
    const tweetId = JSON.parse(t.response.body).id;

    await t.post("/users/alice/follow/bob");
    expect(t.response.status).toBe(201);

    await t.get("/users/alice/timeline");
    expect(t.response.status).toBe(200);
    const timeline = JSON.parse(t.response.body);
    expect(timeline.map((tw: { author: string; body: string }) => [tw.author, tw.body])).toEqual([
      ["bob", "hello from bob"],
    ]);

    await t.get("/users/bob/tweets");
    expect(JSON.parse(t.response.body)).toHaveLength(1);

    await t.post(`/tweets/${tweetId}/like`, { params: { handle: "alice" }, as: ":json" });
    expect(t.response.status).toBe(201);
    expect(JSON.parse(t.response.body).likes).toBe(1);

    await t.get("/users/bob");
    expect(JSON.parse(t.response.body)).toMatchObject({
      handle: "bob",
      followers: 1,
      following: 0,
    });
  });

  it("maps record errors to HTTP statuses", async () => {
    const t = new ApplicationIntegrationTest("errors");
    await t.get("/users/nobody");
    expect(t.response.status).toBe(404);
    expect(JSON.parse(t.response.body).error).toMatch(/User/);

    await t.post("/users", { params: { handle: "alice" }, as: ":json" });
    expect(t.response.status).toBe(422);
    expect(JSON.parse(t.response.body).error).toMatch(/Display name can't be blank/);
  });
});
