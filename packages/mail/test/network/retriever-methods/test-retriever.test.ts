import type {} from "@blazetrails/vitest-matchers";
import { beforeEach, describe, expect, it } from "vitest";
import { Mail } from "../../../lib/index.js";
import type { Message } from "../../../lib/message.js";
import { TestRetriever } from "../../../lib/network/retriever-methods/test-retriever.js";

describe("Test Retriever", () => {
  beforeEach(() => {
    Mail.defaults(function () {
      this.retrieverMethod("test");
    });
  });

  it("should have no emails initially", () => {
    expect(Mail.all()).toBeEmpty();
  });

  describe("all", () => {
    let emails: Message[];
    beforeEach(() => {
      emails = populate(15);
    });

    it("should return all emails without a block", () => {
      expect(Mail.all()).toEqual(emails);
    });

    it("should return all emails with a block", () => {
      const messages: Message[] = [];
      Mail.all(null, (message) => messages.push(message));
      expect(messages).toEqual(emails);
    });
  });

  describe("find", () => {
    let emails: Message[];
    beforeEach(() => {
      emails = populate(15);
    });

    it("should work with frozen hash arguments", () => {
      expect(Mail.find(Object.freeze({ count: 1 }))).toBe(emails[0]);
      expect(Mail.first(Object.freeze({}))).toBe(emails[0]);
      expect(Mail.last(Object.freeze({}))).toBe(emails.at(-1));
      expect(Mail.all(Object.freeze({}))).toEqual(emails);
      expect(Mail.findAndDelete(Object.freeze({}))).toEqual(emails);
    });

    it("should handle the :count option", () => {
      expect(Mail.find({ count: "all" })).toEqual(emails);
      expect(Mail.find({ count: 1 })).toBe(emails[0]);
      expect(Mail.find({ count: 5 })).toEqual(emails.slice(0, 5));
    });

    it("should handle the :order option", () => {
      expect(Mail.find({ order: "asc" })).toEqual(emails);
      expect(Mail.find({ order: "desc" })).toEqual([...emails].reverse());
    });

    it("should handle the :what option", () => {
      expect(Mail.find({ what: "first" })).toEqual(emails);
      expect(Mail.find({ what: "first", count: 5 })).toEqual(emails.slice(0, 5));
      expect(Mail.find({ what: "last" })).toEqual(emails);
      expect(Mail.find({ what: "last", count: 5 })).toEqual(emails.slice(10, 15));
    });

    it("should handle the both of :what and :order option with :count => 1", () => {
      expect(Mail.find({ count: 1, what: "last", order: "asc" })).toBe(emails.at(-1));
      expect(Mail.find({ count: 1, what: "first", order: "desc" })).toBe(emails[0]);
    });

    it("should handle the :delete_after_find option", () => {
      expect(Mail.find({ deleteAfterFind: false })).toEqual(emails);
      expect(Mail.find({ deleteAfterFind: false })).toEqual(emails);
      expect(Mail.find({ deleteAfterFind: true })).toEqual(emails);
      expect(Mail.find({ deleteAfterFind: false })).toBeEmpty();
    });

    it("should handle the both of :delete_after_find and :count option", async () => {
      await expect(() => {
        expect((Mail.find({ count: 5, deleteAfterFind: true }) as Message[]).length).toEqual(5);
      }).toChange(() => (Mail.all() as Message[]).length, { by: -5 });
      await expect(() => {
        expect((Mail.find({ count: 5, deleteAfterFind: true }) as Message[]).length).toEqual(5);
      }).toChange(() => (Mail.all() as Message[]).length, { by: -5 });
    });

    it("should handle the :delete_after_find option with messages marked not for delete", () => {
      let i = 0;
      const messages: Message[] = [];
      Mail.find({ deleteAfterFind: true }, (message) => {
        if (i % 2 === 0) {
          message.setMarkForDelete(false);
          messages.push(message);
        }
        i += 1;
      });
      expect(Mail.all()).toEqual(messages);
    });
  });

  function populate(count: number): Message[] {
    const emails = Array.from({ length: count }, () =>
      Mail.new(function (this: Message) {
        this.setTo("mikel@me.com");
        this.setFrom("you@you.com");
        this.setSubject("testing");
        this.setBody("hello");
      }),
    );
    TestRetriever.emails = [...emails];
    return emails;
  }
});
