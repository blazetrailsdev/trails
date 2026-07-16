import { describe, it, expect } from "vitest";
import { Model } from "../index.js";

describe("LengthValidationTest", () => {
  it("optionally validates length of using within", async () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { length: { in: [3, 10] } });
      }
    }
    const p = new Person({ name: "ab" });
    expect(await p.isValid()).toBe(false);
    const p2 = new Person({ name: "abc" });
    expect(await p2.isValid()).toBe(true);
  });

  it("optionally validates length of using is", async () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { length: { is: 5 } });
      }
    }
    expect(await new Person({ name: "alice" }).isValid()).toBe(true);
    expect(await new Person({ name: "bob" }).isValid()).toBe(false);
  });

  it("validates length of using minimum utf8", async () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { length: { minimum: 3 } });
      }
    }
    const p = new Person({ name: "\u{1F600}\u{1F600}\u{1F600}" });
    // Emoji are 2 code units each in JS, so length >= 3
    expect(await p.isValid()).toBe(true);
  });

  it("validates length of using maximum utf8", async () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { length: { maximum: 5 } });
      }
    }
    const p = new Person({ name: "ab" });
    expect(await p.isValid()).toBe(true);
  });

  it("validates length of using within utf8", async () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { length: { in: [1, 5] } });
      }
    }
    expect(await new Person({ name: "abc" }).isValid()).toBe(true);
  });

  it("validates length of for infinite maxima", async () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { length: { minimum: 1, maximum: Infinity } });
      }
    }
    expect(await new Person({ name: "a" }).isValid()).toBe(true);
    expect(await new Person({ name: "a".repeat(1000) }).isValid()).toBe(true);
  });

  it("validates length of using maximum should not allow nil when nil not allowed", async () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { presence: true, length: { maximum: 5 } });
      }
    }
    const p = new Person();
    expect(await p.isValid()).toBe(false);
  });

  it("validates length of using both minimum and maximum should not allow nil", async () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { presence: true, length: { minimum: 1, maximum: 5 } });
      }
    }
    const p = new Person();
    expect(await p.isValid()).toBe(false);
  });

  it("validates length of using proc as maximum with model method", async () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { length: { maximum: () => 5 } });
      }
    }
    expect(await new Person({ name: "alice" }).isValid()).toBe(true);
    expect(await new Person({ name: "aliceb" }).isValid()).toBe(false);
  });

  it("validates length of using lambda as maximum", async () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { length: { maximum: () => 10 } });
      }
    }
    expect(await new Person({ name: "short" }).isValid()).toBe(true);
    expect(await new Person({ name: "a".repeat(11) }).isValid()).toBe(false);
  });

  it("validates length of using bignum", async () => {
    class Person extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { length: { maximum: 1000000 } });
      }
    }
    const p = new Person({ title: "short" });
    expect(await p.isValid()).toBe(true);
  });

  it("validates length of nasty params", async () => {
    class Person extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { length: { minimum: 1 } });
      }
    }
    const p = new Person({ title: "" });
    await p.isValid();
    expect(p.errors.count).toBeGreaterThan(0);
  });

  it("optionally validates length of using within utf8", async () => {
    class Person extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { length: { in: [3, 5] } });
      }
    }
    const p = new Person({ title: "abc" });
    expect(await p.isValid()).toBe(true);
  });

  it("validates length of using is utf8", async () => {
    class Person extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { length: { is: 5 } });
      }
    }
    const p = new Person({ title: "abcde" });
    expect(await p.isValid()).toBe(true);
  });

  it("validates length of for ruby class", async () => {
    class Person extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { length: { minimum: 2 } });
      }
    }
    const p = new Person({ title: "ok" });
    expect(await p.isValid()).toBe(true);
  });

  it("validates length of using maximum should not allow nil and empty string when blank not allowed", async () => {
    class Person extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { presence: true, length: { maximum: 5 } });
      }
    }
    const p = new Person({ title: "" });
    await p.isValid();
    expect(p.errors.count).toBeGreaterThan(0);
  });

  it("validates length of using minimum 0 should not allow nil", async () => {
    class Person extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { presence: true, length: { minimum: 0 } });
      }
    }
    const p = new Person({});
    await p.isValid();
    expect(p.errors.count).toBeGreaterThan(0);
  });

  it("validates length of using is 0 should not allow nil", async () => {
    class Person extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { length: { is: 0 } });
      }
    }
    const p = new Person({});
    // null is skipped by length validator
    expect(await p.isValid()).toBe(true);
  });

  it("validates with diff in option", async () => {
    class Person extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { length: { minimum: 2, maximum: 10 } });
      }
    }
    const p = new Person({ title: "ok" });
    expect(await p.isValid()).toBe(true);
  });

  it("validates length of using symbol as maximum", async () => {
    class Person extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { length: { maximum: 10 } });
      }
    }
    const p = new Person({ title: "short" });
    expect(await p.isValid()).toBe(true);
  });

  it("validates length of using minimum", async () => {
    class Person extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { length: { minimum: 5 } });
      }
    }
    expect(await new Person({ title: "abcde" }).isValid()).toBe(true);
    expect(await new Person({ title: "abcd" }).isValid()).toBe(false);
  });

  it("validates length of using maximum", async () => {
    class Person extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { length: { maximum: 5 } });
      }
    }
    expect(await new Person({ title: "abcde" }).isValid()).toBe(true);
    expect(await new Person({ title: "abcdef" }).isValid()).toBe(false);
  });

  it("validates length of using maximum should allow nil", async () => {
    class Person extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { length: { maximum: 5 } });
      }
    }
    expect(await new Person({}).isValid()).toBe(true);
  });

  it("validates length of using within", async () => {
    class Person extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { length: { in: [3, 5] } });
      }
    }
    expect(await new Person({ title: "ab" }).isValid()).toBe(false);
    expect(await new Person({ title: "abc" }).isValid()).toBe(true);
    expect(await new Person({ title: "abcde" }).isValid()).toBe(true);
    expect(await new Person({ title: "abcdef" }).isValid()).toBe(false);
  });

  it("validates length of using is", async () => {
    class Person extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { length: { is: 4 } });
      }
    }
    expect(await new Person({ title: "abcd" }).isValid()).toBe(true);
    expect(await new Person({ title: "abc" }).isValid()).toBe(false);
    expect(await new Person({ title: "abcde" }).isValid()).toBe(false);
  });

  it("validates length of custom errors for minimum with too short", async () => {
    class Person extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { length: { minimum: 5, tooShort: "is way too short" } });
      }
    }
    const p = new Person({ title: "ab" });
    await p.isValid();
    expect(p.errors.get("title")).toContain("is way too short");
  });

  it("validates length of custom errors for maximum with too long", async () => {
    class Person extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { length: { maximum: 5, tooLong: "is way too long" } });
      }
    }
    const p = new Person({ title: "abcdefgh" });
    await p.isValid();
    expect(p.errors.get("title")).toContain("is way too long");
  });

  it("validates length of custom errors for both too short and too long", async () => {
    class Person extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", {
          length: { minimum: 3, maximum: 5, tooShort: "short!", tooLong: "long!" },
        });
      }
    }
    const short = new Person({ title: "ab" });
    await short.isValid();
    expect(short.errors.get("title")).toContain("short!");

    const long = new Person({ title: "abcdef" });
    await long.isValid();
    expect(long.errors.get("title")).toContain("long!");
  });

  it("validates length of custom errors for is with wrong length", async () => {
    class Person extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { length: { is: 4, wrongLength: "wrong size!" } });
      }
    }
    const p = new Person({ title: "abc" });
    await p.isValid();
    expect(p.errors.get("title")).toContain("wrong size!");
  });

  it("validates length of using proc as maximum", async () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { length: { maximum: () => 5 } });
      }
    }
    const p = new Person({ name: "Alice" });
    expect(await p.isValid()).toBe(true);
    const p2 = new Person({ name: "Alicia" });
    expect(await p2.isValid()).toBe(false);
  });

  it("validates length of with allow nil", async () => {
    class Topic extends Model {
      static {
        this.attribute("title", "string");
        this.validatesLengthOf("title", { is: 5, allowNil: true });
      }
    }
    expect(await new Topic({ title: "ab" }).isValid()).toBe(false);
    expect(await new Topic({ title: "" }).isValid()).toBe(false);
    expect(await new Topic({ title: null }).isValid()).toBe(true);
    expect(await new Topic({ title: "abcde" }).isValid()).toBe(true);
  });

  it("validates length of with allow blank", async () => {
    class Topic extends Model {
      static {
        this.attribute("title", "string");
        this.validatesLengthOf("title", { is: 5, allowBlank: true });
      }
    }
    expect(await new Topic({ title: "ab" }).isValid()).toBe(false);
    expect(await new Topic({ title: "" }).isValid()).toBe(true);
    expect(await new Topic({ title: null }).isValid()).toBe(true);
    expect(await new Topic({ title: "abcde" }).isValid()).toBe(true);
  });

  it("optionally validates length of using minimum", async () => {
    class Person extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { length: { minimum: 2 } });
      }
    }
    expect(await new Person({ title: "ab" }).isValid()).toBe(true);
    expect(await new Person({ title: "a" }).isValid()).toBe(false);
  });

  it("optionally validates length of using maximum", async () => {
    class Person extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { length: { maximum: 5 } });
      }
    }
    expect(await new Person({ title: "abcde" }).isValid()).toBe(true);
    expect(await new Person({ title: "abcdef" }).isValid()).toBe(false);
  });

  it("validates length of using within with exclusive range", async () => {
    // TS doesn't have Ruby's exclusive range syntax, but we can simulate
    // by using minimum/maximum with appropriate bounds
    class Person extends Model {
      static {
        this.attribute("title", "string");
        // Exclusive range (3...5) means 3 <= length < 5, so max is 4
        this.validates("title", { length: { minimum: 3, maximum: 4 } });
      }
    }
    expect(await new Person({ title: "abc" }).isValid()).toBe(true);
    expect(await new Person({ title: "abcd" }).isValid()).toBe(true);
    expect(await new Person({ title: "abcde" }).isValid()).toBe(false);
    expect(await new Person({ title: "ab" }).isValid()).toBe(false);
  });

  it("validates length of using within with infinite ranges", async () => {
    class Person extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { length: { minimum: 0, maximum: Infinity } });
      }
    }
    expect(await new Person({ title: "" }).isValid()).toBe(true);
    expect(await new Person({ title: "a".repeat(10000) }).isValid()).toBe(true);
  });

  it("validates length of custom errors for minimum with message", async () => {
    class Person extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { length: { minimum: 5, message: "is too short!" } });
      }
    }
    const p = new Person({ title: "ab" });
    await p.isValid();
    expect(p.errors.get("title")).toContain("is too short!");
  });

  it("validates length of custom errors for maximum with message", async () => {
    class Person extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { length: { maximum: 3, message: "is too long!" } });
      }
    }
    const p = new Person({ title: "abcde" });
    await p.isValid();
    expect(p.errors.get("title")).toContain("is too long!");
  });

  it("validates length of custom errors for in", async () => {
    class Person extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { length: { in: [3, 5], tooShort: "short!", tooLong: "long!" } });
      }
    }
    const short = new Person({ title: "ab" });
    await short.isValid();
    expect(short.errors.get("title")).toContain("short!");
    const long = new Person({ title: "abcdef" });
    await long.isValid();
    expect(long.errors.get("title")).toContain("long!");
  });

  it("validates length of custom errors for is with message", async () => {
    class Person extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { length: { is: 5, message: "wrong length!" } });
      }
    }
    const p = new Person({ title: "abc" });
    await p.isValid();
    expect(p.errors.get("title")).toContain("wrong length!");
  });

  it("validates length of for integer", async () => {
    class Person extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { length: { is: 5 } });
      }
    }
    // Length is checked as string length
    expect(await new Person({ title: "12345" }).isValid()).toBe(true);
    expect(await new Person({ title: "1234" }).isValid()).toBe(false);
  });

  it("validates length of with proc", async () => {
    // Rails length.rb:55 — `check_value = resolve_value(record, check_value)`.
    // A Proc receives the record and returns the limit per-instance.
    class Person extends Model {
      static {
        this.attribute("title", "string");
        this.attribute("limit", "integer");
        this.validates("title", {
          length: { maximum: (r: Person) => r.readAttribute("limit") as number },
        });
      }
    }
    expect(await new Person({ title: "abc", limit: 5 }).isValid()).toBe(true);
    expect(await new Person({ title: "abcdef", limit: 5 }).isValid()).toBe(false);
  });

  it("accepts :in as a range object { begin, end }", async () => {
    class Person extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { length: { in: { begin: 3, end: 10 } } });
      }
    }
    expect(await new Person({ title: "ab" }).isValid()).toBe(false);
    expect(await new Person({ title: "abc" }).isValid()).toBe(true);
    expect(await new Person({ title: "abcdefghij" }).isValid()).toBe(true);
    expect(await new Person({ title: "abcdefghijk" }).isValid()).toBe(false);
  });

  it("accepts :within as a range object { begin, end }", async () => {
    class Person extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { length: { within: { begin: 3, end: 10 } } });
      }
    }
    expect(await new Person({ title: "ab" }).isValid()).toBe(false);
    expect(await new Person({ title: "abc" }).isValid()).toBe(true);
    expect(await new Person({ title: "abcdefghij" }).isValid()).toBe(true);
    expect(await new Person({ title: "abcdefghijk" }).isValid()).toBe(false);
  });

  it("accepts :in as a range object with excludeEnd", async () => {
    class Person extends Model {
      static {
        this.attribute("title", "string");
        // { begin: 3, end: 5, excludeEnd: true } → minimum: 3, maximum: 4
        this.validates("title", { length: { in: { begin: 3, end: 5, excludeEnd: true } } });
      }
    }
    expect(await new Person({ title: "abc" }).isValid()).toBe(true);
    expect(await new Person({ title: "abcd" }).isValid()).toBe(true);
    expect(await new Person({ title: "abcde" }).isValid()).toBe(false);
  });

  it("does not leak reserved keys into errors.add options (minimum/maximum path)", async () => {
    class Person extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { length: { in: [3, 5] } });
      }
    }
    const p = new Person({ title: "ab" });
    await p.isValid();
    const err = p.errors.objects[0];
    expect(err).toBeDefined();
    expect(err.options).not.toHaveProperty("minimum");
    expect(err.options).not.toHaveProperty("maximum");
    expect(err.options).not.toHaveProperty("tooShort");
    expect(err.options).not.toHaveProperty("tooLong");
    expect(err.options).not.toHaveProperty("within");
    expect(err.options).not.toHaveProperty("is");
    expect(err.options).toHaveProperty("count");
  });

  it("does not leak reserved keys into errors.add options (is path)", async () => {
    // Rails RESERVED_OPTIONS omits :wrong_length intentionally, so wrongLength
    // does appear in error options — matching length.rb:13 behaviour.
    class Person extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { length: { is: 5, wrongLength: "bad length!" } });
      }
    }
    const p = new Person({ title: "abc" });
    await p.isValid();
    const err = p.errors.objects[0];
    expect(err).toBeDefined();
    expect(err.options).not.toHaveProperty("minimum");
    expect(err.options).not.toHaveProperty("maximum");
    expect(err.options).not.toHaveProperty("tooShort");
    expect(err.options).not.toHaveProperty("tooLong");
    expect(err.options).not.toHaveProperty("within");
    expect(err.options).not.toHaveProperty("is");
    expect(err.options).toHaveProperty("count");
  });

  it("allowBlank: false with only maximum forces minimum of 1", async () => {
    // Mirrors length.rb:22-24: if allow_blank == false && minimum.nil? && is.nil? → minimum = 1
    class Person extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { length: { maximum: 10, allowBlank: false } });
      }
    }
    expect(await new Person({ title: "" }).isValid()).toBe(false);
    expect(await new Person({ title: "a" }).isValid()).toBe(true);
  });

  it("throws at definition time when :in is not a tuple or range object", () => {
    expect(() => {
      class Person extends Model {
        static {
          this.attribute("title", "string");
          this.validates("title", { length: { in: "3..10" as unknown as [number, number] } });
        }
      }
      return Person;
    }).toThrow(/must be a \[min, max\] tuple/);
  });

  it("throws at definition time when constraint is a non-integer", () => {
    expect(() => {
      class Person extends Model {
        static {
          this.attribute("title", "string");
          this.validates("title", { length: { minimum: 2.5 } });
        }
      }
      // reference to suppress unused-class lint
      return Person;
    }).toThrow(/minimum must be a non-negative Integer/);
  });

  it("throws at definition time when constraint is negative", () => {
    expect(() => {
      class Person extends Model {
        static {
          this.attribute("title", "string");
          this.validates("title", { length: { minimum: -1 } });
        }
      }
      return Person;
    }).toThrow(/minimum must be a non-negative Integer/);
  });

  it("validates length of with symbol method name", async () => {
    // Rails: a Symbol resolves via record.send(:method_name). In TS a
    // string option that names a method on the record is resolved the
    // same way (resolve-value.ts).
    class Person extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { length: { minimum: "minLength" } });
      }
      minLength(): number {
        return 3;
      }
    }
    expect(await new Person({ title: "abc" }).isValid()).toBe(true);
    expect(await new Person({ title: "ab" }).isValid()).toBe(false);
  });
});
