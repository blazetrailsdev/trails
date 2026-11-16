import { describe, it, expectTypeOf } from "vitest";
import { Base, CollectionProxy } from "@blazetrails/activerecord";
import { ActionController } from "@blazetrails/actionpack";
import type { HasOneAssociation } from "../lib/associations/has-one-association.js";

class Post extends Base {
  declare title: string;
}

class Author extends Base {
  declare posts: CollectionProxy<Post>;
}

const params = new ActionController.Parameters({ title: "Hello" }).permitBang();

describe("mass assignment DX — a permitted ActionController::Parameters", () => {
  it("is accepted by Relation#new, Relation#create and Base.create with no cast", () => {
    expectTypeOf(Post.where({ title: "x" }).new(params)).toEqualTypeOf<Post>();
    expectTypeOf(Post.where({ title: "x" }).create(params)).resolves.toEqualTypeOf<Post>();
    expectTypeOf(Post.create(params)).resolves.toEqualTypeOf<Post>();
  });

  it("is accepted by a collection build and a has-one build with no cast", () => {
    const author = new Author();
    expectTypeOf(author.posts.build(params)).toEqualTypeOf<Post>();
    const profile = author.association("profile") as HasOneAssociation;
    expectTypeOf(profile.build(params)).toEqualTypeOf<Base | null | Promise<Base | null>>();
  });
});
