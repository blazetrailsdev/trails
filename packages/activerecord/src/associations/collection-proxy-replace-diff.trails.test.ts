import { describe, it, expect } from "vitest";
import { registerModel } from "../index.js";
import { fixtures } from "../test-fixtures.js";
import { Author } from "../test-helpers/models/author.js";
import { Post } from "../test-helpers/models/post.js";
import { Person } from "../test-helpers/models/person.js";
import { Firm, Client } from "../test-helpers/models/company.js";
import { CollectionPersistedAssignmentError } from "./errors.js";
import { Reader } from "../test-helpers/models/reader.js";

registerModel(Author);
registerModel(Post);
registerModel(Person);
registerModel(Firm);
registerModel(Client);
registerModel(Reader);

describe("collection replace diffs instead of clearing", () => {
  const { authors, posts, people, companies } = fixtures([
    "authors",
    "posts",
    "people",
    "readers",
    "companies",
  ]);

  it("leaves records common to the old and new target untouched", async () => {
    const author = await Author.find(authors("david").id);
    const current = await author.postsWithCallbacks;
    expect(current.length).toBeGreaterThan(1);
    const [dropped, ...kept] = current;

    author.postLog = [];
    await author.postsWithCallbacks.replace(kept);

    expect(author.postLog).toEqual([`before_removing${dropped.id}`, `after_removing${dropped.id}`]);
  });

  it("diffs an unloaded persisted collection against the loaded baseline", async () => {
    const author = await Author.find(authors("david").id);
    const all = await Post.where({ author_id: author.id });
    expect(all.length).toBeGreaterThan(1);
    const [dropped, ...kept] = all;

    const fresh = await Author.find(authors("david").id);
    fresh.postLog = [];
    await fresh.postsWithCallbacks.replace(kept);

    expect(fresh.postLog).toEqual([`before_removing${dropped.id}`, `after_removing${dropped.id}`]);
    expect((await Post.where({ author_id: author.id })).map((p) => Number(p.id))).toEqual(
      kept.map((p) => Number(p.id)),
    );
  });

  it("adds only the records the new target gained", async () => {
    const author = await Author.find(authors("david").id);
    const current = await author.postsWithCallbacks;
    const incoming = (await Post.where({ author_id: authors("mary").id }))[0];

    author.postLog = [];
    await author.postsWithCallbacks.replace([...current, incoming]);

    expect(author.postLog).toEqual([`before_adding${incoming.id}`, `after_adding${incoming.id}`]);
  });

  it("creates one join row per occurrence for has_many :through", async () => {
    const post = await Post.find(posts("thinking").id);
    const david = await Person.find(people("david").id);

    await post.people.replace([david]);
    const afterOne = await Reader.where({ post_id: post.id }).count();
    await post.people.replace([david, david]);

    expect(await Reader.where({ post_id: post.id }).count()).toBe(Number(afterOne) + 1);
  });

  it("re-creates the join row when a duplicate is replaced by a single occurrence", async () => {
    const post = await Post.find(posts("thinking").id);
    const david = await Person.find(people("david").id);

    await post.people.replace([david, david]);
    const duplicated = await Reader.where({ post_id: post.id });
    expect(duplicated.length).toBe(2);

    await post.people.replace([david]);
    const remaining = await Reader.where({ post_id: post.id });

    expect(remaining.length).toBe(1);
    expect(duplicated.map((r) => Number(r.id))).not.toContain(Number(remaining[0].id));
  });

  it("rolls the whole replace back when one of the new records cannot be saved", async () => {
    const firm = await Firm.find(companies("first_firm").id);
    const good = Client.new({ name: "Good" });
    const bad = Client.new({ name: "Bad" });
    bad.raiseOnSave = true;

    const beforeIds = (await firm.clientsOfFirm).map((c) => c.id);
    await expect(firm.clientsOfFirm.replace([good, bad])).rejects.toThrow(Client.RaisedOnSave);

    const after = await Firm.find(companies("first_firm").id);
    expect((await after.clientsOfFirm).map((c) => c.id)).toEqual(beforeIds);
  });

  it("loads the baseline for a new owner whose primary key is already set", async () => {
    const persisted = await Firm.find(companies("first_firm").id);
    const existing = await persisted.clients;
    expect(existing.length).toBeGreaterThan(0);

    const firm = new Firm({ id: companies("first_firm").id });
    expect(firm.isNewRecord()).toBe(true);
    await firm.clients.replace([]);

    expect((await firm.clients).length).toBe(0);
    expect(await Client.where({ client_of: companies("first_firm").id })).toEqual([]);
  });

  it("refuses a mass-assigned replace that owes the database", async () => {
    const id = companies("first_firm").id;
    expect(() => new Firm({ id, clients: [] })).toThrow(CollectionPersistedAssignmentError);
    expect((await Client.where({ client_of: id })).length).toBeGreaterThan(0);

    const fresh = new Firm({ name: "fresh" });
    expect(() => fresh.assignAttributes({ clients: [] })).not.toThrow();
  });
});
