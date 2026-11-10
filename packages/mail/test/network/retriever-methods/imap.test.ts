import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ArgumentError, TopLevel } from "@blazetrails/ruby-compat";
import { Mail, Utilities } from "../../../lib/index.js";
import type { Message } from "../../../lib/message.js";
import { IMAP } from "../../../lib/network/retriever-methods/imap.js";
import { MockIMAP, NetIMAP } from "../../support/mock-imap.js";

const raw = (m: unknown) => (m as Message).rawSource;
const list = (ms: unknown) => (ms as Message[]).map(raw);
const examples = () => MockIMAP.examples().map((m) => m.attr["RFC822"]);
const Net = TopLevel.Net as { IMAP?: unknown };

describe("IMAP Retriever", () => {
  beforeEach(() => {
    Mail.defaults(function () {
      this.retrieverMethod("imap", {
        address: "localhost",
        port: 993,
        userName: null,
        password: null,
        enableSsl: true,
        enableStarttls: false,
      });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Net.IMAP = NetIMAP;
  });

  describe("find with and without block", () => {
    it("should find all emails with a given block", () => {
      expect(MockIMAP.isDisconnected()).toBe(true);

      const messages: Message[] = [];
      Mail.all(null, (message) => {
        messages.push(message);
      });
      expect(list(messages).sort()).toEqual(examples().sort());

      expect(MockIMAP.isDisconnected()).toBe(true);
    });
    it("should get all emails without a given block", () => {
      expect(MockIMAP.isDisconnected()).toBe(true);

      const messages = Mail.all();
      expect(list(messages).sort()).toEqual(examples().sort());

      expect(MockIMAP.isDisconnected()).toBe(true);
    });

    it("should get all emails and yield the imap, uid, and email when given a block of arity 3", () => {
      expect(MockIMAP.isDisconnected()).toBe(true);

      const messages: Message[] = [];
      const uids: number[] = [];
      Mail.all(null, ((message: Message, imap: unknown, uid: number) => {
        expect(imap).toBeInstanceOf(MockIMAP);
        messages.push(message);
        uids.push(uid);
      }) as (email: Message) => unknown);

      expect(list(messages).sort()).toEqual(examples().sort());
      expect(uids.sort((a, b) => a - b)).toEqual(MockIMAP.examples().map((m) => m.number));

      expect(MockIMAP.isDisconnected()).toBe(true);
    });

    it("should get all emails and yield the imap, uid, flag, and email when given a block of arity 4", () => {
      expect(MockIMAP.isDisconnected()).toBe(true);

      const messages: Message[] = [];
      const uids: number[] = [];
      const flags: unknown[] = [];
      Mail.all(null, ((message: Message, imap: unknown, uid: number, flag: unknown) => {
        expect(imap).toBeInstanceOf(MockIMAP);
        messages.push(message);
        uids.push(uid);
        flags.push(flag);
      }) as (email: Message) => unknown);

      expect(list(messages).sort()).toEqual(examples().sort());
      expect(uids.sort((a, b) => a - b)).toEqual(MockIMAP.examples().map((m) => m.number));
      expect(flags.sort()).toEqual(
        MockIMAP.examples()
          .map((m) => m.attr["FLAGS"])
          .sort(),
      );

      expect(MockIMAP.isDisconnected()).toBe(true);
    });
  });

  describe("find and options", () => {
    it("should work with a frozen hash argument", () => {
      const messages = Mail.find(
        Object.freeze({ count: "all", what: "last", order: "asc" } as const),
      );
      expect(list(messages)).toEqual(examples());
    });
    it("should handle the :count option", () => {
      let messages = Mail.find({ count: "all", what: "last", order: "asc" });
      expect(list(messages)).toEqual(examples());

      const message = Mail.find({ count: 1, what: "last" });
      expect(raw(message)).toBe(MockIMAP.examples().at(-1)!.attr["RFC822"]);

      messages = Mail.find({ count: 2, what: "last", order: "asc" });
      expect(list(messages).slice(0, 2)).toEqual(examples().slice(-2));
    });
    it("should handle the :what option", () => {
      let messages = Mail.find({ count: "all", what: "last" });
      expect(list(messages)).toEqual(examples());

      messages = Mail.find({ count: 2, what: "first", order: "asc" });
      expect(list(messages)).toEqual(examples().slice(0, 2));
    });
    it("should handle the :order option", () => {
      let messages = Mail.find({ order: "desc", count: 5, what: "last" });
      expect(list(messages)).toEqual(examples().slice(-5).reverse());

      messages = Mail.find({ order: "asc", count: 5, what: "last" });
      expect(list(messages)).toEqual(examples().slice(-5));
    });
    it("should handle the :mailbox option", () => {
      Mail.find({ mailbox: "SOME-RANDOM-MAILBOX" });

      expect(MockIMAP.mailbox()).toBe("SOME-RANDOM-MAILBOX");
    });
    it("should handle the :uid option", () => {
      const messages = Mail.find({ uid: 1 });

      expect(raw((messages as Message[])[0])).toBe(examples()[1]);
    });
    it("should find the last 10 messages by default", () => {
      const messages = Mail.find();

      expect(messages).toHaveLength(10);
    });
    it("should search the mailbox 'INBOX' by default", () => {
      Mail.find();

      expect(MockIMAP.mailbox()).toBe("INBOX");
    });

    it("should handle the delete_after_find_option", () => {
      Mail.find({ deleteAfterFind: false });
      expect(MockIMAP.examples()).toHaveLength(20);

      Mail.find({ deleteAfterFind: true });
      expect(MockIMAP.examples()).toHaveLength(10);

      Mail.find({ deleteAfterFind: true }, () => {});
      expect(MockIMAP.examples()).toHaveLength(10);
    });

    it("should handle the find_and_delete method", () => {
      Mail.findAndDelete({ count: 15 });
      expect(MockIMAP.examples()).toHaveLength(5);
    });

    it("should pass :search_charset to IMAP uid_search", () => {
      const messages = Mail.find({ searchCharset: "UTF-8" }) as Message[];
      expect(messages).toHaveLength(1);

      const message = messages[0];
      expect(message.rawSource).toBe(examples()[0]);
    });
  });

  describe("last", () => {
    it("should find the last received messages", () => {
      const messages = Mail.last({ count: 5 });

      expect(messages).toBeInstanceOf(Array);
      expect(list(messages)).toEqual(examples().slice(-5));
    });
    it("should find the last received message", () => {
      const message = Mail.last();

      expect(raw(message)).toBe(MockIMAP.examples().at(-1)!.attr["RFC822"]);
    });
  });

  describe("first", () => {
    it("should find the first received messages", () => {
      const messages = Mail.first({ count: 5 });

      expect(messages).toBeInstanceOf(Array);
      expect(list(messages)).toEqual(examples().slice(0, 5));
    });
    it("should find the first received message", () => {
      const message = Mail.first();

      expect(raw(message)).toBe(MockIMAP.examples()[0].attr["RFC822"]);
    });
  });

  describe("all", () => {
    it("should find all messages", () => {
      const messages = Mail.all();

      expect(messages).toHaveLength(MockIMAP.examples().length);
      expect(list(messages)).toEqual(examples());
    });
  });

  describe("delete_all", () => {
    it("should delete all messages", () => {
      Mail.all();

      const spy = vi.spyOn(NetIMAP, "encodeUtf7").mockReturnValue(null as unknown as string);
      Mail.deleteAll();
      expect(spy).toHaveBeenCalledTimes(1);

      expect(MockIMAP.isReadonly()).toBe(false);
      expect(MockIMAP.examples()).toHaveLength(0);
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
        expect(connection).toBeInstanceOf(MockIMAP);
      });
    });
  });

  describe("handling of options", () => {
    it("should set default options", () => {
      const retrievable = new IMAP({});
      const options = retrievable["validateOptions"]({});

      expect(Utilities.isBlank(options.count)).toBe(false);
      expect(options.count).toBe(10);

      expect(Utilities.isBlank(options.order)).toBe(false);
      expect(options.order).toBe("asc");

      expect(Utilities.isBlank(options.what)).toBe(false);
      expect(options.what).toBe("first");

      expect(Utilities.isBlank(options.mailbox)).toBe(false);
      expect(options.mailbox).toBe("INBOX");
    });
    it("should not replace given configuration", () => {
      const retrievable = new IMAP({});
      const options = retrievable["validateOptions"]({
        mailbox: "some/mail/box",
        count: 2,
        order: "asc",
        what: "first",
      });

      expect(Utilities.isBlank(options.count)).toBe(false);
      expect(options.count).toBe(2);

      expect(Utilities.isBlank(options.order)).toBe(false);
      expect(options.order).toBe("asc");

      expect(Utilities.isBlank(options.what)).toBe(false);
      expect(options.what).toBe("first");

      expect(Utilities.isBlank(options.mailbox)).toBe(false);
      expect(options.mailbox).toBe("some/mail/box");
    });
    it("should ensure utf7 conversion for mailbox names", () => {
      const retrievable = new IMAP({});

      const spy = vi.spyOn(NetIMAP, "encodeUtf7").mockReturnValue("UTF7_STRING");
      const options = retrievable["validateOptions"]({
        mailbox: "UTF8_STRING",
      });
      expect(spy).toHaveBeenCalled();
      expect(options.mailbox).toBe("UTF7_STRING");
    });
  });

  describe("error handling", () => {
    it("should finish the IMAP connection if an exception is raised", () => {
      expect(MockIMAP.isDisconnected()).toBe(true);

      expect(() =>
        Mail.all(null, () => {
          throw new ArgumentError();
        }),
      ).toThrow(ArgumentError);

      expect(MockIMAP.isDisconnected()).toBe(true);
    });
  });

  describe("STARTTLS", () => {
    let imap: MockIMAP;
    beforeEach(() => {
      imap = new MockIMAP();
      vi.spyOn(NetIMAP, "new").mockReturnValue(imap);
    });

    it("calls starttls to upgrade", () => {
      Mail.defaults(function () {
        this.retrieverMethod("imap", { enableStarttls: true });
      });

      const spy = vi.spyOn(imap, "starttls");
      Mail.find();
      expect(spy).toHaveBeenCalled();
    });

    it("conflicts with enable_ssl", () => {
      Mail.defaults(function () {
        this.retrieverMethod("imap", { enableStarttls: true, enableSsl: true });
      });

      expect(() => Mail.find()).toThrow(ArgumentError);
    });
  });

  describe("authentication mechanism", () => {
    let imap: MockIMAP;
    beforeEach(() => {
      imap = new MockIMAP();
      vi.spyOn(NetIMAP, "new").mockReturnValue(imap);
    });
    it("should be login by default", () => {
      const authenticate = vi.spyOn(imap, "authenticate");
      const login = vi.spyOn(imap, "login");
      Mail.defaults(function () {
        this.retrieverMethod("imap", { userName: "foo", password: "secret" });
      });
      Mail.find();
      expect(authenticate).not.toHaveBeenCalled();
      expect(login).toHaveBeenCalledWith("foo", "secret");
    });
    it("should be changeable", () => {
      const authenticate = vi.spyOn(imap, "authenticate");
      const login = vi.spyOn(imap, "login");
      Mail.defaults(function () {
        this.retrieverMethod("imap", {
          authentication: "CRAM-MD5",
          userName: "foo",
          password: "secret",
        });
      });
      Mail.find();
      expect(authenticate).toHaveBeenCalledWith("CRAM-MD5", "foo", "secret");
      expect(login).not.toHaveBeenCalled();
    });
  });
});
