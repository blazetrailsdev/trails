import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Exception, StandardError } from "@blazetrails/ruby-compat";
import { Mail, Message } from "../lib/index.js";
import { closeMockSmtp, deliveries, mockSmtp } from "./support/mock-smtp.js";
import "./support/mock-pop3.js";

class MyDelivery {
  constructor(_settings: Record<string, unknown>) {}
}

class MyRetriever {
  constructor(_settings: Record<string, unknown>) {}
}

type Settings = { settings: Record<string, unknown> };
const deliveryMethod = () => Mail.deliveryMethod() as Settings;
const retrieverMethod = () => Mail.retrieverMethod() as unknown as Settings;

describe("Mail", () => {
  beforeEach(() => {
    Mail.defaults(function () {
      this.deliveryMethod("smtp", {
        address: "localhost",
        port: 25,
        domain: "localhost.localdomain",
        userName: null,
        password: null,
        authentication: null,
        enableStarttlsAuto: true,
      });

      this.retrieverMethod("pop3", {
        address: "localhost",
        port: 110,
        userName: null,
        password: null,
        enableSsl: true,
      });
    });
  });

  describe("default delivery and retriever methods", () => {
    it("should set the delivery method", () => {
      Mail.defaults(function () {
        this.deliveryMethod("smtp");
      });
      expect(Mail.deliveryMethod()).toBeInstanceOf(Mail.SMTP);
    });

    it("should default to settings for smtp", () => {
      expect(Mail.deliveryMethod()).toBeInstanceOf(Mail.SMTP);
      expect(deliveryMethod().settings).toEqual({
        address: "localhost",
        port: 25,
        domain: "localhost.localdomain",
        userName: null,
        password: null,
        authentication: null,
        enableStarttlsAuto: true,
        enableStarttls: null,
        opensslVerifyMode: null,
        ssl: null,
        tls: null,
        openTimeout: 5,
        readTimeout: 5,
      });
    });

    it("should set the retriever method", () => {
      Mail.defaults(function () {
        this.retrieverMethod("pop3");
      });
      expect(Mail.retrieverMethod()).toBeInstanceOf(Mail.POP3);
    });

    it("should default to settings for pop3", () => {
      expect(Mail.retrieverMethod()).toBeInstanceOf(Mail.POP3);
      expect(retrieverMethod().settings).toEqual({
        address: "localhost",
        port: 110,
        userName: null,
        password: null,
        authentication: null,
        enableSsl: true,
        readTimeout: null,
      });
    });

    it("should allow us to overwrite anything we need on SMTP", () => {
      Mail.defaults(function () {
        this.deliveryMethod("smtp", { port: 999 });
      });
      expect(deliveryMethod().settings.address).toBe("localhost");
      expect(deliveryMethod().settings.port).toBe(999);
    });

    it("should allow us to overwrite anything we need on POP3", () => {
      Mail.defaults(function () {
        this.retrieverMethod("pop3", { address: "foo.bar.com" });
      });
      expect(retrieverMethod().settings.address).toBe("foo.bar.com");
      expect(retrieverMethod().settings.port).toBe(110);
    });

    it("should allow you to pass in your own delivery method", () => {
      Mail.defaults(function () {
        this.deliveryMethod(MyDelivery);
      });
      expect(Mail.deliveryMethod()).toBeInstanceOf(MyDelivery);
    });

    it("should ask the custom delivery agent for its settings", () => {
      const mockMyDelivery = { settings: { theseAre: "settings" } };
      const myDeliveryNew = vi.fn(function () {
        return mockMyDelivery;
      });
      Mail.defaults(function () {
        this.deliveryMethod(myDeliveryNew);
      });
      expect(myDeliveryNew).toHaveBeenCalled();
      expect(deliveryMethod().settings).toEqual({ theseAre: "settings" });
    });

    it("should allow you to pass in your own retriever method", () => {
      Mail.defaults(function () {
        this.retrieverMethod(MyRetriever);
      });
      expect(Mail.retrieverMethod()).toBeInstanceOf(MyRetriever);
    });

    it("should ask the custom retriever agent for its settings", () => {
      const mockMyRetriever = { settings: { theseAre: "settings" } };
      const myRetrieverNew = vi.fn(function () {
        return mockMyRetriever;
      });
      Mail.defaults(function () {
        this.retrieverMethod(myRetrieverNew);
      });
      expect(myRetrieverNew).toHaveBeenCalled();
      expect(retrieverMethod().settings).toEqual({ theseAre: "settings" });
    });
  });

  describe("instance delivery methods", () => {
    it("should copy the defaults defined by Mail.defaults", () => {
      const mail = Mail.new();
      expect(mail.deliveryMethod()).toBeInstanceOf(Mail.SMTP);
    });

    it("should be able to change the delivery_method", () => {
      const mail = Mail.new();
      mail.deliveryMethod("file");
      expect(mail.deliveryMethod()).toBeInstanceOf(Mail.FileDelivery);
    });

    it("should be able to change the delivery_method and pass in settings", () => {
      const mail = Mail.new();
      const tmpdir = decodeURIComponent(new URL("../../../tmp/mail", import.meta.url).pathname);
      mail.deliveryMethod("file", { location: tmpdir });
      expect(mail.deliveryMethod()).toBeInstanceOf(Mail.FileDelivery);
      expect((mail.deliveryMethod() as Settings).settings).toEqual({
        location: tmpdir,
        extension: "",
      });
    });

    it("should not change the default when it changes the delivery_method", () => {
      const mail1 = Mail.new();
      const mail2 = Mail.new();
      mail1.deliveryMethod("file");
      expect(Mail.deliveryMethod()).toBeInstanceOf(Mail.SMTP);
      expect(mail1.deliveryMethod()).toBeInstanceOf(Mail.FileDelivery);
      expect(mail2.deliveryMethod()).toBeInstanceOf(Mail.SMTP);
    });

    it("should not change the default settings when it changes the delivery_method settings", () => {
      const mail1 = Mail.new();
      const mail2 = Mail.new();
      mail1.deliveryMethod("smtp", { address: "my.own.address" });
      expect(deliveryMethod().settings.address).toBe("localhost");
      expect((mail1.deliveryMethod() as Settings).settings.address).toBe("my.own.address");
      expect((mail2.deliveryMethod() as Settings).settings.address).toBe("localhost");
    });
  });

  describe("retrieving emails via POP3", () => {
    it("should retrieve all emails via POP3", () => {
      const messages = Mail.all() as Message[];

      expect(messages).not.toHaveLength(0);
      for (const message of messages) {
        expect(message.constructor).toBe(Mail.Message);
      }
    });
  });

  describe("sending emails via SMTP", () => {
    beforeEach(async () => {
      const port = await mockSmtp();
      Mail.defaults(function () {
        this.deliveryMethod("smtp", { address: "127.0.0.1", port, enableStarttlsAuto: false });
      });
    });

    afterEach(closeMockSmtp);

    it("should deliver a mail message", async () => {
      const message = await Mail.deliver(function (this: Message) {
        this.from("mikel@test.lindsaar.net");
        this.to("ada@test.lindsaar.net");
        this.subject("Re: No way!");
        this.body("Yeah sure");
      });

      expect(deliveries[0][0].replace(/\r\n$/, "")).toBe(message.encoded());
      expect(deliveries[0][1]).toBe("mikel@test.lindsaar.net");
      expect(deliveries[0][2]).toEqual(["ada@test.lindsaar.net"]);
    });

    it("should deliver itself", async () => {
      const message = Mail.new(function (this: Message) {
        this.from("mikel@test.lindsaar.net");
        this.to("ada@test.lindsaar.net");
        this.subject("Re: No way!");
        this.body("Yeah sure");
      });

      await message.deliverBang();

      expect(deliveries[0][0].replace(/\r\n$/, "")).toBe(message.encoded());
      expect(deliveries[0][1]).toBe("mikel@test.lindsaar.net");
      expect(deliveries[0][2]).toEqual(["ada@test.lindsaar.net"]);
    });
  });

  describe("deliveries", () => {
    class MyDeliveryMethod {
      settings: Record<string, unknown> = {};
      constructor(_values: Record<string, unknown> = {}) {}
      async deliverBang(_message: Message): Promise<boolean> {
        return true;
      }
    }

    class MyObserver {
      static deliveredEmail(_message: Message): void {}
    }

    class MyDeliveryHandler {
      deliverMail(mail: Message) {
        const postman = new MyDeliveryMethod();
        return postman.deliverBang(mail);
      }
    }

    class MyYieldingDeliveryHandler {
      deliverMail(_mail: Message, block: () => unknown) {
        return block();
      }
    }

    let message: Message;
    const testDeliveries = () => Mail.TestMailer.deliveries;
    const doDelivery = () =>
      vi.spyOn(message as unknown as { doDelivery(): unknown }, "doDelivery");

    beforeEach(() => {
      message = Mail.new(function (this: Message) {
        this.from("mikel@test.lindsaar.net");
        this.to("ada@test.lindsaar.net");
        this.subject("Re: No way!");
        this.body("Yeah sure");
      });
      message.deliveryMethod("test");
    });

    describe("adding to Mail.deliveries", () => {
      it("should add itself to the deliveries collection on mail on delivery", async () => {
        const before = testDeliveries().length;
        await message.deliver();
        expect(testDeliveries().length - before).toBe(1);
      });
    });

    describe("perform_deliveries", () => {
      it("should call deliver! on the delivery method by default", async () => {
        const deliveryAgent = new MyDeliveryMethod();
        vi.spyOn(message, "deliveryMethod").mockReturnValue(deliveryAgent);
        const deliverBang = vi.spyOn(deliveryAgent, "deliverBang");
        await message.deliver();
        expect(deliverBang).toHaveBeenCalledWith(message);
      });

      it("should not call deliver if perform deliveries is set to false", async () => {
        message.performDeliveries = false;
        const deliveryAgent = new MyDeliveryMethod();
        const spy = vi.spyOn(message, "deliveryMethod");
        const deliverBang = vi.spyOn(deliveryAgent, "deliverBang");
        await message.deliver();
        expect(spy).not.toHaveBeenCalled();
        expect(deliverBang).not.toHaveBeenCalled();
      });

      it("should add to the deliveries array if perform_deliveries is true", async () => {
        message.performDeliveries = true;
        const before = testDeliveries().length;
        await message.deliver();
        expect(testDeliveries().length - before).toBe(1);
      });

      it("should not add to the deliveries array if perform_deliveries is false", async () => {
        message.performDeliveries = false;
        const before = testDeliveries().length;
        await message.deliver();
        expect(testDeliveries().length).toBe(before);
      });
    });

    describe("observers", () => {
      afterEach(() => Mail.unregisterObserver(MyObserver));

      it("should tell its observers that it was told to deliver an email", async () => {
        Mail.registerObserver(MyObserver);
        const spy = vi.spyOn(MyObserver, "deliveredEmail");
        await message.deliver();
        expect(spy).toHaveBeenCalledOnce();
        expect(spy).toHaveBeenCalledWith(message);
      });

      it("should tell its observers that it was told to deliver an email even if perform_deliveries is false", async () => {
        Mail.registerObserver(MyObserver);
        message.performDeliveries = false;
        const spy = vi.spyOn(MyObserver, "deliveredEmail");
        await message.deliver();
        expect(spy).toHaveBeenCalledOnce();
        expect(spy).toHaveBeenCalledWith(message);
      });

      it("should tell its observers that it was told to deliver an email even if it is using a delivery_handler", async () => {
        Mail.registerObserver(MyObserver);
        message.deliveryHandler = new MyYieldingDeliveryHandler();
        message.performDeliveries = false;
        const spy = vi.spyOn(MyObserver, "deliveredEmail");
        await message.deliver();
        expect(spy).toHaveBeenCalledOnce();
        expect(spy).toHaveBeenCalledWith(message);
      });
    });

    describe("raise_delivery_errors", () => {
      it("should pass on delivery errors if raised", async () => {
        const deliveryAgent = new MyDeliveryMethod();
        vi.spyOn(message, "deliveryMethod").mockReturnValue(deliveryAgent);
        vi.spyOn(deliveryAgent, "deliverBang").mockRejectedValue(new StandardError());
        await expect(message.deliver()).rejects.toThrow(StandardError);
      });

      it("should not pass on delivery errors if raised raise_delivery_errors is set to false", async () => {
        const deliveryAgent = new MyDeliveryMethod();
        vi.spyOn(message, "deliveryMethod").mockReturnValue(deliveryAgent);
        message.raiseDeliveryErrors = false;
        vi.spyOn(deliveryAgent, "deliverBang").mockRejectedValue(new StandardError());
        await expect(message.deliver()).resolves.toBe(message);
      });

      it("should pass through Exceptions even when raise_delivery_errors is set to false", async () => {
        const deliveryAgent = new MyDeliveryMethod();
        vi.spyOn(message, "deliveryMethod").mockReturnValue(deliveryAgent);
        message.raiseDeliveryErrors = false;
        vi.spyOn(deliveryAgent, "deliverBang").mockRejectedValue(new Exception());
        await expect(message.deliver()).rejects.toThrow(Exception);
      });
    });

    describe("delivery_handler", () => {
      it("should allow you to hand off performing the actual delivery to another object", async () => {
        const deliveryHandler = new MyYieldingDeliveryHandler();
        const spy = vi.spyOn(deliveryHandler, "deliverMail").mockReturnValue(undefined);
        message.deliveryHandler = deliveryHandler;
        await message.deliver();
        expect(spy).toHaveBeenCalledOnce();
        expect(spy.mock.calls[0][0]).toBe(message);
      });

      it("mail should be told to :deliver once and then :deliver! once by the delivery handler", async () => {
        message.deliveryHandler = new MyYieldingDeliveryHandler();
        const spy = doDelivery().mockResolvedValue(undefined);
        await message.deliver();
        expect(spy).toHaveBeenCalledOnce();
      });

      it("mail only call its delivery_method once", async () => {
        message.deliveryHandler = new MyYieldingDeliveryHandler();
        const spy = vi.spyOn(message, "deliveryMethod").mockReturnValue(new Mail.TestMailer({}));
        await message.deliver();
        expect(spy).toHaveBeenCalledOnce();
      });

      it("mail should not catch any exceptions when using a delivery_handler", async () => {
        message.deliveryHandler = new MyYieldingDeliveryHandler();
        vi.spyOn(message, "deliveryMethod").mockImplementation(() => {
          throw new Exception();
        });
        await expect(message.deliver()).rejects.toThrow(Exception);
      });

      it("mail should not modify the Mail.deliveries object if using a delivery_handler that does not append to deliveries", async () => {
        message.deliveryHandler = new MyDeliveryHandler();
        const before = testDeliveries();
        const snapshot = [...before];
        await message.deliver();
        expect(testDeliveries()).toBe(before);
        expect(testDeliveries()).toEqual(snapshot);
      });

      it("should be able to just yield and let mail do its thing", async () => {
        message.deliveryHandler = new MyYieldingDeliveryHandler();
        const spy = doDelivery().mockResolvedValue(undefined);
        await message.deliver();
        expect(spy).toHaveBeenCalledOnce();
      });
    });
  });
});
