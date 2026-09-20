/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type --
   Each model below spells `include ActiveModel::Serialization` in its class body, the way the
   Rails test model it mirrors does; the empty class/interface merge beside it is how
   `include()` surfaces those members on the type side. */
import { describe, it, expect, beforeEach } from "vitest";
import { include, exceptBang, InstanceVariablesObject } from "@blazetrails/activesupport";
import { Serialization } from "./serialization.js";
import { NoMethodError } from "./attribute-assignment.js";

describe("SerializationTest", () => {
  class User {
    name: string;
    email: string;
    gender: string;
    address?: Address;
    friends: unknown;

    static {
      include(this, Serialization);
    }

    constructor(name: string, email: string, gender: string) {
      this.name = name;
      this.email = email;
      this.gender = gender;
      this.friends = [];
    }

    get attributes(): Record<string, unknown> {
      return exceptBang(InstanceVariablesObject.instanceValues(this), "address", "friends");
    }

    bar(): string {
      return "i_am_bar";
    }

    foo(): string {
      return "i_am_foo";
    }
  }
  interface User extends Serialization {}

  class Address {
    street?: string;
    city?: string;
    state?: string;
    zip?: number;

    static {
      include(this, Serialization);
    }

    get attributes(): Record<string, unknown> {
      return InstanceVariablesObject.instanceValues(this);
    }
  }
  interface Address extends Serialization {}

  let user: User;

  beforeEach(() => {
    user = new User("David", "david@example.com", "male");
    user.address = new Address();
    user.address.street = "123 Lane";
    user.address.city = "Springfield";
    user.address.state = "CA";
    user.address.zip = 11111;
    user.friends = [
      new User("Joe", "joe@example.com", "male"),
      new User("Sue", "sue@example.com", "female"),
    ];
  });

  it("method serializable hash should work", () => {
    const expected = { name: "David", gender: "male", email: "david@example.com" };
    expect(user.serializableHash()).toEqual(expected);
  });

  it("method serializable hash should work with only option", () => {
    const expected = { name: "David" };
    expect(user.serializableHash({ only: ["name"] })).toEqual(expected);
  });

  it("method serializable hash should work with only option with order of given keys", () => {
    const expected = { name: "David", email: "david@example.com" };
    expect(Object.keys(user.serializableHash({ only: ["name", "email"] }))).toEqual(
      Object.keys(expected),
    );
  });

  it("method serializable hash should work with except option", () => {
    const expected = { gender: "male", email: "david@example.com" };
    expect(user.serializableHash({ except: ["name"] })).toEqual(expected);
  });

  it("method serializable hash should work with methods option", () => {
    const expected = {
      name: "David",
      gender: "male",
      foo: "i_am_foo",
      bar: "i_am_bar",
      email: "david@example.com",
    };
    expect(user.serializableHash({ methods: ["foo", "bar"] })).toEqual(expected);
  });

  it("method serializable hash should work with only and methods", () => {
    const expected = { foo: "i_am_foo", bar: "i_am_bar" };
    expect(user.serializableHash({ only: [], methods: ["foo", "bar"] })).toEqual(expected);
  });

  it("method serializable hash should work with except and methods", () => {
    const expected = { gender: "male", foo: "i_am_foo", bar: "i_am_bar" };
    expect(user.serializableHash({ except: ["name", "email"], methods: ["foo", "bar"] })).toEqual(
      expected,
    );
  });

  it("should raise NoMethodError for non existing method", () => {
    expect(() => user.serializableHash({ methods: ["nada"] })).toThrow(NoMethodError);
  });

  it("should use read attribute for serialization", () => {
    (
      user as unknown as { readAttributeForSerialization(n: string): unknown }
    ).readAttributeForSerialization = () => "Jon";

    const expected = { name: "Jon" };
    expect(user.serializableHash({ only: "name" })).toEqual(expected);
  });

  it("include option with singular association", () => {
    const expected = {
      name: "David",
      gender: "male",
      email: "david@example.com",
      address: { street: "123 Lane", city: "Springfield", state: "CA", zip: 11111 },
    };
    expect(user.serializableHash({ include: "address" })).toEqual(expected);
  });

  it("include option with plural association", () => {
    const expected = {
      email: "david@example.com",
      gender: "male",
      name: "David",
      friends: [
        { name: "Joe", email: "joe@example.com", gender: "male" },
        { name: "Sue", email: "sue@example.com", gender: "female" },
      ],
    };
    expect(user.serializableHash({ include: "friends" })).toEqual(expected);
  });

  it("include option with empty association", () => {
    user.friends = [];
    const expected = {
      email: "david@example.com",
      gender: "male",
      name: "David",
      friends: [],
    };
    expect(user.serializableHash({ include: "friends" })).toEqual(expected);
  });

  class FriendList {
    friends: unknown[];
    constructor(friends: unknown[]) {
      this.friends = friends;
    }

    [Symbol.iterator](): Iterator<unknown> {
      return this.friends[Symbol.iterator]();
    }
  }

  it("include option with ary", () => {
    user.friends = new FriendList(user.friends as unknown[]);
    const expected = {
      email: "david@example.com",
      gender: "male",
      name: "David",
      friends: [
        { name: "Joe", email: "joe@example.com", gender: "male" },
        { name: "Sue", email: "sue@example.com", gender: "female" },
      ],
    };
    expect(user.serializableHash({ include: "friends" })).toEqual(expected);
  });

  it("multiple includes", () => {
    const expected = {
      email: "david@example.com",
      gender: "male",
      name: "David",
      address: { street: "123 Lane", city: "Springfield", state: "CA", zip: 11111 },
      friends: [
        { name: "Joe", email: "joe@example.com", gender: "male" },
        { name: "Sue", email: "sue@example.com", gender: "female" },
      ],
    };
    expect(user.serializableHash({ include: ["address", "friends"] })).toEqual(expected);
  });

  it("include with options", () => {
    const expected = {
      email: "david@example.com",
      gender: "male",
      name: "David",
      address: { street: "123 Lane" },
    };
    expect(user.serializableHash({ include: { address: { only: "street" } } })).toEqual(expected);
  });

  it("nested include", () => {
    (user.friends as User[])[0].friends = [user];
    const expected = {
      email: "david@example.com",
      gender: "male",
      name: "David",
      friends: [
        {
          name: "Joe",
          email: "joe@example.com",
          gender: "male",
          friends: [{ email: "david@example.com", gender: "male", name: "David" }],
        },
        { name: "Sue", email: "sue@example.com", gender: "female", friends: [] },
      ],
    };
    expect(user.serializableHash({ include: { friends: { include: "friends" } } })).toEqual(
      expected,
    );
  });

  it("only include", () => {
    const expected = { name: "David", friends: [{ name: "Joe" }, { name: "Sue" }] };
    expect(user.serializableHash({ only: "name", include: { friends: { only: "name" } } })).toEqual(
      expected,
    );
  });

  it("except include", () => {
    const expected = {
      name: "David",
      email: "david@example.com",
      friends: [
        { name: "Joe", email: "joe@example.com" },
        { name: "Sue", email: "sue@example.com" },
      ],
    };
    expect(
      user.serializableHash({ except: "gender", include: { friends: { except: "gender" } } }),
    ).toEqual(expected);
  });

  it("multiple includes with options", () => {
    const expected = {
      email: "david@example.com",
      gender: "male",
      name: "David",
      address: { street: "123 Lane" },
      friends: [
        { name: "Joe", email: "joe@example.com", gender: "male" },
        { name: "Sue", email: "sue@example.com", gender: "female" },
      ],
    };
    expect(
      user.serializableHash({ include: [{ address: { only: "street" } }, "friends"] }),
    ).toEqual(expected);
  });

  it("all includes with options", () => {
    const expected = {
      email: "david@example.com",
      gender: "male",
      name: "David",
      address: { street: "123 Lane" },
      friends: [{ name: "Joe" }, { name: "Sue" }],
    };
    expect(
      user.serializableHash({
        include: [{ address: { only: "street" }, friends: { only: "name" } }],
      }),
    ).toEqual(expected);
  });
});
