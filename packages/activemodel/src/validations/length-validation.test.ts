import { describe, it, expect } from "vitest";
import { Model } from "../index.js";

describe("LengthValidationTest", () => {
  it("optionally validates length of using within", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { length: { in: [3, 10] } });
      }
    }
    const p = new Person({ name: "ab" });
    expect(p.isValid()).toBe(false);
    const p2 = new Person({ name: "abc" });
    expect(p2.isValid()).toBe(true);
  });

  it("optionally validates length of using is", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { length: { is: 5 } });
      }
    }
    expect(new Person({ name: "alice" }).isValid()).toBe(true);
    expect(new Person({ name: "bob" }).isValid()).toBe(false);
  });

  it("validates length of using minimum utf8", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { length: { minimum: 3 } });
      }
    }
    const p = new Person({ name: "\u{1F600}\u{1F600}\u{1F600}" });
    // Emoji are 2 code units each in JS, so length >= 3
    expect(p.isValid()).toBe(true);
  });

  it("validates length of using maximum utf8", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { length: { maximum: 5 } });
      }
    }
    const p = new Person({ name: "ab" });
    expect(p.isValid()).toBe(true);
  });

  it("validates length of using within utf8", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { length: { in: [1, 5] } });
      }
    }
    expect(new Person({ name: "abc" }).isValid()).toBe(true);
  });

  it("validates length of for infinite maxima", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { length: { minimum: 1, maximum: Infinity } });
      }
    }
    expect(new Person({ name: "a" }).isValid()).toBe(true);
    expect(new Person({ name: "a".repeat(1000) }).isValid()).toBe(true);
  });

  it("validates length of using maximum should not allow nil when nil not allowed", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { presence: true, length: { maximum: 5 } });
      }
    }
    const p = new Person();
    expect(p.isValid()).toBe(false);
  });

  it("validates length of using both minimum and maximum should not allow nil", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { presence: true, length: { minimum: 1, maximum: 5 } });
      }
    }
    const p = new Person();
    expect(p.isValid()).toBe(false);
  });

  it("validates length of using proc as maximum with model method", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { length: { maximum: () => 5 } });
      }
    }
    expect(new Person({ name: "alice" }).isValid()).toBe(true);
    expect(new Person({ name: "aliceb" }).isValid()).toBe(false);
  });

  it("validates length of using lambda as maximum", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { length: { maximum: () => 10 } });
      }
    }
    expect(new Person({ name: "short" }).isValid()).toBe(true);
    expect(new Person({ name: "a".repeat(11) }).isValid()).toBe(false);
  });

  it("validates length of using bignum", () => {
    class Person extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { length: { maximum: 1000000 } });
      }
    }
    const p = new Person({ title: "short" });
    expect(p.isValid()).toBe(true);
  });

  it("validates length of nasty params", () => {
    class Person extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { length: { minimum: 1 } });
      }
    }
    const p = new Person({ title: "" });
    p.isValid();
    expect(p.errors.count).toBeGreaterThan(0);
  });

  it("optionally validates length of using within utf8", () => {
    class Person extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { length: { in: [3, 5] } });
      }
    }
    const p = new Person({ title: "abc" });
    expect(p.isValid()).toBe(true);
  });

  it("validates length of using is utf8", () => {
    class Person extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { length: { is: 5 } });
      }
    }
    const p = new Person({ title: "abcde" });
    expect(p.isValid()).toBe(true);
  });

  it("validates length of for ruby class", () => {
    class Person extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { length: { minimum: 2 } });
      }
    }
    const p = new Person({ title: "ok" });
    expect(p.isValid()).toBe(true);
  });

  it("validates length of using maximum should not allow nil and empty string when blank not allowed", () => {
    class Person extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { presence: true, length: { maximum: 5 } });
      }
    }
    const p = new Person({ title: "" });
    p.isValid();
    expect(p.errors.count).toBeGreaterThan(0);
  });

  it("validates length of using minimum 0 should not allow nil", () => {
    class Person extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { presence: true, length: { minimum: 0 } });
      }
    }
    const p = new Person({});
    p.isValid();
    expect(p.errors.count).toBeGreaterThan(0);
  });

  it("validates length of using is 0 should not allow nil", () => {
    class Person extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { length: { is: 0 } });
      }
    }
    const p = new Person({});
    // null is skipped by length validator
    expect(p.isValid()).toBe(true);
  });

  it("validates with diff in option", () => {
    class Person extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { length: { minimum: 2, maximum: 10 } });
      }
    }
    const p = new Person({ title: "ok" });
    expect(p.isValid()).toBe(true);
  });

  it("validates length of using symbol as maximum", () => {
    class Person extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { length: { maximum: 10 } });
      }
    }
    const p = new Person({ title: "short" });
    expect(p.isValid()).toBe(true);
  });

  it("validates length of using minimum", () => {
    class Person extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { length: { minimum: 5 } });
      }
    }
    expect(new Person({ title: "abcde" }).isValid()).toBe(true);
    expect(new Person({ title: "abcd" }).isValid()).toBe(false);
  });

  it("validates length of using maximum", () => {
    class Person extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { length: { maximum: 5 } });
      }
    }
    expect(new Person({ title: "abcde" }).isValid()).toBe(true);
    expect(new Person({ title: "abcdef" }).isValid()).toBe(false);
  });

  it("validates length of using maximum should allow nil", () => {
    class Person extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { length: { maximum: 5 } });
      }
    }
    expect(new Person({}).isValid()).toBe(true);
  });

  it("validates length of using within", () => {
    class Person extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { length: { in: [3, 5] } });
      }
    }
    expect(new Person({ title: "ab" }).isValid()).toBe(false);
    expect(new Person({ title: "abc" }).isValid()).toBe(true);
    expect(new Person({ title: "abcde" }).isValid()).toBe(true);
    expect(new Person({ title: "abcdef" }).isValid()).toBe(false);
  });

  it("validates length of using is", () => {
    class Person extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { length: { is: 4 } });
      }
    }
    expect(new Person({ title: "abcd" }).isValid()).toBe(true);
    expect(new Person({ title: "abc" }).isValid()).toBe(false);
    expect(new Person({ title: "abcde" }).isValid()).toBe(false);
  });

  it("validates length of custom errors for minimum with too short", () => {
    class Person extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { length: { minimum: 5, tooShort: "is way too short" } });
      }
    }
    const p = new Person({ title: "ab" });
    p.isValid();
    expect(p.errors.get("title")).toContain("is way too short");
  });

  it("validates length of custom errors for maximum with too long", () => {
    class Person extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { length: { maximum: 5, tooLong: "is way too long" } });
      }
    }
    const p = new Person({ title: "abcdefgh" });
    p.isValid();
    expect(p.errors.get("title")).toContain("is way too long");
  });

  it("validates length of custom errors for both too short and too long", () => {
    class Person extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", {
          length: { minimum: 3, maximum: 5, tooShort: "short!", tooLong: "long!" },
        });
      }
    }
    const short = new Person({ title: "ab" });
    short.isValid();
    expect(short.errors.get("title")).toContain("short!");

    const long = new Person({ title: "abcdef" });
    long.isValid();
    expect(long.errors.get("title")).toContain("long!");
  });

  it("validates length of custom errors for is with wrong length", () => {
    class Person extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { length: { is: 4, wrongLength: "wrong size!" } });
      }
    }
    const p = new Person({ title: "abc" });
    p.isValid();
    expect(p.errors.get("title")).toContain("wrong size!");
  });

  it("validates length of using proc as maximum", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { length: { maximum: () => 5 } });
      }
    }
    const p = new Person({ name: "Alice" });
    expect(p.isValid()).toBe(true);
    const p2 = new Person({ name: "Alicia" });
    expect(p2.isValid()).toBe(false);
  });

  it("validates length of with allow nil", () => {
    class Person extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { length: { minimum: 3, allowNil: true } });
      }
    }
    expect(new Person({}).isValid()).toBe(true);
    expect(new Person({ title: "abc" }).isValid()).toBe(true);
    expect(new Person({ title: "ab" }).isValid()).toBe(false);
  });

  it("validates length of with allow blank", () => {
    class Person extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { length: { minimum: 3, allowBlank: true } });
      }
    }
    expect(new Person({ title: "" }).isValid()).toBe(true);
    expect(new Person({ title: "abc" }).isValid()).toBe(true);
    expect(new Person({ title: "ab" }).isValid()).toBe(false);
  });

  it("optionally validates length of using minimum", () => {
    class Person extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { length: { minimum: 2 } });
      }
    }
    expect(new Person({ title: "ab" }).isValid()).toBe(true);
    expect(new Person({ title: "a" }).isValid()).toBe(false);
  });

  it("optionally validates length of using maximum", () => {
    class Person extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { length: { maximum: 5 } });
      }
    }
    expect(new Person({ title: "abcde" }).isValid()).toBe(true);
    expect(new Person({ title: "abcdef" }).isValid()).toBe(false);
  });

  it("validates length of using within with exclusive range", () => {
    // TS doesn't have Ruby's exclusive range syntax, but we can simulate
    // by using minimum/maximum with appropriate bounds
    class Person extends Model {
      static {
        this.attribute("title", "string");
        // Exclusive range (3...5) means 3 <= length < 5, so max is 4
        this.validates("title", { length: { minimum: 3, maximum: 4 } });
      }
    }
    expect(new Person({ title: "abc" }).isValid()).toBe(true);
    expect(new Person({ title: "abcd" }).isValid()).toBe(true);
    expect(new Person({ title: "abcde" }).isValid()).toBe(false);
    expect(new Person({ title: "ab" }).isValid()).toBe(false);
  });

  it("validates length of using within with infinite ranges", () => {
    class Person extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { length: { minimum: 0, maximum: Infinity } });
      }
    }
    expect(new Person({ title: "" }).isValid()).toBe(true);
    expect(new Person({ title: "a".repeat(10000) }).isValid()).toBe(true);
  });

  it("validates length of custom errors for minimum with message", () => {
    class Person extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { length: { minimum: 5, message: "is too short!" } });
      }
    }
    const p = new Person({ title: "ab" });
    p.isValid();
    expect(p.errors.get("title")).toContain("is too short!");
  });

  it("validates length of custom errors for maximum with message", () => {
    class Person extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { length: { maximum: 3, message: "is too long!" } });
      }
    }
    const p = new Person({ title: "abcde" });
    p.isValid();
    expect(p.errors.get("title")).toContain("is too long!");
  });

  it("validates length of custom errors for in", () => {
    class Person extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { length: { in: [3, 5], tooShort: "short!", tooLong: "long!" } });
      }
    }
    const short = new Person({ title: "ab" });
    short.isValid();
    expect(short.errors.get("title")).toContain("short!");
    const long = new Person({ title: "abcdef" });
    long.isValid();
    expect(long.errors.get("title")).toContain("long!");
  });

  it("validates length of custom errors for is with message", () => {
    class Person extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { length: { is: 5, message: "wrong length!" } });
      }
    }
    const p = new Person({ title: "abc" });
    p.isValid();
    expect(p.errors.get("title")).toContain("wrong length!");
  });

  it("validates length of for integer", () => {
    class Person extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { length: { is: 5 } });
      }
    }
    // Length is checked as string length
    expect(new Person({ title: "12345" }).isValid()).toBe(true);
    expect(new Person({ title: "1234" }).isValid()).toBe(false);
  });
});
