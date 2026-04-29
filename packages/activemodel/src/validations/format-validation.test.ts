import { describe, it, expect } from "vitest";
import { Model } from "../index.js";

describe("FormatValidationTest", () => {
  it("validates format of with multiline regexp and option", () => {
    // Multiline regexp should raise error
    expect(() => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { format: { with: /^foo$/m } });
        }
      }
    }).toThrow(/multiline/i);
  });

  it("validates format of without lambda without arguments", () => {
    // JS regex has no \A/\z analogues for Ruby's start-of-string /
    // end-of-string anchors. JS ^/$ default to start/end of input
    // (line anchors only with the `m` flag), but Rails inspects regex
    // *source* for ^/$ regardless and forces opt-in via multiline: true
    // — the security check is about the developer's intent, not the
    // regex engine's flag state (format.rb:42, regexp_using_multiline_anchors?).
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { format: { with: /^[a-z]+$/, multiline: true } });
      }
    }
    expect(new Person({ name: "alice" }).isValid()).toBe(true);
    expect(new Person({ name: "Alice123" }).isValid()).toBe(false);
  });

  it("validates format of with both regexps should raise error", () => {
    expect(() => {
      class Person extends Model {
        static {
          this.attribute("email", "string");
          this.validates("email", { format: { with: /@/, without: /test/ } });
        }
      }
    }).toThrow(/but not both/);
  });

  it("validates format of when with isnt a regexp should raise error", () => {
    // Rails check_validity! runs at validator construction, so the
    // throw fires when `validates(...)` is called — match that timing.
    expect(() => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { format: { with: "not a regexp" as any } });
        }
      }
      void Person;
    }).toThrow(/regular expression or a proc or lambda must be supplied as :with/);
  });

  it("validates format of when not isnt a regexp should raise error", () => {
    expect(() => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { format: { without: "not a regexp" as any } });
        }
      }
      void Person;
    }).toThrow(/regular expression or a proc or lambda must be supplied as :without/);
  });

  it("validates format of without lambda", () => {
    class Person extends Model {
      static {
        this.attribute("email", "string");
        this.validates("email", { format: { with: /@/ } });
      }
    }
    const p = new Person({ email: "invalid" });
    p.isValid();
    expect(p.errors.count).toBeGreaterThan(0);
  });

  it("validate format", () => {
    class Person extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { format: { with: /^[A-Z]/, multiline: true } });
      }
    }
    expect(new Person({ title: "Hello" }).isValid()).toBe(true);
    expect(new Person({ title: "hello" }).isValid()).toBe(false);
  });

  it("validate format with not option", () => {
    class Person extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { format: { without: /\d/ } });
      }
    }
    expect(new Person({ title: "hello" }).isValid()).toBe(true);
    expect(new Person({ title: "hello123" }).isValid()).toBe(false);
  });

  it("validate format with formatted message", () => {
    class Person extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", {
          format: { with: /^[A-Z]/, multiline: true, message: "must start with uppercase" },
        });
      }
    }
    const p = new Person({ title: "hello" });
    p.isValid();
    expect(p.errors.get("title")).toContain("must start with uppercase");
  });

  it("validate format with allow blank", () => {
    class Person extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", {
          format: { with: /^[A-Z]/, multiline: true, allowBlank: true },
        });
      }
    }
    expect(new Person({ title: "" }).isValid()).toBe(true);
    expect(new Person({ title: "Hello" }).isValid()).toBe(true);
    expect(new Person({ title: "hello" }).isValid()).toBe(false);
  });

  it("validate format numeric", () => {
    class Person extends Model {
      static {
        this.attribute("value", "string");
        this.validates("value", { format: { with: /^\d+$/, multiline: true } });
      }
    }
    expect(new Person({ value: "123" }).isValid()).toBe(true);
    expect(new Person({ value: "abc" }).isValid()).toBe(false);
  });

  it("validate format of with multiline regexp should raise error", () => {
    expect(() => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { format: { with: /^foo$/m } });
        }
      }
    }).toThrow(/multiline/i);
  });

  it("validate format of with multiline regexp and option", () => {
    expect(() => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { format: { with: new RegExp("^foo$", "m") } });
        }
      }
    }).toThrow(/multiline/i);
  });

  it("validate format of without any regexp should raise error", () => {
    expect(() => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { format: {} as any });
        }
      }
    }).toThrow(/Either :with or :without must be supplied/);
  });

  it("validates format of with lambda", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { format: { with: () => /^[a-z]+$/ } });
      }
    }
    expect(new Person({ name: "alice" }).isValid()).toBe(true);
    expect(new Person({ name: "Alice123" }).isValid()).toBe(false);
  });

  it("validates format of with lambda without arguments", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { format: { with: () => /^\w+$/ } });
      }
    }
    expect(new Person({ name: "alice" }).isValid()).toBe(true);
    expect(new Person({ name: "" }).isValid()).toBe(false);
  });

  it("validates format of for ruby class", () => {
    class Person extends Model {}
    Person.attribute("email", "string");
    Person.validates("email", { format: { with: /@/ } });
    expect(new Person({ email: "a@b.com" }).isValid()).toBe(true);
    expect(new Person({ email: "invalid" }).isValid()).toBe(false);
  });
});
describe("format with 'without' option", () => {
  class NoNumbers extends Model {
    static {
      this.attribute("name", "string");
      this.validates("name", { format: { without: /\d/ } });
    }
  }

  it("accepts values not matching 'without'", () => {
    expect(new NoNumbers({ name: "dean" }).isValid()).toBe(true);
  });

  it("rejects values matching 'without'", () => {
    const n = new NoNumbers({ name: "dean123" });
    expect(n.isValid()).toBe(false);
    expect(n.errors.get("name")).toContain("is invalid");
  });

  it("validate format does not mutate regex lastIndex across calls (g flag)", () => {
    // Rails regexp.match? is stateless. JS RegExp#test mutates lastIndex
    // for /g and /y regexes — a shared regex would alternate
    // pass/fail. Pin the stateless behavior here.
    const sharedRe = /\d+/g;
    class P extends Model {
      static {
        this.attribute("code", "string");
        this.validates("code", { format: { with: sharedRe } });
      }
    }
    expect(new P({ code: "abc123" }).isValid()).toBe(true);
    expect(new P({ code: "abc123" }).isValid()).toBe(true);
    expect(new P({ code: "abc123" }).isValid()).toBe(true);
    expect(sharedRe.lastIndex).toBe(0);
  });
});
