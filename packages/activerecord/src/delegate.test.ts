import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Base, registerModel, delegate } from "./index.js";
import { Associations } from "./associations.js";
import { clearAppliedSchemaSignatures, defineSchema } from "./test-helpers/define-schema.js";
import { dropAllTables } from "./test-helpers/drop-all-tables.js";
import { setupHandlerSuite } from "./test-helpers/setup-handler-suite.js";
import {
  withTransactionalFixtures,
  type TransactionalFixturesAdapter,
} from "./test-helpers/with-transactional-fixtures.js";

setupHandlerSuite();

let _txAdapter: TransactionalFixturesAdapter | null = null;
beforeAll(async () => {
  await defineSchema({
    authors: { name: "string", city: "string" },
    posts: { title: "string", author_id: "integer" },
  });
  const raw = Base.adapter;
  _txAdapter = new Proxy(raw, {
    get(target, prop) {
      if (prop === "pool") return null;
      return Reflect.get(target, prop, target);
    },
  }) as unknown as TransactionalFixturesAdapter;
});
withTransactionalFixtures(() => _txAdapter!);
afterAll(async () => {
  const adapter = Base.adapter;
  await dropAllTables(adapter);
  clearAppliedSchemaSignatures(adapter);
});

describe("Delegate (Rails-guided)", () => {
  // Rails: test "delegate to association"
  it("delegates attribute reads to a belongs_to association", async () => {
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

  // Rails: test "delegate with prefix"
  it("delegate with prefix: true prefixes method names", async () => {
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

  // Rails: test "delegate returns null when association is nil"
  it("returns null when the association target is nil", async () => {
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
});
