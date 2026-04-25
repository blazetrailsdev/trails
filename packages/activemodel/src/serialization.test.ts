import { describe, it, expect } from "vitest";
import { Model } from "./index.js";

describe("SerializationTest", () => {
  it("should use read attribute for serialization", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.attribute("age", "integer");
      }
    }
    const p = new Person({ name: "Alice", age: 25 });
    const hash = p.serializableHash();
    expect(hash["name"]).toBe("Alice");
    expect(hash["age"]).toBe(25);
  });

  it("include option with empty association", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const p = new Person({ name: "Alice" });
    const hash = p.serializableHash({ include: "posts" });
    // No association loaded, so posts won't appear
    expect(hash["name"]).toBe("Alice");
  });

  it("include option with ary", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const p = new Person({ name: "Alice" });
    const hash = p.serializableHash({ include: ["posts", "comments"] });
    expect(hash["name"]).toBe("Alice");
  });

  it("only include", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.attribute("age", "integer");
      }
    }
    const p = new Person({ name: "Alice", age: 25 });
    const hash = p.serializableHash({ only: ["name"] });
    expect(hash["name"]).toBe("Alice");
    expect(hash["age"]).toBeUndefined();
  });

  it("except include", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.attribute("age", "integer");
      }
    }
    const p = new Person({ name: "Alice", age: 25 });
    const hash = p.serializableHash({ except: ["age"] });
    expect(hash["name"]).toBe("Alice");
    expect(hash["age"]).toBeUndefined();
  });

  it("should raise NoMethodError for non existing method", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const p = new Person({ name: "test" });
    expect(() => p.serializableHash({ methods: ["nonexistent"] })).toThrow(
      /undefined method 'nonexistent'/,
    );
  });

  it("multiple includes", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const p = new Person({ name: "test" });
    const hash = p.serializableHash();
    expect(hash).toHaveProperty("name", "test");
  });

  it("nested include", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const p = new Person({ name: "test" });
    const hash = p.serializableHash();
    expect(hash).toHaveProperty("name", "test");
  });

  it("multiple includes with options", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.attribute("age", "integer");
      }
    }
    const p = new Person({ name: "test", age: 25 });
    const hash = p.serializableHash({ only: ["name"] });
    expect(hash).toHaveProperty("name", "test");
    expect(hash).not.toHaveProperty("age");
  });

  it("all includes with options", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.attribute("age", "integer");
      }
    }
    const p = new Person({ name: "test", age: 25 });
    const hash = p.serializableHash();
    expect(hash).toHaveProperty("name", "test");
    expect(hash).toHaveProperty("age", 25);
  });

  class SerPerson extends Model {
    static {
      this.attribute("name", "string");
      this.attribute("age", "integer");
      this.attribute("email", "string");
    }
    get greeting(): string {
      return `Hi ${this.readAttribute("name")}`;
    }
  }

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
      this.attribute("title", "string");
      this.attribute("body", "string");
      this.attribute("rating", "integer");
    }
  }

  it("include option with singular association", () => {
    const p = new Post({ title: "Hello", body: "World", rating: 5 });
    const comment = { _attributes: new Map([["text", "Great!"]]) };
    (p as any)._preloadedAssociations = new Map([["comments", [comment]]]);
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
    (p as any)._preloadedAssociations = new Map([["comments", [comment]]]);
    const result = p.serializableHash({ include: { comments: { only: ["text"] } } });
    expect((result.comments as any[])[0].text).toBe("Great!");
    expect((result.comments as any[])[0].author).toBeUndefined();
  });

  it("method serializable hash should work with only option with order of given keys", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.attribute("age", "integer");
        this.attribute("email", "string");
      }
    }
    const p = new Person({ name: "Alice", age: 25, email: "a@b.com" });
    const result = p.serializableHash({ only: ["email", "name"] });
    const keys = Object.keys(result);
    expect(keys).toContain("email");
    expect(keys).toContain("name");
    expect(result.age).toBeUndefined();
  });

  it("include option with plural association", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const p = new Person({ name: "Alice" });
    const result = p.serializableHash();
    expect(result.name).toBe("Alice");
  });

  describe("asJson type coercion (Rails ActiveSupport::JSON parity)", () => {
    // Rails' JSON encoder routes every value through `as_json` — BigDecimal
    // → string, Time/Date → ISO8601, Symbol → string. Our helper ports
    // the subset that actually occurs in JS: BigInt → string, Date →
    // ISO8601 (so the hash form already contains strings, not Date
    // objects), and recursive coercion within arrays/objects.
    it("asJson coerces bigint attributes to string (JSON.stringify-safe)", () => {
      class Row extends Model {
        static {
          this.attribute("id", "big_integer");
          this.attribute("name", "string");
        }
      }
      const r = new Row({ id: "99999999999999999999", name: "row-1" });
      const json = r.asJson();
      // bigint attributes are coerced to decimal strings by coerceForJson.
      expect(json["id"]).toBe("99999999999999999999");
      expect(json["name"]).toBe("row-1");
      // JSON.stringify now round-trips without throwing.
      expect(() => JSON.stringify(json)).not.toThrow();
    });

    it("asJson coerces Date attributes to ISO 8601 strings", () => {
      class Event extends Model {
        static {
          this.attribute("startsAt", "datetime");
        }
      }
      const e = new Event({ startsAt: new Date("2026-04-24T10:00:00Z") });
      const json = e.asJson();
      expect(json["startsAt"]).toBe("2026-04-24T10:00:00.000Z");
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
      (b as unknown as { _cachedAssociations: Map<string, unknown> })._cachedAssociations = new Map(
        [
          [
            "posts",
            [
              new Post({ id: "1000000000000", title: "p1" }),
              new Post({ id: "2000000000000", title: "p2" }),
            ],
          ],
        ],
      );
      const json = b.asJson({ include: "posts" });
      expect(Array.isArray(json.posts)).toBe(true);
      // Each post's BigInt id is coerced to a string.
      expect((json.posts as Array<{ id: string }>)[0].id).toBe("1000000000000");
      expect(() => JSON.stringify(json)).not.toThrow();
    });

    it("attribute named toJSON does not shadow Model#toJSON", () => {
      // `attribute("toJSON", ...)` must NOT install an accessor on the
      // subclass prototype if `toJSON` is already resolvable up the
      // chain — otherwise JSON.stringify would hit the attribute
      // getter instead of our asJson-backed hook.
      class Weird extends Model {
        static {
          this.attribute("toJSON", "string");
          this.attribute("name", "string");
        }
      }
      const w = new Weird({ toJSON: "raw-value", name: "w" });
      // Direct stringify still routes through Model's toJSON.
      expect(JSON.parse(JSON.stringify(w))).toEqual({ toJSON: "raw-value", name: "w" });
      // The attribute still roundtrips via `readAttribute`, just not via
      // `instance.toJSON` (which now stays a framework method).
      expect(w.readAttribute("toJSON")).toBe("raw-value");
    });

    it("JSON.stringify(model) delegates to asJson via toJSON()", () => {
      // Direct `JSON.stringify(model)` should match `model.toJson()` —
      // without the hook, the default walker would enumerate
      // `_attributes`/`_dirty`/`errors`/etc. and potentially throw on
      // BigInt state.
      class Row extends Model {
        static {
          this.attribute("id", "big_integer");
          this.attribute("name", "string");
        }
      }
      const r = new Row({ id: "42", name: "row-1" });
      expect(JSON.stringify(r)).toBe(r.toJson());
      const parsed = JSON.parse(JSON.stringify(r));
      expect(parsed).toEqual({ id: "42", name: "row-1" });
    });

    it("JSON.stringify(model) with large bigint id above Number.MAX_SAFE_INTEGER", () => {
      class Row extends Model {
        static {
          this.attribute("id", "big_integer");
          this.attribute("name", "string");
        }
      }
      // 2^62 — cannot be represented as a JS number without precision loss.
      const big = 2n ** 62n;
      const r = new Row({ id: big, name: "row-2" });
      expect(() => JSON.stringify(r)).not.toThrow();
      const parsed = JSON.parse(JSON.stringify(r));
      // bigint is coerced to decimal string (not number — JS number loses
      // precision above 2^53-1). Consumers must parse with BigInt(str).
      expect(typeof parsed.id).toBe("string");
      expect(parsed.id).toBe("4611686018427387904");
      expect(parsed.name).toBe("row-2");
    });

    it("coerceForJson maps invalid Date to null (matches Date.prototype.toJSON)", async () => {
      // Date.prototype.toJSON returns null for invalid dates; toISOString
      // throws. asJson must stay JSON-safe even for garbage input.
      const { coerceForJson } = await import("./serialization.js");
      const out = coerceForJson({ at: new Date("not a date") }) as { at: unknown };
      expect(out.at).toBe(null);
    });

    it("coerceForJson preserves shared references (no silent data loss)", async () => {
      // `{ a: obj, b: obj }` — same object twice. Must not be treated
      // as a cycle. Previously the WeakSet-based cycle guard would
      // return null on the second occurrence; the in-progress/seen
      // split now returns the memoized coerced result and preserves
      // identity in the output.
      const { coerceForJson } = await import("./serialization.js");
      const shared = { kind: "tag", count: 5 };
      const root = { a: shared, b: shared };
      const out = coerceForJson(root) as { a: unknown; b: unknown };
      expect(out.a).toEqual({ kind: "tag", count: 5 });
      expect(out.b).toEqual({ kind: "tag", count: 5 });
      expect(out.a).toBe(out.b); // same coerced reference
    });

    it("coerceForJson breaks true cycles (self-referential object → null)", async () => {
      const { coerceForJson } = await import("./serialization.js");
      const a: Record<string, unknown> = { name: "a" };
      a.self = a; // cycle
      const out = coerceForJson(a) as { name: string; self: unknown };
      expect(out.name).toBe("a");
      // Inner self-reference collapses to null so the result stays
      // JSON.stringify-safe.
      expect(out.self).toBe(null);
      expect(() => JSON.stringify(out)).not.toThrow();
    });

    it("asJson terminates on model-through-model cycles (no stack overflow)", () => {
      // A cycle modelA.ref → modelB → modelA would blow the stack if
      // coerceForJson delegated to each Model's own asJson (each call
      // resetting cycle state). Nested models arrive pre-flattened by
      // serializableHash, so coerceForJson walks plain objects with
      // shared cycle state.
      class Node extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const a = new Node({ name: "a" });
      const b = new Node({ name: "b" });
      (a as unknown as { _cachedAssociations: Map<string, unknown> })._cachedAssociations = new Map(
        [["next", b]],
      );
      (b as unknown as { _cachedAssociations: Map<string, unknown> })._cachedAssociations = new Map(
        [["next", a]],
      );
      // serializableHash only traverses associations that are
      // explicitly included. Here we include "next" on `a`, so that
      // association is serialized once; it won't keep traversing
      // `b.next` unless a nested include is provided. So asJson emits
      // a single hop and doesn't loop.
      expect(() => a.asJson({ include: ["next"] })).not.toThrow();
      const json = a.asJson({ include: ["next"] }) as { next: { name: string } };
      expect(json.next.name).toBe("b");
    });

    it("coerceForJson breaks true cycles in arrays (self-containing)", async () => {
      const { coerceForJson } = await import("./serialization.js");
      const arr: unknown[] = [1, 2];
      arr.push(arr); // cycle
      const out = coerceForJson(arr) as unknown[];
      expect(out[0]).toBe(1);
      expect(out[1]).toBe(2);
      expect(out[2]).toBe(null);
      expect(() => JSON.stringify(out)).not.toThrow();
    });

    it("coerceForJson is safe against __proto__ prototype pollution", async () => {
      // JSON.parse('{"__proto__": {"polluted": true}}') produces an own
      // `__proto__` key. Naïve `out[k] = val` assignment would invoke
      // `Object.prototype.__proto__`'s setter and mutate the output's
      // prototype. `Object.defineProperty` treats it as a data key.
      const { coerceForJson } = await import("./serialization.js");
      const hostile = JSON.parse('{"__proto__": {"polluted": true}, "legit": 1}');
      const out = coerceForJson(hostile) as Record<string, unknown>;
      // Output's prototype should NOT be polluted.
      expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
      // Plain Object should still return polluted=undefined (sanity).
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
      expect(out.legit).toBe(1);
    });

    it("coerceForJson maps undefined to null (matches Ruby nil → JSON null)", async () => {
      // `JSON.stringify({ a: undefined })` silently drops the key,
      // which would make an unset attribute disappear from output.
      // Ruby `nil` serializes to JSON `null`, so we match that.
      const { coerceForJson } = await import("./serialization.js");
      const out = coerceForJson({ name: "x", missing: undefined, nested: [undefined, 1] }) as {
        name: unknown;
        missing: unknown;
        nested: unknown[];
      };
      expect(out.missing).toBe(null);
      expect(out.nested).toEqual([null, 1]);
      expect(JSON.parse(JSON.stringify(out))).toEqual({
        name: "x",
        missing: null,
        nested: [null, 1],
      });
    });

    it("coerceForJson does not shell open class instances (no internal-field leak)", async () => {
      // A raw Model instance reaching coerceForJson (e.g. as a direct
      // attribute value) must NOT be walked via Object.entries — that
      // would expose _attributes/_dirty/errors/etc. Instead, it passes
      // through as the instance itself, and JSON.stringify will later
      // invoke its toJSON() (which calls asJson with its own
      // coerceForJson context).
      const { coerceForJson } = await import("./serialization.js");
      class Wrapper {
        public internal = "hidden";
        toJSON() {
          return { kind: "wrapper" };
        }
      }
      const w = new Wrapper();
      const out = coerceForJson({ nested: w }) as { nested: unknown };
      // Pass-through — still the class instance, not `{ internal: "..." }`.
      expect(out.nested).toBe(w);
      // JSON.stringify at the end invokes toJSON on the instance.
      expect(JSON.parse(JSON.stringify(out))).toEqual({ nested: { kind: "wrapper" } });
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
      return String(this.readAttribute("title")).slice(0, 10);
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
    const parsed = JSON.parse(p.toJson());
    expect(parsed.title).toBe("Hello");
    expect(parsed.rating).toBe(5);
  });

  it("include as string for single association", () => {
    const p = new Post({ title: "Hello", body: "World", rating: 5 });
    const author = { _attributes: new Map([["name", "Alice"]]) };
    (p as any)._preloadedAssociations = new Map([["author", author]]);
    const result = p.serializableHash({ include: "author" });
    expect((result.author as any).name).toBe("Alice");
  });
});

// =========================================================================
// Types — Date, DateTime, Decimal
// =========================================================================
