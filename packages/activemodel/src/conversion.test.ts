import { describe, it, expect } from "vitest";
import { Model } from "./index.js";

describe("ConversionTest", () => {
  it("to_partial_path handles namespaced models", () => {
    class Post extends Model {
      static {
        this.attribute("title", "string");
      }
    }
    const p = new Post({ title: "hi" });
    expect(p.toPartialPath()).toBe("posts/_post");
  });

  it("#to_param_delimiter allows redefining the delimiter used in #to_param", () => {
    class Person extends Model {
      static {
        this.attribute("id", "integer");
      }
      isPersisted() {
        return true;
      }
    }
    const p = new Person({ id: 123 });
    expect(p.toParam()).toBe("123");
  });

  it("to_key doesn't double-wrap composite `id`s", () => {
    class Person extends Model {
      static {
        this.attribute("id", "integer");
      }
      isPersisted() {
        return true;
      }
    }
    const p = new Person({ id: 1 });
    expect(p.toKey()).toEqual([1]);
  });

  it("to_param returns nil if composite id is incomplete", () => {
    class Person extends Model {
      static {
        this.attribute("id", "integer");
      }
    }
    const p = new Person({});
    // Not persisted, so toParam returns null
    expect(p.toParam()).toBeNull();
  });

  it("to_partial_path handles non-standard model_name", () => {
    class CustomModel extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const m = new CustomModel({});
    expect(m.toPartialPath()).toContain("_");
  });

  it("#to_param_delimiter is defined per class", () => {
    class Person extends Model {
      static {
        this.attribute("id", "integer");
      }
      isPersisted() {
        return true;
      }
    }
    const p = new Person({ id: 1 });
    expect(p.toParam()).toBe("1");
  });

  it("to_model default implementation returns self", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const p = new Person({ name: "Alice" });
    expect(p.toModel()).toBe(p);
  });

  it("to_key default implementation returns nil for new records", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    expect(new Person({ name: "Alice" }).toKey()).toBe(null);
  });

  it("to_param default implementation returns nil for new records", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    expect(new Person({ name: "Alice" }).toParam()).toBe(null);
  });

  it("to_partial_path default implementation returns a string giving a relative path", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    expect(new Person({ name: "Alice" }).toPartialPath()).toBe("people/_person");
  });

  it("to_key default implementation returns the id in an array for persisted records", () => {
    class Person extends Model {
      static {
        this.attribute("id", "integer");
      }
      isPersisted() {
        return true;
      }
    }
    const p = new Person({ id: 1 });
    expect(p.toKey()).toEqual([1]);
  });

  it("to_param default implementation returns a string of ids for persisted records", () => {
    class Person extends Model {
      static {
        this.attribute("id", "integer");
      }
      isPersisted() {
        return true;
      }
    }
    const p = new Person({ id: 1 });
    expect(p.toParam()).toBe("1");
  });

  it("to_param returns the string joined by '-'", () => {
    class Person extends Model {
      static {
        this.attribute("id", "integer");
      }
      isPersisted() {
        return true;
      }
      toKey() {
        return [1, 2, 3];
      }
    }
    const p = new Person({ id: 1 });
    expect(p.toParam()).toBe("1-2-3");
  });

  it("to_param returns nil if to_key is nil", () => {
    class Contact extends Model {
      static {
        this.attribute("id", "integer");
      }
      isPersisted() {
        return true;
      }
      toKey() {
        return null;
      }
    }
    expect(new Contact({}).toParam()).toBeNull();
  });
});
