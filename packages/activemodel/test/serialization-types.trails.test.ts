import { describe, it, expectTypeOf } from "vitest";

import type {
  AssociationKeys,
  AttributeKeys,
  JsonValue,
  Serialized,
  SerializedJson,
  TypedSerializeOptions,
} from "../lib/index.js";

class Model {
  declare errors: unknown;
  save(): boolean {
    return true;
  }
}

class Author extends Model {
  declare id: number;
  declare name: string;
  declare email: string | null;
  declare karma: bigint;
  fullName(): string {
    return this.name;
  }
  fullURL(): string {
    return "";
  }
  isAdmin(): boolean {
    return false;
  }
  async postCount(): Promise<number> {
    return 0;
  }
}

class Comment extends Model {
  declare id: number;
  declare body: string;
}

class Post extends Model {
  declare id: number;
  declare title: string;
  declare status: "draft" | "published";
  declare published_at: Date;
  declare author: Promise<Author | null>;
  declare comments: PromiseLike<Comment[]>;
}

class Encoded {
  asJson(): { x: number } {
    return { x: 1 };
  }
  toJSON(): string {
    return "";
  }
}

type S<M, O> = Serialized<M, O, Model>;
type J<M, O> = SerializedJson<M, O, Model>;

describe("Serialized", () => {
  it("lists attributes and associations without base-class members", () => {
    expectTypeOf<AttributeKeys<Post, Model>>().toEqualTypeOf<
      "id" | "title" | "status" | "published_at"
    >();
    expectTypeOf<AttributeKeys<Author, Model>>().toEqualTypeOf<"id" | "name" | "email" | "karma">();
    expectTypeOf<AssociationKeys<Post, Model>>().toEqualTypeOf<"author" | "comments">();
  });

  it("keeps raw attribute values, as serializable_attributes does", () => {
    expectTypeOf<S<Post, object>>().toEqualTypeOf<{
      id: number;
      title: string;
      status: "draft" | "published";
      published_at: Date;
    }>();
    expectTypeOf<S<Author, { only: ["karma"] }>>().toEqualTypeOf<{ karma: bigint }>();
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

  it("falls through to except when only is nil, as Ruby's `if only = options[:only]` does", () => {
    expectTypeOf<S<Post, { only: null; except: ["published_at", "status"] }>>().toEqualTypeOf<{
      id: number;
      title: string;
    }>();
    expectTypeOf<keyof S<Post, { only: [] }>>().toEqualTypeOf<never>();
  });

  it("sends methods by their Rails name, readers included, returning unawaited", () => {
    expectTypeOf<S<Author, { only: ["id"]; methods: ["full_name"] }>>().toEqualTypeOf<{
      id: number;
      full_name: string;
    }>();
    expectTypeOf<
      S<Author, { only: []; methods: ["admin?", "post_count", "fullName", "name"] }>
    >().toEqualTypeOf<{
      "admin?": boolean;
      post_count: Promise<number>;
      fullName: string;
      name: string;
    }>();
  });

  it("camelizes acronym members the way the runtime's camelized does", () => {
    expectTypeOf<{ methods: ["fullURL", "full_u_r_l"] }>().toMatchTypeOf<
      TypedSerializeOptions<Author, Model>
    >();
    expectTypeOf<{ methods: ["full_url"] }>().not.toMatchTypeOf<
      TypedSerializeOptions<Author, Model>
    >();
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
      TypedSerializeOptions<Post, Model>
    >();
    expectTypeOf<{ methods: ["nope"] }>().not.toMatchTypeOf<TypedSerializeOptions<Author, Model>>();
    expectTypeOf<{ methods: ["save"] }>().not.toMatchTypeOf<TypedSerializeOptions<Author, Model>>();
    expectTypeOf<{ include: ["save"] }>().not.toMatchTypeOf<TypedSerializeOptions<Post, Model>>();
    expectTypeOf<{
      include: { author: { only: ["title"] } };
    }>().not.toMatchTypeOf<TypedSerializeOptions<Post, Model>>();
    expectTypeOf<{
      only: ["id"];
      include: { author: { only: ["name"] } };
    }>().toMatchTypeOf<TypedSerializeOptions<Post, Model>>();
  });

  it("infers literal options at a call site through a const type parameter", () => {
    const serializableHash = <const O extends TypedSerializeOptions<Post, Model>>(
      _post: Post,
      _options: O,
    ): S<Post, O> => ({}) as S<Post, O>;
    const hash = serializableHash(new Post(), { only: ["id", "status"] });
    expectTypeOf(hash).toEqualTypeOf<{ id: number; status: "draft" | "published" }>();
  });
});

describe("SerializedJson", () => {
  it("encodes the hash the way as_json does", () => {
    expectTypeOf<J<Post, { only: ["id", "published_at"] }>>().toEqualTypeOf<{
      id: number;
      published_at: string;
    }>();
    expectTypeOf<J<Author, { only: ["karma"] }>>().toEqualTypeOf<{ karma: string }>();
  });

  it("encodes an unawaited method Promise as Object#as_json's empty hash", () => {
    expectTypeOf<J<Author, { only: []; methods: ["post_count"] }>>().toEqualTypeOf<{
      post_count: Record<string, never>;
    }>();
  });

  it("dispatches asJson before toJSON, as the encoder does", () => {
    expectTypeOf<JsonValue<Encoded>>().toEqualTypeOf<{ x: number }>();
  });

  it("encodes a toJSON return recursively", () => {
    expectTypeOf<JsonValue<{ toJSON(): { n: bigint } }>>().toEqualTypeOf<{ n: string }>();
  });

  it("encodes a Map as Hash#as_json and other iterables as Enumerable#as_json", () => {
    expectTypeOf<JsonValue<Map<string, bigint>>>().toEqualTypeOf<Record<string, string>>();
    expectTypeOf<JsonValue<Set<bigint>>>().toEqualTypeOf<string[]>();
  });

  it("encodes a plain instance through instance_values, dropping its methods", () => {
    class Point {
      declare x: number;
      norm(): number {
        return 0;
      }
    }
    expectTypeOf<JsonValue<Point>>().toEqualTypeOf<{ x: number }>();
  });
});
