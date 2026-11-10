import { beforeEach, describe, expect, it } from "vitest";
import { ArgumentError } from "@blazetrails/ruby-compat";
import { Mail, Message, Utilities } from "../../../lib/index.js";
import { POP3 } from "../../../lib/network/retriever-methods/pop3.js";
import { MockPOP3 } from "../../support/mock-pop3.js";

const raw = (m: unknown) => (m as Message).rawSource;
const list = (ms: unknown) => (ms as Message[]).map(raw);
const pops = () => MockPOP3.popmails().map((p) => p.pop());

describe("POP3 Retriever", () => {
  beforeEach(() => {
    Mail.defaults(function () {
      this.retrieverMethod("pop3", {
        address: "localhost",
        port: 995,
        userName: null,
        password: null,
        enableSsl: true,
      });
    });
  });

  describe("find with and without block", () => {
    it("should find all emails with a given block", () => {
      expect(MockPOP3.isStarted()).toBeFalsy();

      const messages: Message[] = [];
      Mail.all(null, (message) => {
        messages.push(message);
      });

      expect(list(messages).sort()).toEqual(pops().sort());
      expect(MockPOP3.isStarted()).toBeFalsy();
    });

    it("should get all emails without a given block", () => {
      expect(MockPOP3.isStarted()).toBeFalsy();

      const messages = Mail.all();

      expect(list(messages).sort()).toEqual(pops().sort());
      expect(MockPOP3.isStarted()).toBeFalsy();
    });
  });

  describe("find and options", () => {
    it("should work with a frozen hash argument", () => {
      const messages = Mail.find(
        Object.freeze({ count: "all", what: "last", order: "asc" } as const),
      );
      expect(list(messages).sort()).toEqual(pops());
    });

    it("should handle the :count option", () => {
      let messages = Mail.find({ count: "all", what: "last", order: "asc" });
      expect(list(messages).sort()).toEqual(pops());

      const message = Mail.find({ count: 1, what: "last" });
      expect(raw(message)).toBe(pops().at(-1));

      messages = Mail.find({ count: 2, what: "last", order: "asc" });
      expect(list(messages).slice(0, 2)).toEqual(pops().slice(-2));
    });

    it("should handle the :what option", () => {
      let messages = Mail.find({ count: "all", what: "last" });
      expect(list(messages).sort()).toEqual(pops());

      messages = Mail.find({ count: 2, what: "first", order: "asc" });
      expect(list(messages)).toEqual(pops().slice(0, 2));
    });

    it("should handle the :order option", () => {
      let messages = Mail.find({ order: "desc", count: 5, what: "last" });
      expect(list(messages)).toEqual(pops().slice(-5).reverse());

      messages = Mail.find({ order: "asc", count: 5, what: "last" });
      expect(list(messages)).toEqual(pops().slice(-5));
    });

    it("should find the last 10 messages by default", () => {
      const messages = Mail.find();

      expect((messages as unknown[]).length).toBe(10);
    });

    it("should handle the delete_after_find option", () => {
      Mail.find({ deleteAfterFind: false });
      MockPOP3.popmails().forEach((message) => expect(message.isDeleted()).toBeFalsy());

      Mail.find({ deleteAfterFind: true });
      MockPOP3.popmails()
        .slice(0, 10)
        .forEach((message) => expect(message.isDeleted()).toBeTruthy());
      MockPOP3.popmails()
        .slice(-10)
        .forEach((message) => expect(message.isDeleted()).toBeFalsy());

      Mail.find({ deleteAfterFind: true }, () => {});
      MockPOP3.popmails()
        .slice(0, 10)
        .forEach((message) => expect(message.isDeleted()).toBeTruthy());
      MockPOP3.popmails()
        .slice(-10)
        .forEach((message) => expect(message.isDeleted()).toBeFalsy());
    });

    it("should handle the find_and_delete method", () => {
      Mail.findAndDelete({ count: 15 });
      MockPOP3.popmails()
        .slice(0, 15)
        .forEach((message) => expect(message.isDeleted()).toBeTruthy());
      MockPOP3.popmails()
        .slice(-5)
        .forEach((message) => expect(message.isDeleted()).toBeFalsy());
    });
  });

  describe("last", () => {
    it("should find the last received messages", () => {
      const messages = Mail.last({ count: 5 });

      expect(messages).toBeInstanceOf(Array);
      expect(list(messages)).toEqual(pops().slice(-5));
    });

    it("should find the last received message", () => {
      const message = Mail.last();

      expect(message).toBeInstanceOf(Message);
      expect(raw(message)).toBe(MockPOP3.popmails().at(-1)!.pop());
    });
  });

  describe("first", () => {
    it("should find the first received messages", () => {
      const messages = Mail.first({ count: 5 });

      expect(messages).toBeInstanceOf(Array);
      expect(list(messages)).toEqual(pops().slice(0, 5));
    });

    it("should find the first received message", () => {
      const message = Mail.first();

      expect(message).toBeInstanceOf(Message);
      expect(raw(message)).toBe(MockPOP3.popmails()[0].pop());
    });
  });

  describe("all", () => {
    it("should find all messages", () => {
      const messages = Mail.all();

      expect((messages as unknown[]).length).toBe(MockPOP3.popmails().length);
      expect(list(messages)).toEqual(pops());
    });
  });

  describe("delete_all", () => {
    it("should delete all mesages", () => {
      Mail.all();
      Mail.deleteAll();

      expect(MockPOP3.popmails().length).toBe(0);
    });
  });

  describe("connection", () => {
    it("should raise an Error if no block is given", () => {
      expect(() =>
        Mail.connection(() => {
          throw new ArgumentError();
        }),
      ).toThrow(ArgumentError);
    });
    it("should yield the connection object to the given block", () => {
      Mail.connection((connection) => {
        expect(connection).toBeInstanceOf(MockPOP3);
      });
    });
  });

  describe("handling of options", () => {
    it("should set default options", () => {
      const retrievable = new POP3({});
      const options = retrievable["validateOptions"]({});

      expect(Utilities.isBlank(options.count)).toBeFalsy();
      expect(options.count).toBe(10);

      expect(Utilities.isBlank(options.order)).toBeFalsy();
      expect(options.order).toBe("asc");

      expect(Utilities.isBlank(options.what)).toBeFalsy();
      expect(options.what).toBe("first");
    });

    it("should not replace given configuration", () => {
      const retrievable = new POP3({});
      const options = retrievable["validateOptions"]({
        count: 2,
        order: "asc",
        what: "first",
      });

      expect(Utilities.isBlank(options.count)).toBeFalsy();
      expect(options.count).toBe(2);

      expect(Utilities.isBlank(options.order)).toBeFalsy();
      expect(options.order).toBe("asc");

      expect(Utilities.isBlank(options.what)).toBeFalsy();
      expect(options.what).toBe("first");
    });
  });

  describe("error handling", () => {
    it("should finish the POP3 connection is an exception is raised", () => {
      expect(MockPOP3.isStarted()).toBeFalsy();

      expect(() =>
        Mail.all(null, () => {
          throw new ArgumentError();
        }),
      ).toThrow(ArgumentError);

      expect(MockPOP3.isStarted()).toBeFalsy();
    });
  });

  describe("read_timeout option", () => {
    it("should override the POP3 default read_timeout", () => {
      Mail.defaults(function () {
        this.retrieverMethod("pop3", {
          address: "localhost",
          port: 995,
          userName: null,
          password: null,
          enableSsl: true,
          readTimeout: 200,
        });
      });

      (Mail.retrieverMethod() as unknown as POP3)["start"](
        undefined,
        (pop3: { readTimeout: unknown }) => {
          expect(pop3.readTimeout).toBe(200);
        },
      );
    });
  });
});
