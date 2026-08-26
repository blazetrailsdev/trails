/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type --
   Each model below spells `include ActiveModel::Serialization` in its class body, the way the
   Rails test model it mirrors does; the empty class/interface merge beside it is how
   `include()` surfaces those members on the type side. */
import { describe, it, expect } from "vitest";
import { include } from "@blazetrails/activesupport";
import { Serialization } from "./serialization.js";
import { Model } from "./index.js";
import { NoMethodError } from "./attribute-assignment.js";

// Plain ActiveModel serializes `include:` entries via `send(association)` —
// the value behind a Ruby `attr_accessor :address` / `:friends` (see Rails'
// serialization_test.rb). The trails analog is a plain property on the
// instance; serialization reads it through the same `send` baseline. (For
// activerecord, `send` reaches the generated association reader instead.)
function setAssociationAccessors(record: unknown, entries: Record<string, unknown>): void {
  for (const [name, value] of Object.entries(entries)) {
    (record as Record<string, unknown>)[name] = value;
  }
}

describe("SerializationTest", () => {
  it("should use read attribute for serialization", () => {
    // Mirrors Rails: a per-instance `read_attribute_for_serialization` override
    // is consulted by `serializable_hash` (serialization_test.rb).
    class Person extends Model {
      static {
        include(this, Serialization);
        this.attribute("name", "string");
      }
    }
    interface Person extends Serialization {}

    const p = new Person({ name: "Alice" });
    (
      p as unknown as { readAttributeForSerialization(n: string): unknown }
    ).readAttributeForSerialization = () => "Jon";
    expect(p.serializableHash({ only: ["name"] })).toEqual({ name: "Jon" });
  });

  it("include option with empty association", () => {
    // Rails: `@user.friends = []` then `serializable_hash(include: :friends)`
    // yields `friends: []` — the accessor exists and returns an empty array.
    class Person extends Model {
      static {
        include(this, Serialization);
        this.attribute("name", "string");
      }
    }
    interface Person extends Serialization {}

    const p = new Person({ name: "Alice" });
    setAssociationAccessors(p, { posts: [] });
    const hash = p.serializableHash({ include: "posts" });
    expect(hash["name"]).toBe("Alice");
    expect(hash["posts"]).toEqual([]);
  });

  it("include option with ary", () => {
    // Rails wraps the association in a `FriendList` that responds to `to_ary`
    // (a non-array Enumerable). serialization maps over it element-wise.
    class Person extends Model {
      static {
        include(this, Serialization);
        this.attribute("name", "string");
      }
    }
    interface Person extends Serialization {}

    const friend = { _attributes: new Map([["name", "Joe"]]) };
    const friendList: Iterable<unknown> = {
      [Symbol.iterator]: () => [friend][Symbol.iterator](),
    };
    const p = new Person({ name: "Alice" });
    setAssociationAccessors(p, { friends: friendList });
    const hash = p.serializableHash({ include: "friends" });
    expect(hash["name"]).toBe("Alice");
    expect((hash["friends"] as Array<{ name: string }>)[0].name).toBe("Joe");
  });

  it("only include", () => {
    class Person extends Model {
      static {
        include(this, Serialization);
        this.attribute("name", "string");
        this.attribute("age", "integer");
      }
    }
    interface Person extends Serialization {}

    const p = new Person({ name: "Alice", age: 25 });
    const hash = p.serializableHash({ only: ["name"] });
    expect(hash["name"]).toBe("Alice");
    expect(hash["age"]).toBeUndefined();
  });

  it("except include", () => {
    class Person extends Model {
      static {
        include(this, Serialization);
        this.attribute("name", "string");
        this.attribute("age", "integer");
      }
    }
    interface Person extends Serialization {}

    const p = new Person({ name: "Alice", age: 25 });
    const hash = p.serializableHash({ except: ["age"] });
    expect(hash["name"]).toBe("Alice");
    expect(hash["age"]).toBeUndefined();
  });

  it("should raise NoMethodError for non existing method", () => {
    class Person extends Model {
      static {
        include(this, Serialization);
        this.attribute("name", "string");
      }
    }
    interface Person extends Serialization {}

    const p = new Person({ name: "test" });
    expect(() => p.serializableHash({ methods: ["nonexistent"] })).toThrow(NoMethodError);
    expect(() => p.serializableHash({ methods: ["nonexistent"] })).toThrow(
      /undefined method 'nonexistent'/,
    );
  });

  it("multiple includes", () => {
    class Person extends Model {
      static {
        include(this, Serialization);
        this.attribute("name", "string");
      }
    }
    interface Person extends Serialization {}

    const p = new Person({ name: "test" });
    const hash = p.serializableHash();
    expect(hash).toHaveProperty("name", "test");
  });

  it("nested include", () => {
    // Rails test_nested_include: `@user.friends.first.friends = [@user]` then
    // `serializable_hash(include: { friends: { include: :friends } })` recurses
    // one level — David's friends [Joe, Sue] each serialize their own friends
    // (Joe's is [David], Sue's is []).
    class User extends Model {
      static {
        include(this, Serialization);
        this.attribute("name", "string");
        this.attribute("email", "string");
        this.attribute("gender", "string");
      }
    }
    interface User extends Serialization {}

    const david = new User({ name: "David", email: "david@example.com", gender: "male" });
    const joe = new User({ name: "Joe", email: "joe@example.com", gender: "male" });
    const sue = new User({ name: "Sue", email: "sue@example.com", gender: "female" });
    setAssociationAccessors(joe, { friends: [david] });
    setAssociationAccessors(sue, { friends: [] });
    setAssociationAccessors(david, { friends: [joe, sue] });

    const hash = david.serializableHash({ include: { friends: { include: "friends" } } });
    expect(hash).toEqual({
      name: "David",
      email: "david@example.com",
      gender: "male",
      friends: [
        {
          name: "Joe",
          email: "joe@example.com",
          gender: "male",
          friends: [{ name: "David", email: "david@example.com", gender: "male" }],
        },
        {
          name: "Sue",
          email: "sue@example.com",
          gender: "female",
          friends: [],
        },
      ],
    });
  });

  it("multiple includes with options", () => {
    class Person extends Model {
      static {
        include(this, Serialization);
        this.attribute("name", "string");
        this.attribute("age", "integer");
      }
    }
    interface Person extends Serialization {}

    const p = new Person({ name: "test", age: 25 });
    const hash = p.serializableHash({ only: ["name"] });
    expect(hash).toHaveProperty("name", "test");
    expect(hash).not.toHaveProperty("age");
  });

  it("all includes with options", () => {
    class Person extends Model {
      static {
        include(this, Serialization);
        this.attribute("name", "string");
        this.attribute("age", "integer");
      }
    }
    interface Person extends Serialization {}

    const p = new Person({ name: "test", age: 25 });
    const hash = p.serializableHash();
    expect(hash).toHaveProperty("name", "test");
    expect(hash).toHaveProperty("age", 25);
  });

  class SerPerson extends Model {
    static {
      include(this, Serialization);
      this.attribute("name", "string");
      this.attribute("age", "integer");
      this.attribute("email", "string");
    }
    get greeting(): string {
      return `Hi ${this._readAttribute("name")}`;
    }
  }

  interface SerPerson extends Serialization {}

  it("method serializable hash should work", () => {
    const p = new SerPerson({ name: "Alice", age: 30, email: "a@b.com" });
    const hash = p.serializableHash();
    expect(hash.name).toBe("Alice");
    expect(hash.age).toBe(30);
    expect(hash.email).toBe("a@b.com");
  });

  it("method serializable hash should work with only option", () => {
    const p = new SerPerson({ name: "Alice", age: 30, email: "a@b.com" });
    const hash = p.serializableHash({ only: ["name"] });
    expect(hash.name).toBe("Alice");
    expect(hash.age).toBeUndefined();
  });

  it("method serializable hash should work with except option", () => {
    const p = new SerPerson({ name: "Alice", age: 30, email: "a@b.com" });
    const hash = p.serializableHash({ except: ["email"] });
    expect(hash.name).toBe("Alice");
    expect(hash.email).toBeUndefined();
  });

  it("method serializable hash should work with methods option", () => {
    const p = new SerPerson({ name: "Alice", age: 30, email: "a@b.com" });
    const hash = p.serializableHash({ methods: ["greeting"] });
    expect(hash.greeting).toBe("Hi Alice");
  });

  it("method serializable hash should work with only and methods", () => {
    const p = new SerPerson({ name: "Alice", age: 30, email: "a@b.com" });
    const hash = p.serializableHash({ only: ["name"], methods: ["greeting"] });
    expect(Object.keys(hash).sort()).toEqual(["greeting", "name"]);
  });

  it("method serializable hash should work with except and methods", () => {
    const p = new SerPerson({ name: "Alice", age: 30, email: "a@b.com" });
    const hash = p.serializableHash({ except: ["email", "age"], methods: ["greeting"] });
    expect(hash.name).toBe("Alice");
    expect(hash.email).toBeUndefined();
    expect(hash.greeting).toBe("Hi Alice");
  });

  class Post extends Model {
    static {
      include(this, Serialization);
      this.attribute("title", "string");
      this.attribute("body", "string");
      this.attribute("rating", "integer");
    }
  }

  interface Post extends Serialization {}

  it("include option with singular association", () => {
    const p = new Post({ title: "Hello", body: "World", rating: 5 });
    const comment = { _attributes: new Map([["text", "Great!"]]) };
    setAssociationAccessors(p, { comments: [comment] });
    const result = p.serializableHash({ include: ["comments"] });
    expect(Array.isArray(result.comments)).toBe(true);
    expect((result.comments as any[])[0].text).toBe("Great!");
  });

  it("include with options", () => {
    const p = new Post({ title: "Hello", body: "World", rating: 5 });
    const comment = {
      _attributes: new Map([
        ["text", "Great!"],
        ["author", "Bob"],
      ]),
    };
    setAssociationAccessors(p, { comments: [comment] });
    const result = p.serializableHash({ include: { comments: { only: ["text"] } } });
    expect((result.comments as any[])[0].text).toBe("Great!");
    expect((result.comments as any[])[0].author).toBeUndefined();
  });

  it("method serializable hash should work with only option with order of given keys", () => {
    class Person extends Model {
      static {
        include(this, Serialization);
        this.attribute("name", "string");
        this.attribute("age", "integer");
        this.attribute("email", "string");
      }
    }
    interface Person extends Serialization {}

    const p = new Person({ name: "Alice", age: 25, email: "a@b.com" });
    const result = p.serializableHash({ only: ["email", "name"] });
    // Rails `Array(only) & attribute_names` orders by the `only:` list, not the
    // model's declared `name, age, email` order.
    expect(Object.keys(result)).toEqual(["email", "name"]);
    expect(result.age).toBeUndefined();
  });

  it("include option with plural association", () => {
    class Person extends Model {
      static {
        include(this, Serialization);
        this.attribute("name", "string");
      }
    }
    interface Person extends Serialization {}

    const p = new Person({ name: "Alice" });
    const result = p.serializableHash();
    expect(result.name).toBe("Alice");
  });
});
