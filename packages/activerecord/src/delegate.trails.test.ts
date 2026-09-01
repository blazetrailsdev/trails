import { describe, it, expect } from "vitest";
import { Base, registerModel, delegate } from "./index.js";
import { Associations } from "./associations.js";
import { AssociationNotFoundError } from "./associations/errors.js";
import { fixtures } from "./test-fixtures.js";

describe("Delegate (Rails-guided)", () => {
  fixtures([]);

  it.skip("delegates attribute reads to a belongs_to association", async () => {
    class Author extends Base {
      static {
        this._tableName = "authors";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.attribute("city", "string");
      }
    }
    registerModel(Author);

    class Post extends Base {
      static {
        this._tableName = "posts";
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.attribute("author_id", "integer");
      }
    }
    Associations.belongsTo.call(Post, "author");
    delegate(Post, ["name", "city"], { to: "author" });

    const author = await Author.create({ name: "DHH", city: "Chicago" });
    const post = await Post.create({ title: "Rails is great", author_id: author.id });

    expect(await (post as any).name()).toBe("DHH");
    expect(await (post as any).city()).toBe("Chicago");
  });

  it.skip("delegate with prefix: true prefixes method names", async () => {
    class Author extends Base {
      static {
        this._tableName = "authors";
        this.attribute("id", "integer");
        this.attribute("name", "string");
      }
    }
    registerModel(Author);

    class Post extends Base {
      static {
        this._tableName = "posts";
        this.attribute("id", "integer");
        this.attribute("author_id", "integer");
      }
    }
    Associations.belongsTo.call(Post, "author");
    delegate(Post, ["name"], { to: "author", prefix: true });

    const author = await Author.create({ name: "DHH" });
    const post = await Post.create({ author_id: author.id });

    expect(await (post as any).authorName()).toBe("DHH");
  });

  it.skip("returns null when the association target is nil", async () => {
    class Author extends Base {
      static {
        this._tableName = "authors";
        this.attribute("id", "integer");
        this.attribute("name", "string");
      }
    }
    registerModel(Author);

    class Post extends Base {
      static {
        this._tableName = "posts";
        this.attribute("id", "integer");
        this.attribute("author_id", "integer");
      }
    }
    Associations.belongsTo.call(Post, "author");
    delegate(Post, ["name"], { to: "author" });

    const post = await Post.create({ author_id: null });
    expect(await (post as any).name()).toBeNull();
  });

  it("raises AssociationNotFoundError when the delegated association has no reflection", async () => {
    class Post extends Base {
      static {
        this._tableName = "posts";
        this.attribute("id", "integer");
      }
    }
    registerModel(Post);
    delegate(Post, ["name"], { to: "author" });

    await expect((new Post() as any).name()).rejects.toThrow(AssociationNotFoundError);
    await expect((new Post() as any).name()).rejects.toThrow(
      "Association named 'author' was not found on Post; perhaps you misspelled it?",
    );
  });
});
