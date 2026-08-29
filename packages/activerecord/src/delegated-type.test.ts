import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { registerModel } from "./index.js";
import { adapterType } from "./test-adapter.js";
import { StringInquirer, travel, travelBack } from "@blazetrails/activesupport";
import { fixtures } from "./test-fixtures.js";
import { Base } from "./base.js";
import { delegatedType } from "./index.js";
import { Entry } from "./test-helpers/models/entry.js";
import { Message } from "./test-helpers/models/message.js";
import { Comment } from "./test-helpers/models/comment.js";
import { Account } from "./test-helpers/models/account.js";
import { Post } from "./test-helpers/models/post.js";
import { Recipient } from "./test-helpers/models/recipient.js";

beforeAll(() => {
  vi.stubEnv("AR_NO_AUTO_SCHEMA", "1");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe("DelegatedTypeTest", () => {
  const { comments, accounts, posts } = fixtures(["comments", "accounts", "posts"]);

  registerModel("Entry", Entry);
  registerModel("Message", Message);
  registerModel("Comment", Comment);
  registerModel("Account", Account);
  registerModel("Post", Post);
  registerModel("Recipient", Recipient);

  let entryWithMessage: Base;
  let entryWithComment: Base;
  let entryWithPost: Base;

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
    expect((entryWithMessage as any).entryableClass).toBe(Message);
    expect((entryWithComment as any).entryableClass).toBe(Comment);
  });

  it("delegated class with custom foreign_type", () => {
    expect((entryWithMessage as any).thingClass).toBe(Message);
    expect((entryWithComment as any).thingClass).toBe(Comment);
    expect((entryWithPost as any).thingClass).toBe(Post);
  });

  it("delegated type name", () => {
    expect(String((entryWithMessage as any).entryableName)).toBe("message");
    expect((entryWithMessage as any).entryableName).toBeInstanceOf(StringInquirer);
    expect((entryWithMessage as any).entryableName["message?"]()).toBe(true);

    expect(String((entryWithComment as any).entryableName)).toBe("comment");
    expect((entryWithComment as any).entryableName["comment?"]()).toBe(true);
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

  it("touch account", async () => {
    const message = await (entryWithMessage as any).loadBelongsTo("entryable");
    const account = await (entryWithMessage as any).loadBelongsTo("account");
    const previousAccountUpdatedAt = account.updated_at;
    const previousEntryUpdatedAt = (entryWithMessage as any).updated_at;
    const previousMessageUpdatedAt = message.updated_at;

    travel(5000);
    try {
      await Recipient.create({ message, email_address: "test@test.com" });
    } finally {
      travelBack();
    }

    const reloadedEntry = await Entry.find(entryWithMessage.id!);
    expect((await (reloadedEntry as any).loadBelongsTo("account")).updated_at).not.toEqual(
      previousAccountUpdatedAt,
    );
    expect((reloadedEntry as any).updated_at).not.toEqual(previousEntryUpdatedAt);
    expect((await (reloadedEntry as any).loadBelongsTo("entryable")).updated_at).not.toEqual(
      previousMessageUpdatedAt,
    );
  });

  it("builder method", () => {
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

  it("namespaced types", () => {
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
    const target = new NoticeMsg();
    (e as any).entryable = target;
    expect((e as any).accessNoticeMessage).toBe(target);
    expect(String((e as any).entryableName)).toBe("access_notice_message");
  });

  it("buildEntryable preserves namespaced foreign_type", () => {
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
