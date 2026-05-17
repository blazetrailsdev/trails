/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from "vitest";
import { Base, delegatedType, registerModel } from "./index.js";
import { StringInquirer } from "@blazetrails/activesupport";

import { createTestAdapter } from "./test-adapter.js";
import type { DatabaseAdapter } from "./adapter.js";
import { defineSchema } from "./test-helpers/define-schema.js";
import { dropAllTables } from "./test-helpers/drop-all-tables.js";

// -- Helpers --
function freshAdapter(): DatabaseAdapter {
  return createTestAdapter();
}

beforeAll(() => {
  vi.stubEnv("AR_NO_AUTO_SCHEMA", "1");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe("DelegatedTypeTest", () => {
  let adapter: DatabaseAdapter;
  beforeEach(async () => {
    adapter = freshAdapter();
    await defineSchema(adapter, {
      entries: { entryable_id: "integer", entryable_type: "string", title: "string" },
      entry2s: { title: "string", custom_type: "string", custom_id: "integer" },
    });
  });

  afterAll(async () => {
    await dropAllTables(adapter);
  });

  function makeModels() {
    class Entry extends Base {
      static {
        this.attribute("entryable_id", "integer");
        this.attribute("entryable_type", "string");
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    delegatedType(Entry, "entryable", { types: ["Message", "Comment"] });
    return { Entry };
  }

  it("delegated types", () => {
    const { Entry } = makeModels();
    expect((Entry as any).entryableTypes).toEqual(["Message", "Comment"]);
  });

  it("delegated class", () => {
    const { Entry } = makeModels();
    const e = new Entry({ entryable_type: "Message", entryable_id: 1 });
    expect((e as any).entryableClass).toBe("Message");
  });

  it("delegated class with custom foreign_type", () => {
    class Entry2 extends Base {
      static {
        this.attribute("custom_type", "string");
        this.attribute("custom_id", "integer");
        this.adapter = adapter;
      }
    }
    delegatedType(Entry2, "entryable", {
      types: ["Message"],
      foreignType: "custom_type",
      foreignKey: "custom_id",
    });
    const e = new Entry2({ custom_type: "Message", custom_id: 1 });
    expect((e as any).entryableClass).toBe("Message");
  });

  it("delegated type name", () => {
    const { Entry } = makeModels();
    const e = new Entry({ entryable_type: "Message", entryable_id: 1 });
    // Rails: entryable_name is an ActiveSupport::StringInquirer so
    // `entryable_name.message?` works in addition to string equality.
    expect(String((e as any).entryableName)).toBe("message");
    expect((e as any).entryableName).toBeInstanceOf(StringInquirer);
    expect((e as any).entryableName.message()).toBe(true);
    expect((e as any).entryableName.comment()).toBe(false);
  });

  it("delegated type predicates", () => {
    const { Entry } = makeModels();
    const e = new Entry({ entryable_type: "Message", entryable_id: 1 });
    expect((e as any).isMessage()).toBe(true);
    expect((e as any).isComment()).toBe(false);
  });

  it("delegated type predicates with custom foreign_type", () => {
    class Entry2 extends Base {
      static {
        this.attribute("custom_type", "string");
        this.attribute("custom_id", "integer");
        this.adapter = adapter;
      }
    }
    delegatedType(Entry2, "entryable", {
      types: ["Message", "Comment"],
      foreignType: "custom_type",
      foreignKey: "custom_id",
    });
    const e = new Entry2({ custom_type: "Comment", custom_id: 1 });
    expect((e as any).isComment()).toBe(true);
    expect((e as any).isMessage()).toBe(false);
  });

  it("scope", async () => {
    const { Entry } = makeModels();
    await Entry.create({ title: "a", entryable_type: "Message", entryable_id: 1 });
    await Entry.create({ title: "b", entryable_type: "Comment", entryable_id: 2 });
    const messages = await (Entry as any).messages().toArray();
    expect(messages.length).toBe(1);
    expect(messages[0].title).toBe("a");
  });

  it("scope with custom foreign_type", async () => {
    class Entry2 extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("custom_type", "string");
        this.attribute("custom_id", "integer");
        this.adapter = adapter;
      }
    }
    delegatedType(Entry2, "entryable", {
      types: ["Message", "Comment"],
      foreignType: "custom_type",
      foreignKey: "custom_id",
    });
    await Entry2.create({ title: "a", custom_type: "Message", custom_id: 1 });
    await Entry2.create({ title: "b", custom_type: "Comment", custom_id: 2 });
    const comments = await (Entry2 as any).comments().toArray();
    expect(comments.length).toBe(1);
    expect(comments[0].title).toBe("b");
  });

  it("accessor", () => {
    // Rails: @entry.message returns the associated record (a Message
    // instance) via the polymorphic belongs_to accessor, not the FK value.
    class Message extends Base {
      static {
        this.attribute("id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel("Message", Message);
    const { Entry } = makeModels();
    const e = new Entry({ entryable_type: "Message", entryable_id: 42 });
    const msg = new Message({ id: 42 });
    (e as any).entryable = msg;
    expect((e as any).message).toBe(msg);
    expect((e as any).comment).toBeNull();
  });

  it("association id", () => {
    const { Entry } = makeModels();
    const eMsg = new Entry({ entryable_type: "Message", entryable_id: 99 });
    expect(eMsg.entryable_id).toBe(99);
    expect((eMsg as any).messageId).toBe(99);
    expect((eMsg as any).commentId).toBeNull();

    const eCmt = new Entry({ entryable_type: "Comment", entryable_id: 42 });
    expect((eCmt as any).commentId).toBe(42);
    expect((eCmt as any).messageId).toBeNull();
  });

  it("association uuid", () => {
    // Mirrors Rails PostgreSQLDelegatedTypeTest#test_association_uuid.
    // UUID PK accessor naming: delegatedType with primaryKey: "uuid" and
    // foreignKey: "entryable_uuid" generates `uuidMessageUuid` / `uuidCommentUuid`
    // accessors (camelCase of ${singular}_${primaryKey}) instead of the default `Id` suffix.
    class UuidEntry extends Base {
      static {
        this.attribute("entryable_uuid", "string");
        this.attribute("entryable_type", "string");
        this.adapter = adapter;
      }
    }
    delegatedType(UuidEntry, "entryable", {
      types: ["UuidMessage", "UuidComment"],
      primaryKey: "uuid",
      foreignKey: "entryable_uuid",
    });

    const uuid1 = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
    const uuid2 = "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

    const entryWithMessage = new UuidEntry({
      entryable_type: "UuidMessage",
      entryable_uuid: uuid1,
    });
    expect((entryWithMessage as any).uuidMessageUuid).toBe(uuid1);
    expect((entryWithMessage as any).uuidCommentUuid).toBeNull();

    const entryWithComment = new UuidEntry({
      entryable_type: "UuidComment",
      entryable_uuid: uuid2,
    });
    expect((entryWithComment as any).uuidCommentUuid).toBe(uuid2);
    expect((entryWithComment as any).uuidMessageUuid).toBeNull();
  });

  it.skip("touch account", () => {
    // BLOCKED: fixture + delegated-type touch chain — needs Recipient/Account fixtures + multi-hop `belongs_to … touch: true` propagation through a polymorphic delegated_type owner; no STI routing gap (audit-STI)
    // ROOT-CAUSE: missing Recipient/Account test-models for this file, plus an unverified path through `associations/builder/belongs-to.ts#touchParent` when the touched owner is the polymorphic `entryable` of a delegated_type parent (Rails chains Recipient → Message → Entry → Account via `touch: true`)
    // SCOPE: ~20–30 LOC fixture-models in delegated-type.test.ts; if the chained-touch path also needs work, follow-up in associations/builder/belongs-to.ts; affects this single delegated-type touch test
  });

  it("builder method", () => {
    // Rails: Entry.new(entryable_type: "Message").build_entryable returns
    // a Message instance — the role-level builder dispatches on the
    // currently-set foreign_type rather than baking the type into the name.
    class Message extends Base {
      static {
        this.attribute("subject", "string");
        this.adapter = adapter;
      }
    }
    registerModel("Message", Message);
    const { Entry } = makeModels();
    const e = new Entry({ entryable_type: "Message" });
    const built = (e as any).buildEntryable({ subject: "hi" });
    expect(built).toBeInstanceOf(Message);
    expect(built.subject).toBe("hi");
    // Writer side-effects: role association is set and reads back as the
    // same instance, foreign_type is preserved by the polymorphic writer.
    expect((e as any).entryable).toBe(built);
    expect(e.entryable_type).toBe("Message");
  });

  it("namespaced types", () => {
    // Rails: types: %w[Access::NoticeMessage] generates Entry.access_notice_messages
    // scope and @entry.access_notice_message accessor via type.tableize.tr("/", "_").
    class Entry3 extends Base {
      static {
        this.attribute("entryable_id", "integer");
        this.attribute("entryable_type", "string");
        this.adapter = adapter;
      }
    }
    class NoticeMsg extends Base {
      static {
        this.adapter = adapter;
      }
    }
    registerModel("Access::NoticeMessage", NoticeMsg);
    delegatedType(Entry3, "entryable", { types: ["Access::NoticeMessage"] });
    expect(typeof (Entry3 as any).accessNoticeMessages).toBe("function");
    const e = new Entry3({ entryable_type: "Access::NoticeMessage", entryable_id: 7 });
    expect((e as any).isAccessNoticeMessage()).toBe(true);
    expect((e as any).accessNoticeMessageId).toBe(7);
    // The per-type singular accessor mirrors Rails: returns the role
    // association reader when the foreign_type matches, otherwise null.
    const target = new NoticeMsg();
    (e as any).entryable = target;
    expect((e as any).accessNoticeMessage).toBe(target);
    // entryableName also tracks the full namespaced form.
    expect(String((e as any).entryableName)).toBe("access_notice_message");
  });

  it("buildEntryable preserves namespaced foreign_type", () => {
    // Rails BelongsToPolymorphicAssociation stores record.class.polymorphic_name
    // (the Ruby class name, including "::"). JS class names can't carry "::",
    // so the writer must prefer the registry key the class was registered
    // under — otherwise buildEntryable on a namespaced type clobbers
    // entryable_type from "Access::NoticeMessage" to "AccessNoticeMessage"
    // and breaks the generated predicates/scope/accessor.
    class AccessNoticeMessage extends Base {
      static {
        this.attribute("body", "string");
        this.adapter = adapter;
      }
    }
    registerModel("Access::NoticeMessage", AccessNoticeMessage);
    class Entry4 extends Base {
      static {
        this.attribute("entryable_id", "integer");
        this.attribute("entryable_type", "string");
        this.adapter = adapter;
      }
    }
    delegatedType(Entry4, "entryable", { types: ["Access::NoticeMessage"] });
    const e = new Entry4({ entryable_type: "Access::NoticeMessage" });
    const built = (e as any).buildEntryable({ body: "hi" });
    expect(built).toBeInstanceOf(AccessNoticeMessage);
    expect(e.entryable_type).toBe("Access::NoticeMessage");
    expect((e as any).isAccessNoticeMessage()).toBe(true);
  });

  it("registers a polymorphic belongs_to for the delegated role", () => {
    const { Entry } = makeModels();
    const reflection = Entry._reflectOnAssociation("entryable");
    expect(reflection).not.toBeNull();
    expect((reflection as any).options?.polymorphic).toBe(true);
    expect((reflection as any).options?.foreignKey).toBe("entryable_id");
    expect((reflection as any).options?.foreignType).toBe("entryable_type");
  });
});
