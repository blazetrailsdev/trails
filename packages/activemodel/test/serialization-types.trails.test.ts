import { describe, it, expectTypeOf } from "vitest";

import type {
  AssociationKeys,
  AttributeKeys,
  Serialized,
  TypedSerializeOptions,
} from "../lib/index.js";

class Record {
  declare errors: unknown;
  save(): boolean {
    return true;
  }
}

class Author extends Record {
  declare id: number;
  declare name: string;
  declare email: string | null;
  declare karma: bigint;
  fullName(): string {
    return this.name;
  }
  isAdmin(): boolean {
    return false;
  }
  async postCount(): Promise<number> {
    return 0;
  }
}

class Comment extends Record {
  declare id: number;
  declare body: string;
}

class Post extends Record {
  declare id: number;
  declare title: string;
  declare status: "draft" | "published";
  declare published_at: Date;
  declare author: Promise<Author | null>;
  declare comments: PromiseLike<Comment[]>;
}

type S<M, O> = Serialized<M, O, Record>;

describe("Serialized", () => {
  it("lists attributes and associations without base-class members", () => {
    expectTypeOf<AttributeKeys<Post, Record>>().toEqualTypeOf<
      "id" | "title" | "status" | "published_at"
    >();
    expectTypeOf<AttributeKeys<Author, Record>>().toEqualTypeOf<
      "id" | "name" | "email" | "karma"
    >();
    expectTypeOf<AssociationKeys<Post, Record>>().toEqualTypeOf<"author" | "comments">();
  });

  it("serializes every attribute with no options, through toJSON", () => {
    expectTypeOf<S<Post, object>>().toEqualTypeOf<{
      id: number;
      title: string;
      status: "draft" | "published";
      published_at: string;
    }>();
  });

  it("narrows with only and except", () => {
    expectTypeOf<S<Post, { only: ["id", "title"] }>>().toEqualTypeOf<{
      id: number;
      title: string;
    }>();
    expectTypeOf<S<Post, { only: "id" }>>().toEqualTypeOf<{ id: number }>();
    expectTypeOf<S<Post, { except: ["published_at", "status"] }>>().toEqualTypeOf<{
      id: number;
      title: string;
    }>();
  });

  it("adds methods by their Rails name, camelized to the member", () => {
    expectTypeOf<S<Author, { only: ["id"]; methods: ["full_name"] }>>().toEqualTypeOf<{
      id: number;
      full_name: string;
    }>();
    expectTypeOf<
      S<Author, { only: []; methods: ["admin?", "post_count", "fullName"] }>
    >().toEqualTypeOf<{ "admin?": boolean; post_count: number; fullName: string }>();
  });

  it("falls through to except when only is nil, as Ruby's `if only = options[:only]` does", () => {
    expectTypeOf<S<Post, { only: null; except: ["published_at", "status"] }>>().toEqualTypeOf<{
      id: number;
      title: string;
    }>();
    expectTypeOf<keyof S<Post, { only: [] }>>().toEqualTypeOf<never>();
  });

  it("encodes bigint as a string, as Numeric#as_json does", () => {
    expectTypeOf<S<Author, { only: ["karma"] }>>().toEqualTypeOf<{ karma: string }>();
  });

  it("includes associations recursively, omitting a nil one as `if records = send(association)` does", () => {
    expectTypeOf<
      S<Post, { only: ["id"]; include: { author: { only: ["name"] }; comments: object } }>
    >().toEqualTypeOf<{
      id: number;
      author?: { name: string };
      comments: { id: number; body: string }[];
    }>();
    expectTypeOf<S<Post, { only: ["id"]; include: ["comments"] }>>().toEqualTypeOf<{
      id: number;
      comments: { id: number; body: string }[];
    }>();
  });

  it("rejects unknown keys in the options", () => {
    expectTypeOf<{ only: ["id", "nope"] }>().not.toMatchTypeOf<
      TypedSerializeOptions<Post, Record>
    >();
    expectTypeOf<{ methods: ["nope"] }>().not.toMatchTypeOf<
      TypedSerializeOptions<Author, Record>
    >();
    expectTypeOf<{ methods: ["save"] }>().not.toMatchTypeOf<
      TypedSerializeOptions<Author, Record>
    >();
    expectTypeOf<{ include: ["save"] }>().not.toMatchTypeOf<TypedSerializeOptions<Post, Record>>();
    expectTypeOf<{
      include: { author: { only: ["title"] } };
    }>().not.toMatchTypeOf<TypedSerializeOptions<Post, Record>>();
    expectTypeOf<{
      only: ["id"];
      include: { author: { only: ["name"] } };
    }>().toMatchTypeOf<TypedSerializeOptions<Post, Record>>();
  });

  it("infers literal options at a call site through a const type parameter", () => {
    const asJson = <const O extends TypedSerializeOptions<Post, Record>>(
      _post: Post,
      _options: O,
    ): S<Post, O> => ({}) as S<Post, O>;
    const json = asJson(new Post(), { only: ["id", "status"] });
    expectTypeOf(json).toEqualTypeOf<{ id: number; status: "draft" | "published" }>();
  });
});
