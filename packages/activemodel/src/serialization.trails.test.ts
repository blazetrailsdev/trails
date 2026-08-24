import { describe, it, expect } from "vitest";
import { Model } from "./index.js";
import { readAttributeForSerialization, type SerializationRecord } from "./serialization.js";
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

// TS-only coverage that has no counterpart in
// vendor/rails/activemodel/test/cases/serialization_test.rb. It lives here so
// serialization.test.ts holds Rails test names only and a renamed or split
// Rails test stays visible in review.
describe("Serialization (trails)", () => {
  // Duplicated from serialization.test.ts, where it sits beside the Rails
  // tests that also use it.
  class Post extends Model {
    static {
      this.attribute("title", "string");
      this.attribute("body", "string");
      this.attribute("rating", "integer");
    }
  }

  it("read_attribute_for_serialization dispatches the accessor, not a stale attributes hash", () => {
    // Rails default `alias :read_attribute_for_serialization :send`: a host
    // whose `attributes` only names keys while values live in accessors must
    // serialize the accessor value, not re-read the hash.
    const host = {
      attributes: { name: "STALE" },
      get name(): string {
        return "FRESH";
      },
      constructor: { name: "Host" },
    } as unknown as SerializationRecord;
    expect(readAttributeForSerialization(host, "name")).toBe("FRESH");
  });

  it("read_attribute_for_serialization honors an overridden attribute reader (send)", () => {
    // Rails `send(:name)` calls the reader, so a model overriding a declared
    // attribute's getter serializes the override, not the raw store value.
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
      get name(): string {
        return "OVERRIDE:" + (this._readAttribute("name") as string);
      }
    }
    const p = new Person({ name: "Bob" });
    expect(p.serializableHash()).toEqual({ name: "OVERRIDE:Bob" });
  });

  it("read_attribute_for_serialization invokes a method reader (send), not the attributes hash", () => {
    // Rails' `send(:name)` calls the `name` method; a plain host with a method
    // reader must serialize its return, not a stale `attributes[:name]`.
    const host = {
      attributes: { name: "STALE" },
      name(): string {
        return "i_am_name";
      },
      constructor: { name: "Host" },
    } as unknown as SerializationRecord;
    expect(readAttributeForSerialization(host, "name")).toBe("i_am_name");
  });

  it("read_attribute_for_serialization returns undefined for a present reader that returns undefined", () => {
    // Ruby `send` keys off method existence, not return value: a reader that
    // exists and returns nil yields nil, it does not raise.
    const host = {
      get name(): string | undefined {
        return undefined;
      },
      constructor: { name: "Host" },
    } as unknown as SerializationRecord;
    expect(readAttributeForSerialization(host, "name")).toBeUndefined();
  });

  it("read_attribute_for_serialization raises NoMethodError-style for a missing reader", () => {
    // Ruby `send(:nope)` raises NoMethodError; a name with no reader and no
    // store/hash entry fails loud rather than silently serializing undefined.
    const host = {
      attributes: { name: "x" },
      constructor: { name: "Host" },
    } as unknown as SerializationRecord;
    expect(() => readAttributeForSerialization(host, "nope")).toThrow(NoMethodError);
    expect(() => readAttributeForSerialization(host, "nope")).toThrow(/undefined method 'nope'/);
  });

  it("read_attribute_for_serialization raises NoMethodError-style for a reader-less attributes key", () => {
    // Rails `alias :… :send` has no `attributes`-hash fallback: a storeless host
    // that names a key in `attributes` but exposes no reader for it fails loud
    // like `send(:name)`, not silently serialize the hash value.
    const host = {
      attributes: { name: "x" },
      constructor: { name: "Host" },
    } as unknown as SerializationRecord;
    expect(() => readAttributeForSerialization(host, "name")).toThrow(NoMethodError);
    expect(() => readAttributeForSerialization(host, "name")).toThrow(/undefined method 'name'/);
  });

  it("read_attribute_for_serialization invokes a method reader on an _attributes-backed record", () => {
    // Rails `send(:greeting)` calls the method even on a record with an attribute
    // store; a genuine method (not a declared attribute) is invoked, not read
    // from the store.
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
      greeting(): string {
        return "Hi " + (this._readAttribute("name") as string);
      }
    }
    const p = new Person({ name: "Bob" });
    expect(readAttributeForSerialization(p as unknown as SerializationRecord, "greeting")).toBe(
      "Hi Bob",
    );
  });

  it("a caller option named __sync does not hijack the internal sync re-entry", () => {
    // The synchronous re-entry flag is a separate function parameter, not an
    // option. A caller passing a castable option literally named `__sync` cannot
    // reach it: the include-bearing call still returns the awaitable thenable
    // (Rails' lazy `to_ary` contract) rather than building eagerly.
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const p = new Person({ name: "Alice" });
    setAssociationAccessors(p, { posts: [] });
    const hash = p.serializableHash({ include: "posts", __sync: true } as never);
    expect(typeof (hash as unknown as PromiseLike<unknown>).then).toBe("function");
    expect(hash["posts"]).toEqual([]);
  });

  it("only include with scalar coerces via Array() like an array", () => {
    // Rails `Array(only).map(&:to_s)`: `only: "name"` equals `only: ["name"]`
    // (serialization.rb:130). trails must not substring-match a scalar string.
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.attribute("age", "integer");
      }
    }
    const p = new Person({ name: "Alice", age: 25 });
    const hash = p.serializableHash({ only: "name" });
    expect(hash["name"]).toBe("Alice");
    expect(hash["age"]).toBeUndefined();
  });

  it("except include with scalar coerces via Array() like an array", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.attribute("age", "integer");
      }
    }
    const p = new Person({ name: "Alice", age: 25 });
    const hash = p.serializableHash({ except: "age" });
    expect(hash["name"]).toBe("Alice");
    expect(hash["age"]).toBeUndefined();
  });

  it("asJson accepts a scalar only like the array form", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.attribute("age", "integer");
      }
    }
    const p = new Person({ name: "Alice", age: 25 });
    expect(p.asJson({ only: "name" })).toEqual(p.asJson({ only: ["name"] }));
  });

  it("include accepts mixed array of strings and option hashes", () => {
    const p = new Post({ title: "Hello", body: "World", rating: 5 });
    const comment = {
      _attributes: new Map([
        ["text", "Great!"],
        ["author", "Bob"],
      ]),
    };
    const tag = { _attributes: new Map([["name", "rails"]]) };
    setAssociationAccessors(p, { comments: [comment], tags: [tag] });
    const result = p.serializableHash({
      include: ["tags", { comments: { only: ["text"] } }],
    });
    expect((result.tags as any[])[0].name).toBe("rails");
    expect((result.comments as any[])[0].text).toBe("Great!");
    expect((result.comments as any[])[0].author).toBeUndefined();
  });

  it("awaited nested include preloads through an attributes-less PORO", async () => {
    // A singular `include` whose reader returns a plain PORO (no `_attributes`)
    // that itself carries a nested, unloaded `include`. The `await` path must
    // recurse through the PORO and lazy-load its nested collection (Rails'
    // `to_ary`), even though the sync pass emits the PORO raw.
    const comment = { _attributes: new Map([["text", "Nice"]]) };
    const comments = {
      loaded: false,
      load(): Promise<void> {
        this.loaded = true;
        return Promise.resolve();
      },
      [Symbol.iterator](): Iterator<unknown> {
        return [comment][Symbol.iterator]();
      },
    };
    const author = { name: "Bob", comments };
    const p = new Post({ title: "Hello", body: "World", rating: 5 });
    setAssociationAccessors(p, { author });

    expect(comments.loaded).toBe(false);
    const result = await p.serializableHash({
      include: { author: { include: "comments" } },
    });
    expect(comments.loaded).toBe(true);
    expect((result.author as { name: string }).name).toBe("Bob");
  });

  describe("asJson type coercion (Rails ActiveSupport::JSON parity)", () => {
    // Rails' JSON encoder routes every value through `as_json` — BigDecimal
    // → string, Time/Date → ISO8601, Symbol → string. Our helper ports
    // the subset that actually occurs in JS: BigInt → string, Date →
    // ISO8601 (so the hash form already contains strings, not Date
    // objects), and recursive coercion within arrays/objects.

    it("asJson coerces Temporal attributes to ISO 8601 strings", () => {
      class Event extends Model {
        static {
          this.attribute("startsAt", "datetime");
        }
      }
      const e = new Event({ startsAt: "2026-04-24T10:00:00.123456Z" });
      const json = e.asJson();
      // `Time#as_json` renders at `ActiveSupport::JSON::Encoding.time_precision`
      // (json.rb:200-208), which defaults to 3 (encoding.rb:135).
      expect(json["startsAt"]).toBe("2026-04-24T10:00:00.123Z");
    });

    it("asJson recurses into include: arrays and nested objects", () => {
      class Post extends Model {
        static {
          this.attribute("id", "big_integer");
          this.attribute("title", "string");
        }
      }
      class Blog extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const b = new Blog({ name: "b" });
      setAssociationAccessors(b, {
        posts: [
          new Post({ id: "10000000000000000000", title: "p1" }),
          new Post({ id: "20000000000000000000", title: "p2" }),
        ],
      });
      const json = b.asJson({ include: "posts" });
      expect(Array.isArray(json.posts)).toBe(true);
      expect((json.posts as Array<{ id: string }>)[0].id).toBe("10000000000000000000");
      expect(() => JSON.stringify(json)).not.toThrow();
    });

    it("attribute named toJSON does not shadow Model#toJSON", () => {
      class Weird extends Model {
        static {
          this.attribute("toJSON", "string");
          this.attribute("name", "string");
        }
      }
      const w = new Weird({ toJSON: "raw-value", name: "w" });
      expect(JSON.parse(JSON.stringify(w))).toEqual({ toJSON: "raw-value", name: "w" });
      expect(w._readAttribute("toJSON")).toBe("raw-value");
    });

    it("JSON.stringify(model) delegates to asJson via toJSON()", () => {
      class Row extends Model {
        static {
          this.attribute("id", "big_integer");
          this.attribute("name", "string");
        }
      }
      const r = new Row({ id: "42", name: "row-1" });
      expect(JSON.stringify(r)).toBe(r.toJSON());
      const parsed = JSON.parse(JSON.stringify(r));
      expect(parsed).toEqual({ id: 42, name: "row-1" });
    });

    it("JSON.stringify(model) with large bigint id above Number.MAX_SAFE_INTEGER", () => {
      class Row extends Model {
        static {
          this.attribute("id", "big_integer");
          this.attribute("name", "string");
        }
      }
      const big = 2n ** 62n;
      const r = new Row({ id: big, name: "row-2" });
      expect(() => JSON.stringify(r)).not.toThrow();
      const parsed = JSON.parse(JSON.stringify(r));
      expect(typeof parsed.id).toBe("string");
      expect(parsed.id).toBe("4611686018427387904");
      expect(parsed.name).toBe("row-2");
    });

    it("asJson is idempotent on JSON-safe values", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("age", "integer");
        }
      }
      const p = new Person({ name: "Alice", age: 30 });
      expect(p.asJson()).toEqual({ name: "Alice", age: 30 });
    });
  });
});

describe("Serialization", () => {
  class Post extends Model {
    static {
      this.attribute("title", "string");
      this.attribute("body", "string");
      this.attribute("rating", "integer");
    }

    get summary(): string {
      return String(this._readAttribute("title")).slice(0, 10);
    }
  }

  it("method serializable hash should work", () => {
    const p = new Post({ title: "Hello", body: "World", rating: 5 });
    expect(p.serializableHash()).toEqual({
      title: "Hello",
      body: "World",
      rating: 5,
    });
  });

  it("method serializable hash should work with only option", () => {
    const p = new Post({ title: "Hello", body: "World", rating: 5 });
    expect(p.serializableHash({ only: ["title"] })).toEqual({
      title: "Hello",
    });
  });

  it("method serializable hash should work with except option", () => {
    const p = new Post({ title: "Hello", body: "World", rating: 5 });
    expect(p.serializableHash({ except: ["body"] })).toEqual({
      title: "Hello",
      rating: 5,
    });
  });

  it("method serializable hash should work with methods option", () => {
    const p = new Post({ title: "Hello World!", body: "c", rating: 3 });
    const result = p.serializableHash({ methods: ["summary"] });
    expect(result.summary).toBe("Hello Worl");
  });

  it("method serializable hash should work with only and methods", () => {
    const p = new Post({ title: "Test", body: "c", rating: 3 });
    const result = p.serializableHash({
      only: ["title"],
      methods: ["summary"],
    });
    expect(Object.keys(result).sort()).toEqual(["summary", "title"]);
  });

  it("asJson returns same as serializableHash", () => {
    const p = new Post({ title: "Hello", body: "World", rating: 5 });
    expect(p.asJson()).toEqual(p.serializableHash());
  });

  it("toJson returns valid JSON string", () => {
    const p = new Post({ title: "Hello", body: "World", rating: 5 });
    const parsed = JSON.parse(p.toJSON());
    expect(parsed.title).toBe("Hello");
    expect(parsed.rating).toBe(5);
  });

  it("include as string for single association", () => {
    const p = new Post({ title: "Hello", body: "World", rating: 5 });
    const author = { _attributes: new Map([["name", "Alice"]]) };
    setAssociationAccessors(p, { author });
    const result = p.serializableHash({ include: "author" });
    expect((result.author as any).name).toBe("Alice");
  });
});

describe("fromJson", () => {
  it("from_json should work without a root (class attribute)", () => {
    class User extends Model {
      static {
        this.attribute("name", "string");
        this.attribute("age", "integer");
      }
    }
    const u = new User({});
    u.fromJson('{"name":"Alice","age":30}');
    expect(u._readAttribute("name")).toBe("Alice");
    expect(u._readAttribute("age")).toBe(30);
  });

  it("returns this for chaining", () => {
    class User extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const u = new User({});
    const result = u.fromJson('{"name":"Bob"}');
    expect(result).toBe(u);
  });

  it("from_json should work with a root (method parameter)", () => {
    class User extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const u = new User({});
    u.fromJson('{"user":{"name":"Charlie"}}', true);
    expect(u._readAttribute("name")).toBe("Charlie");
  });

  it("marks attributes as changed via dirty tracking", () => {
    class User extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const u = new User({ name: "Original" });
    u.changesApplied();
    u.fromJson('{"name":"Updated"}');
    expect(u.isChanged).toBe(true);
    expect(u.changed).toContain("name");
  });
});
