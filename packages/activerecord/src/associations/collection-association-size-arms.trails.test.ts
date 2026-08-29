import { describe, it, expect, beforeAll } from "vitest";
import { registerModel } from "../index.js";
import { Author } from "../test-helpers/models/author.js";
import { Post } from "../test-helpers/models/post.js";
import { Firm, Client } from "../test-helpers/models/company.js";
import { fixtures } from "../test-fixtures.js";

interface SizeableAssociation {
  target: Post[];
  isLoaded(): boolean;
  loadedBang(): void;
  addToTarget(record: Post): Post;
  size(): Promise<number> | number;
}

const association = (author: Author, name: string): SizeableAssociation =>
  (author as unknown as { association(name: string): SizeableAssociation }).association(name);

describe("CollectionAssociation#size arms", () => {
  const { authors } = fixtures(["authors", "posts", "comments"]);

  beforeAll(() => {
    registerModel(Author);
    registerModel(Post);
  });

  it("counts the target when the association is loaded", async () => {
    const author = await Author.find(authors("david").id);
    const assoc = association(author, "posts");
    const persisted = (await Post.where({ author_id: author.id }).count()) as number;

    assoc.target.length = 0;
    assoc.loadedBang();

    expect(await assoc.size()).toBe(0);
    expect(persisted).toBeGreaterThan(0);
  });

  it("counts records with a COUNT(*) when the association is not loaded", async () => {
    const author = await Author.find(authors("david").id);
    const assoc = association(author, "posts");
    const persisted = (await Post.where({ author_id: author.id }).count()) as number;

    expect(assoc.isLoaded()).toBe(false);
    expect(await assoc.size()).toBe(persisted);
  });

  it("adds buffered new records to the counted records", async () => {
    const author = await Author.find(authors("david").id);
    const assoc = association(author, "posts");
    const persisted = (await Post.where({ author_id: author.id }).count()) as number;

    assoc.addToTarget(Post.new({ title: "unsaved", body: "unsaved" }));

    expect(assoc.isLoaded()).toBe(false);
    expect(await assoc.size()).toBe(persisted + 1);
  });
});

describe("CollectionAssociation#size with a grouped association scope", () => {
  const { companies } = fixtures(["companies", "accounts"]);

  beforeAll(() => {
    registerModel(Firm);
    registerModel(Client);
  });

  it("loads the target and counts it when the association scope groups", async () => {
    const firm = (await Firm.find(companies("first_firm").id)) as unknown as Author;
    const assoc = association(firm, "clientsGroupedByFirmId");
    const size = await assoc.size();

    expect(assoc.isLoaded()).toBe(true);
    expect(size).toBe(assoc.target.length);
    expect(size).toBeGreaterThan(0);
  });
});
