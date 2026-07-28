/**
 * trails-only extras for `associations/callbacks.test.ts`. Rails' own
 * `AssociationCallbacksTest` has no coverage for the object-callback arm of
 * `Builder::CollectionAssociation.define_callback`
 * (builder/collection_association.rb:51), so this guards it here rather than
 * under a Rails test name.
 */
import { describe, it, expect } from "vitest";
import { Base, association, registerModel } from "../index.js";
import type { Base as BaseRecord } from "../base.js";

import { fixtures } from "../test-fixtures.js";
import { Author } from "../test-helpers/models/author.js";
import { Post } from "../test-helpers/models/post.js";

registerModel(Author);
registerModel(Post);

describe("association callbacks — object callbacks (trails)", () => {
  fixtures({});

  it("dispatches the callback kind as a method on an object callback", async () => {
    const log: string[] = [];
    // Rails' third `define_callback` arm: a callback that is neither a Symbol
    // nor a Proc responds to the callback kind itself —
    // `callback.send(method, owner, record)`.
    const auditor = {
      beforeAdd(_owner: BaseRecord, record: BaseRecord) {
        log.push(`beforeAdd:${(record as unknown as { title: string }).title}`);
      },
      afterAdd(_owner: BaseRecord, record: BaseRecord) {
        log.push(`afterAdd:${(record as unknown as { title: string }).title}`);
      },
    };

    class ObjectCbAuthor extends Base {
      static {
        this.tableName = "authors";
        this.attribute("name", "string");
        this.hasMany("posts", {
          className: "Post",
          foreignKey: "author_id",
          beforeAdd: auditor,
          afterAdd: auditor,
        });
      }
    }
    registerModel("ObjectCbAuthor", ObjectCbAuthor);

    const author = await ObjectCbAuthor.create({ name: "David" });
    const proxy = association(author, "posts");
    await proxy.push(new Post({ title: "Hello", body: "Body", author_id: author.id }));

    expect(log).toEqual(["beforeAdd:Hello", "afterAdd:Hello"]);
  });
});
