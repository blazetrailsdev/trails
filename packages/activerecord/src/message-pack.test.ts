import { describe, it } from "vitest";
import { assertEqual, assertRaises, assertSame } from "@blazetrails/activesupport";
import {
  Extensions as ActiveSupportExtensions,
  Factory,
  MissingClassError,
} from "@blazetrails/activesupport/message-pack";
import { Marshal } from "@blazetrails/ruby-compat";
import { registerModel } from "./index.js";
import { Extensions } from "./message-pack.js";
import { fixtures } from "./test-fixtures.js";
import { assertNoQueries } from "./testing/query-assertions.js";
import type { Author } from "./test-helpers/models/author.js";
import { Binary } from "./test-helpers/models/binary.js";
import type { Comment } from "./test-helpers/models/comment.js";
import { Post } from "./test-helpers/models/post.js";

registerModel(Binary);

describe("ActiveRecordMessagePackTest", () => {
  fixtures(["posts", "comments", "authors", "authorAddresses"]);

  let _serializer: Factory | undefined;

  function serializer(): Factory {
    if (_serializer === undefined) {
      const factory = new Factory();
      Extensions.install(factory);
      ActiveSupportExtensions.install(factory);
      ActiveSupportExtensions.installUnregisteredTypeError(factory);
      _serializer = factory;
    }
    return _serializer;
  }

  function createAuthorBang(post: Post, attributes: object): Promise<Author> {
    return (
      post as unknown as { createAuthorBang(attributes: object): Promise<Author> }
    ).createAuthorBang(attributes);
  }

  function roundtrip<T>(input: T): T {
    return serializer().load(serializer().dump(input)) as T;
  }

  it("enshrines type IDs", () => {
    const expected = {
      119: "ActiveModel::Type::Binary::Data",
      120: "ActiveRecord::Base",
    };

    const factory = new Factory();
    Extensions.install(factory);
    const actual = Object.fromEntries(
      factory.registeredTypes().map((entry) => [entry.type, entry.klass]),
    );

    assertEqual(expected, actual);
  });

  it("roundtrips record and cached associations", async () => {
    const post = await Post.createBang({ title: "A Title", body: "A body." });
    await createAuthorBang(post, { name: "An Author" });
    await post.comments.createBang({ body: "A comment." });
    await post.comments.createBang({ body: "Another comment.", author: post.author });
    await post.comments.load();

    await assertNoQueries(false, () => {
      const roundtrippedPost = roundtrip(post);

      assertEqual(post, roundtrippedPost);
      assertEqual(post.author, roundtrippedPost.author);
      assertEqual(post.comments.target, roundtrippedPost.comments.target);
      assertEqual(
        post.comments.target.map((c: Comment) => c.author),
        roundtrippedPost.comments.target.map((c: Comment) => c.author),
      );

      assertSame(roundtrippedPost, roundtrippedPost.comments.target[0].post);
      assertSame(roundtrippedPost, roundtrippedPost.comments.target[1].post);
      assertSame(roundtrippedPost.author, roundtrippedPost.comments.target[1].author);
    });
  });

  it("roundtrips new_record? status", async () => {
    const post = new Post({ title: "A Title", body: "A body." });
    await createAuthorBang(post, { name: "An Author" });

    await assertNoQueries(false, () => {
      const roundtrippedPost = roundtrip(post);

      assertEqual(post.attributes, roundtrippedPost.attributes);
      assertEqual(post.isNewRecord(), roundtrippedPost.isNewRecord());
      assertEqual(post.author, roundtrippedPost.author);
      assertEqual(
        (post.author as Author).isNewRecord(),
        (roundtrippedPost.author as Author).isNewRecord(),
      );
    });
  });

  it("roundtrips binary attribute", () => {
    const binary = new Binary({ data: Marshal.dump("data") });
    assertEqual(binary.attributes, roundtrip(binary).attributes);
  });

  it("raises ActiveSupport::MessagePack::MissingClassError if record class no longer exists", async () => {
    const klass = class extends Post {};
    Object.defineProperty(klass, "name", { value: "SomeLegacyClass" });
    const dumped = serializer().dump(new klass({ title: "A Title", body: "A body." }));

    await assertRaises([MissingClassError], {}, () => {
      serializer().load(dumped);
    });
  });
});
