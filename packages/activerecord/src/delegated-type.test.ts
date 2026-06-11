/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { registerModel } from "./index.js";
import { adapterType } from "./test-adapter.js";
import { StringInquirer } from "@blazetrails/activesupport";
import { defineSchema } from "./test-helpers/define-schema.js";
import { useHandlerFixtures } from "./test-helpers/use-handler-fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "./test-helpers/test-schema.js";
import { Base } from "./base.js";
import { delegatedType } from "./index.js";
// Canonical models — mirror Rails' `require "models/{account,entry,message,recipient,comment}"`.
// Entry carries both the `entryable` delegated_type (Message/Comment) and the
// `thing` delegated_type (Post) used by the custom-foreign_type cases.
import { Entry } from "./test-helpers/models/entry.js";
import { Message } from "./test-helpers/models/message.js";
import { Comment } from "./test-helpers/models/comment.js";
import { Account } from "./test-helpers/models/account.js";
import { Post } from "./test-helpers/models/post.js";

beforeAll(() => {
  vi.stubEnv("AR_NO_AUTO_SCHEMA", "1");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe("DelegatedTypeTest", () => {
  // Rails: `fixtures :comments, :accounts, :posts`. `{ schema }` recreates the
  // canonical fixture tables so the suite survives sibling-file contamination.
  const { comments, accounts, posts } = useHandlerFixtures(["comments", "accounts", "posts"], {
    schema: canonicalSchema,
  });

  // Entry/Message/Recipient aren't fixture-loaded (Rails builds them in setup),
  // so register them by name for polymorphic type resolution and create their
  // canonical tables.
  registerModel("Entry", Entry);
  registerModel("Message", Message);
  registerModel("Comment", Comment);
  registerModel("Account", Account);
  registerModel("Post", Post);

  beforeAll(async () => {
    await defineSchema({
      entries: canonicalSchema.entries,
      messages: canonicalSchema.messages,
      recipients: canonicalSchema.recipients,
    });
  });

  let entryWithMessage: Base;
  let entryWithComment: Base;
  let entryWithPost: Base;

  // Rails `setup do`.
  beforeEach(async () => {
    entryWithMessage = await Entry.create({
      entryable: Message.build({ subject: "Hello world!" }),
      account: accounts("signals37"),
    });
    entryWithComment = await Entry.create({
      entryable: comments("greetings"),
      account: accounts("signals37"),
    });
    entryWithPost = await Entry.create({
      thing: posts("welcome"),
      account: accounts("signals37"),
    });
  });

  it("delegated types", () => {
    expect((Entry as any).entryableTypes).toEqual(["Message", "Comment"]);
  });

  it("delegated class", () => {
    // Rails asserts the constantized class; trails' `entryableClass` returns the
    // foreign_type string instead (pre-existing divergence, #1583).
    expect((entryWithMessage as any).entryableClass).toBe("Message");
    expect((entryWithComment as any).entryableClass).toBe("Comment");
  });

  it("delegated class with custom foreign_type", () => {
    expect((entryWithMessage as any).thingClass).toBe("Message");
    expect((entryWithComment as any).thingClass).toBe("Comment");
    expect((entryWithPost as any).thingClass).toBe("Post");
  });

  it("delegated type name", () => {
    // Rails: entryable_name is an ActiveSupport::StringInquirer so
    // `entryable_name.message?` works in addition to string equality.
    expect(String((entryWithMessage as any).entryableName)).toBe("message");
    expect((entryWithMessage as any).entryableName).toBeInstanceOf(StringInquirer);
    expect((entryWithMessage as any).entryableName.message()).toBe(true);

    expect(String((entryWithComment as any).entryableName)).toBe("comment");
    expect((entryWithComment as any).entryableName.comment()).toBe(true);
  });

  it("delegated type predicates", () => {
    expect((entryWithMessage as any).isMessage()).toBe(true);
    expect((entryWithMessage as any).isComment()).toBe(false);

    expect((entryWithComment as any).isComment()).toBe(true);
    expect((entryWithComment as any).isMessage()).toBe(false);
  });

  it("delegated type predicates with custom foreign_type", () => {
    expect((entryWithPost as any).isPost()).toBe(true);
    expect((entryWithMessage as any).isPost()).toBe(false);
    expect((entryWithComment as any).isPost()).toBe(false);
  });

  it("scope", async () => {
    expect((await (Entry as any).messages().first()).isMessage()).toBe(true);
    expect((await (Entry as any).comments().first()).isComment()).toBe(true);
  });

  it("scope with custom foreign_type", async () => {
    expect((await (Entry as any).posts().first()).isPost()).toBe(true);
  });

  it("accessor", async () => {
    expect(await (entryWithMessage as any).message).toBeInstanceOf(Message);
    expect(await (entryWithMessage as any).comment).toBeNull();

    expect(await (entryWithComment as any).comment).toBeInstanceOf(Comment);
    expect(await (entryWithComment as any).message).toBeNull();
  });

  it("association id", () => {
    expect((entryWithMessage as any).messageId).toBe(
      entryWithMessage.readAttribute("entryable_id"),
    );
    expect((entryWithMessage as any).commentId).toBeNull();

    expect((entryWithComment as any).commentId).toBe(
      entryWithComment.readAttribute("entryable_id"),
    );
    expect((entryWithComment as any).messageId).toBeNull();
  });

  it.skipIf(adapterType !== "postgres")("association uuid", () => {
    // Mirrors Rails PostgreSQLDelegatedTypeTest#test_association_uuid.
    // UUID PK accessor naming: delegatedType with primaryKey: "uuid" and
    // foreignKey: "entryable_uuid" generates `uuidMessageUuid` / `uuidCommentUuid`
    // accessors (camelCase of ${singular}_${primaryKey}) instead of the default `Id` suffix.
    // No canonical uuid_* tables exist (Rails declares them under PostgreSQL only),
    // so this exercises accessor naming in-memory rather than the DB-backed setup.
    class UuidEntry extends Base {
      static {
        this.attribute("entryable_uuid", "string");
        this.attribute("entryable_type", "string");
      }
    }
    delegatedType(UuidEntry, "entryable", {
      types: ["UuidMessage", "UuidComment"],
      primaryKey: "uuid",
      foreignKey: "entryable_uuid",
    });

    const uuid1 = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
    const uuid2 = "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

    const entryWithMessageUuid = new UuidEntry({
      entryable_type: "UuidMessage",
      entryable_uuid: uuid1,
    });
    expect((entryWithMessageUuid as any).uuidMessageUuid).toBe(uuid1);
    expect((entryWithMessageUuid as any).uuidCommentUuid).toBeNull();

    const entryWithCommentUuid = new UuidEntry({
      entryable_type: "UuidComment",
      entryable_uuid: uuid2,
    });
    expect((entryWithCommentUuid as any).uuidCommentUuid).toBe(uuid2);
    expect((entryWithCommentUuid as any).uuidMessageUuid).toBeNull();
  });

  it.skip("touch account", () => {
    // BLOCKED: needs multi-hop `belongs_to … touch: true` propagation through a
    // polymorphic delegated_type owner (Rails chains Recipient → Message → Entry →
    // Account via `touch: true`) plus `travel`-based timestamp assertions; the
    // chained-touch path through the polymorphic `entryable` of a delegated_type
    // parent is unverified (audit-STI). Affects this single touch test.
  });

  it("builder method", () => {
    // Rails: Entry.new responds to build_entryable; Entry.new(entryable_type:
    // "Message").build_entryable returns a Message instance.
    expect(typeof (Entry.build({}) as any).buildEntryable).toBe("function");
    const built = (Entry.build({ entryable_type: "Message" }) as any).buildEntryable();
    expect(built).toBeInstanceOf(Message);
  });

  it("registers a polymorphic belongs_to for the delegated role", () => {
    const reflection = Entry._reflectOnAssociation("entryable");
    expect(reflection).not.toBeNull();
    expect((reflection as any).options?.polymorphic).toBe(true);
    expect((reflection as any).options?.foreignKey).toBe("entryable_id");
    expect((reflection as any).options?.foreignType).toBe("entryable_type");
  });

  // ── TS-specific coverage (no Rails counterpart): namespaced delegated types ──

  it("namespaced types", () => {
    // Rails: types: %w[Access::NoticeMessage] generates Entry.access_notice_messages
    // scope and @entry.access_notice_message accessor via type.tableize.tr("/", "_").
    class Entry3 extends Base {
      static {
        this.attribute("entryable_id", "integer");
        this.attribute("entryable_type", "string");
      }
    }
    class NoticeMsg extends Base {}
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
      }
    }
    registerModel("Access::NoticeMessage", AccessNoticeMessage);
    class Entry4 extends Base {
      static {
        this.attribute("entryable_id", "integer");
        this.attribute("entryable_type", "string");
      }
    }
    delegatedType(Entry4, "entryable", { types: ["Access::NoticeMessage"] });
    const e = new Entry4({ entryable_type: "Access::NoticeMessage" });
    const built = (e as any).buildEntryable({ body: "hi" });
    expect(built).toBeInstanceOf(AccessNoticeMessage);
    expect(e.entryable_type).toBe("Access::NoticeMessage");
    expect((e as any).isAccessNoticeMessage()).toBe(true);
  });
});
