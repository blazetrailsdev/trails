import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { registerModel } from "./index.js";
import { Module, registerConstant, rbModConstSet } from "@blazetrails/ruby-compat";
import { fixtures } from "./test-helpers/use-fixtures.js";
import { Base } from "./base.js";
import { Entry } from "./test-helpers/models/entry.js";

beforeAll(() => {
  vi.stubEnv("AR_NO_AUTO_SCHEMA", "1");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

interface NamespacedEntry {
  entryable: Base;
  entryableName: unknown;
  accessNoticeMessage: Base;
  accessNoticeMessageId: number;
  isAccessNoticeMessage(): boolean;
  buildEntryable(attributes?: Record<string, unknown>): Base;
}

describe("DelegatedTypeTest (trails)", () => {
  fixtures([]);

  it("registers a polymorphic belongs_to for the delegated role", () => {
    const reflection = Entry._reflectOnAssociation("entryable") as unknown as {
      options: { polymorphic?: boolean };
      foreignKey(): string;
      foreignType: string;
    } | null;
    expect(reflection).not.toBeNull();
    expect(reflection!.options?.polymorphic).toBe(true);
    expect(reflection!.foreignKey()).toBe("entryable_id");
    expect(reflection!.foreignType).toBe("entryable_type");
  });

  it("namespaced types", () => {
    class Entry3 extends Base {
      static {
        this.attribute("entryable_id", "integer");
        this.attribute("entryable_type", "string");
      }
    }
    const Access = new Module();
    registerConstant("Access", Access);
    class NoticeMessage extends Base {
      static {
        rbModConstSet(Access, "NoticeMessage", this);
      }
    }
    registerModel(NoticeMessage);
    Entry3.delegatedType("entryable", { types: ["Access::NoticeMessage"] });
    expect(
      typeof (Entry3 as unknown as { accessNoticeMessages: unknown }).accessNoticeMessages,
    ).toBe("function");
    const e = new Entry3({
      entryable_type: "Access::NoticeMessage",
      entryable_id: 7,
    }) as unknown as NamespacedEntry;
    expect(e.isAccessNoticeMessage()).toBe(true);
    expect(e.accessNoticeMessageId).toBe(7);
    const target = new NoticeMessage();
    e.entryable = target;
    expect(e.accessNoticeMessage).toBe(target);
    expect(String(e.entryableName)).toBe("access_notice_message");
  });

  it("buildEntryable preserves namespaced foreign_type", () => {
    const Access = new Module();
    registerConstant("Access", Access);
    class NoticeMessage extends Base {
      static {
        rbModConstSet(Access, "NoticeMessage", this);
      }
      static {
        this.attribute("body", "string");
      }
    }
    registerModel(NoticeMessage);
    class Entry4 extends Base {
      declare entryable_type: string;
      static {
        this.attribute("entryable_id", "integer");
        this.attribute("entryable_type", "string");
      }
    }
    Entry4.delegatedType("entryable", { types: ["Access::NoticeMessage"] });
    const e = new Entry4({ entryable_type: "Access::NoticeMessage" });
    const built = (e as unknown as NamespacedEntry).buildEntryable({ body: "hi" });
    expect(built).toBeInstanceOf(NoticeMessage);
    expect(e.entryable_type).toBe("Access::NoticeMessage");
    expect((e as unknown as NamespacedEntry).isAccessNoticeMessage()).toBe(true);
  });
});
