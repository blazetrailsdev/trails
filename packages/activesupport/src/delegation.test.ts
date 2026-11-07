import { describe, it, expect } from "vitest";
import { NoMethodError, rbObjRespondTo, rbObjSingletonClass } from "@blazetrails/ruby-compat";
import { DelegationError, Delegation } from "./delegation.js";

describe("DelegationError", () => {
  it("creates error with message", () => {
    const err = new DelegationError("test");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("DelegationError");
    expect(err.message).toBe("test");
  });

  it("nilTarget creates descriptive error", () => {
    const err = DelegationError.nilTarget("name", "person");
    expect(err.message).toBe("name delegated to person, but person is nil");
  });
});

describe("Delegation.generate", () => {
  it("delegates to the class of a receiver with no class accessor", () => {
    class Record {
      static tableName() {
        return "records";
      }
      declare tableName: () => string;
    }
    Delegation.generate(Record.prototype, ["tableName"], { to: "class", allowNil: true });

    expect(new Record().tableName()).toBe("records");
  });

  it("delegates to the real class through a singleton class", () => {
    class Record {
      static tableName() {
        return "records";
      }
      declare tableName: () => string;
    }
    Delegation.generate(Record.prototype, ["tableName"], { to: "class" });
    const record = new Record();
    rbObjSingletonClass(record);

    expect(record.tableName()).toBe("records");
  });

  it("defines an accessor when the delegated class member is an accessor", () => {
    class Record {
      static get jobClass() {
        return `${this.name}Job`;
      }
      declare jobClass: string;
    }
    class Child extends Record {}
    Delegation.generate(Record.prototype, ["jobClass"], { to: "class" });

    expect(Object.getOwnPropertyDescriptor(Record.prototype, "jobClass")!.get).toBeTypeOf(
      "function",
    );
    expect(new Record().jobClass).toBe("RecordJob");
    expect(new Child().jobClass).toBe("ChildJob");

    class Detached {}
    const detached = new Record();
    Object.setPrototypeOf(
      detached,
      Object.create(Record.prototype, { constructor: { value: Detached } }),
    );
    expect(() => detached.jobClass).toThrow(NoMethodError);
  });

  it("delegates method to target", () => {
    class Greeter {
      greet() {
        return "hello";
      }
    }
    class Person {
      greeter = new Greeter();
    }
    Delegation.generate(Person.prototype, ["greet"], { to: "greeter" });
    const p = new Person() as Person & { greet: () => string };
    expect(p.greet()).toBe("hello");
  });

  it("throws DelegationError when target is nil and allowNil is false", () => {
    class Person {
      greeter: null = null;
    }
    Delegation.generate(Person.prototype, ["greet"], { to: "greeter" });
    const p = new Person() as Person & { greet: () => unknown };
    expect(() => p.greet()).toThrow(DelegationError);
  });

  it("returns undefined when target is nil and allowNil is true", () => {
    class Person {
      greeter: null = null;
    }
    Delegation.generate(Person.prototype, ["greet"], { to: "greeter", allowNil: true });
    const p = new Person() as Person & { greet: () => unknown };
    expect(() => p.greet()).not.toThrow();
    expect(p.greet()).toBeUndefined();
  });

  it("supports prefix option", () => {
    class Greeter {
      greet() {
        return "hello";
      }
    }
    class Person {
      greeter = new Greeter();
    }
    Delegation.generate(Person.prototype, ["greet"], { to: "greeter", prefix: true });
    const p = new Person() as Person & { greeter_greet: () => string };
    expect(p.greeter_greet()).toBe("hello");
  });

  it("supports custom prefix", () => {
    class Greeter {
      greet() {
        return "hello";
      }
    }
    class Person {
      greeter = new Greeter();
    }
    Delegation.generate(Person.prototype, ["greet"], { to: "greeter", prefix: "my" });
    const p = new Person() as Person & { my_greet: () => string };
    expect(p.my_greet()).toBe("hello");
  });

  it("raises NoMethodError when the target does not answer the method", () => {
    class Greeter {}
    class Person {
      greeter = new Greeter();
    }
    Delegation.generate(Person.prototype, ["greet"], { to: "greeter" });
    const p = new Person() as Person & { greet: () => string };
    expect(() => p.greet()).toThrow(/undefined method 'greet'/);
    expect(() => p.greet()).not.toThrow(DelegationError);
  });

  it("throws when no target specified", () => {
    expect(() => {
      Delegation.generate({}, ["greet"], { to: "" });
    }).toThrow("Delegation needs a target");
  });

  it("prefixes a reserved receiver with self.", () => {
    class Person {
      args: null = null;
    }
    Delegation.generate(Person.prototype, ["greet"], { to: "args" });
    const p = new Person() as Person & { greet: () => unknown };
    expect(() => p.greet()).toThrow("greet delegated to self.args, but self.args is nil");
  });
});

describe("Delegation.generateMethodMissing", () => {
  const host = (fields: Record<string, unknown>, options?: { allowNil?: boolean }) => {
    const target = Object.keys(fields)[0];
    class Host {
      constructor() {
        Object.assign(this, fields);
      }
    }
    Delegation.generateMethodMissing(Host, target, options);
    return new Host() as any;
  };

  it("raises NoMethodError when a non-nil target does not answer the method", () => {
    const obj = host({ delegate: {} });

    expect(rbObjRespondTo(obj, "nonexistentMethod")).toBe(false);
    expect(() => obj["nonexistentMethod"]()).toThrow(/undefined method 'nonexistentMethod'/);
  });

  it("answers a getter target on an instance with no own fields", () => {
    class H {
      get delegate() {
        return { greet: () => "hi" };
      }
    }
    Delegation.generateMethodMissing(H, "delegate");
    expect(rbObjRespondTo(new H(), "greet")).toBe(true);
  });

  it("does not read the target off a prototype layer", () => {
    class H {
      get delegate(): never {
        throw new TypeError("no receiver");
      }
    }
    Delegation.generateMethodMissing(H, "delegate");
    expect((H.prototype as { greet?: unknown }).greet).toBeUndefined();
  });

  it("does not answer marshal_dump or _dump but still forwards an explicit call", () => {
    const obj = host({
      delegate: {
        marshal_dump() {
          return "dumped";
        },
      },
    });

    expect(rbObjRespondTo(obj, "marshal_dump")).toBe(false);
    expect(obj["marshal_dump"]()).toBe("dumped");
  });

  it("reads the target through the receiver when spliced into a prototype chain", () => {
    class Host {
      #secret = "private";
      get delegate() {
        return { greet: () => "hello" };
      }
      secret() {
        return this.#secret;
      }
    }
    Delegation.generateMethodMissing(Host, "delegate");
    class Sub extends Host {
      #own = "sub";
      own() {
        return this.#own;
      }
    }
    const sub = new Sub();
    expect((sub as unknown as { greet(): string }).greet()).toBe("hello");
    expect(sub.secret()).toBe("private");
    expect(sub.own()).toBe("sub");
    expect(sub).toBeInstanceOf(Host);
    expect(Object.getPrototypeOf(sub)).toBe(Sub.prototype);
    expect(Object.getPrototypeOf(new Host())).toBe(Host.prototype);
    expect((Host.prototype as unknown as { greet?: unknown }).greet).toBeUndefined();
  });

  it("does not forward an underscore field or a Kernel method", () => {
    const obj = host({ delegate: { _x: 1, dup: () => 2 } });
    expect(obj._x).toBeUndefined();
    expect(obj.dup).toBeUndefined();
  });

  it("proxies method calls to delegate", () => {
    const obj = host({
      delegate: {
        greet() {
          return "hello";
        },
        name: "world",
      },
    });
    expect(obj.greet()).toBe("hello");
    expect(obj.name).toBe("world");
  });

  it("throws DelegationError for nil delegate without allowNil", () => {
    const obj = host({ delegate: null });
    expect(() => obj.greet).toThrow(DelegationError);
  });

  it("returns undefined for nil delegate with allowNil", () => {
    const obj = host({ delegate: null }, { allowNil: true });
    expect(obj.greet).toBeUndefined();
  });

  it("prefixes a reserved target with self.", () => {
    const obj = host({ args: null });
    expect(() => obj.greet).toThrow("greet delegated to self.args, but self.args is nil");
  });

  it("prefixes a target named __target with self.", () => {
    const obj = host({ __target: null });
    expect(() => obj.greet).toThrow("greet delegated to self.__target, but self.__target is nil");
  });

  it("reads a reserved target's member through the unprefixed name", () => {
    const obj = host({ args: { name: "David" } });
    expect(obj.name).toBe("David");
    expect(rbObjRespondTo(obj, "name")).toBe(true);
  });
});
