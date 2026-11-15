import { IO } from "@blazetrails/ruby-compat";
import { beforeEach, describe, expect, it } from "vitest";
import "../lib/index.js";
import { Mail } from "../lib/mail.js";
import type { Message } from "../lib/message.js";

const fixturePath = (...path: string[]) =>
  new URL(`./fixtures/${path.join("/")}`, import.meta.url).pathname;
const readRawFixture = async (...path: string[]) =>
  await IO.binreadAsync(decodeURIComponent(fixturePath(...path)));
const readFixture = (...path: string[]) => Mail.read(decodeURIComponent(fixturePath(...path)));

describe("multipart/report emails", () => {
  it("should know if it is a multipart report type", async () => {
    const mail = await readFixture("emails", "multipart_report_emails", "report_422.eml");
    expect(mail.isMultipartReport()).toBeTruthy();
  });

  describe("delivery-status reports", () => {
    it("should know if it is a deliver-status report", async () => {
      const mail = await readFixture("emails", "multipart_report_emails", "report_422.eml");
      expect(mail.isDeliveryStatusReport()).toBeTruthy();
    });

    it("should find its message/delivery-status part", async () => {
      const mail = await readFixture("emails", "multipart_report_emails", "report_422.eml");
      expect(mail.deliveryStatusPart()).not.toBeNull();
    });

    it("should handle a report that has a human readable message/delivery-status", async () => {
      const mail = await readFixture(
        "emails",
        "multipart_report_emails",
        "multipart_report_multiple_status.eml",
      );
      expect(mail.isBounced()).toBeTruthy();
    });

    describe("delivery-status part in a non report email", () => {
      let mail: Message;
      beforeEach(async () => {
        const string = new TextDecoder().decode(
          await readRawFixture("emails", "multipart_report_emails", "report_422.eml"),
        );
        mail = Mail.readFromString(
          string.replace("multipart/report; report-type=delivery-status;", "multipart/mixed;"),
        );
      });

      it("does not return a delivery_status_part", () => {
        expect(mail.deliveryStatusPart()).toBeNull();
      });
    });

    describe("multipart reports with more than one address", () => {
      it("should not crash", async () => {
        const mail1 = await readFixture(
          "emails",
          "multipart_report_emails",
          "multi_address_bounce1.eml",
        );
        const mail2 = await readFixture(
          "emails",
          "multipart_report_emails",
          "multi_address_bounce2.eml",
        );
        expect(() => mail1.isBounced()).not.toThrow();
        expect(() => mail2.isBounced()).not.toThrow();
      });

      it("should not know that a multi address email was bounced", async () => {
        const mail1 = await readFixture(
          "emails",
          "multipart_report_emails",
          "multi_address_bounce1.eml",
        );
        const mail2 = await readFixture(
          "emails",
          "multipart_report_emails",
          "multi_address_bounce2.eml",
        );
        expect(mail1.isBounced()).toBeTruthy();
        expect(mail2.isBounced()).toBeTruthy();
      });
    });

    describe("temporary failure", () => {
      let mail: Message;
      beforeEach(async () => {
        mail = await readFixture("emails", "multipart_report_emails", "report_422.eml");
      });

      it("should be bounced", () => {
        expect(mail.isBounced()).toBeFalsy();
      });

      it("should say action 'delayed'", () => {
        expect(mail.action()).toEqual("delayed");
      });

      it("should give a final recipient", () => {
        expect(mail.finalRecipient()).toEqual("RFC822; fraser@oooooooo.com.au");
      });

      it("should give an error code", () => {
        expect(mail.errorStatus()).toEqual("4.2.2");
      });

      it("should give a diagostic code", () => {
        expect(mail.diagnosticCode()).toEqual(
          "SMTP; 452 4.2.2 <fraser@oooooooo.com.au>... Mailbox full",
        );
      });

      it("should give a remote-mta", () => {
        expect(mail.remoteMta()).toEqual("DNS; mail.oooooooo.com.au");
      });

      it("should be retryable", () => {
        expect(mail.isRetryable()).toBeTruthy();
      });
    });

    describe("permanent failure", () => {
      let mail: Message;
      beforeEach(async () => {
        mail = await readFixture("emails", "multipart_report_emails", "report_530.eml");
      });

      it("should be bounced", () => {
        expect(mail.isBounced()).toBeTruthy();
      });

      it("should say action 'failed'", () => {
        expect(mail.action()).toEqual("failed");
      });

      it("should give a final recipient", () => {
        expect(mail.finalRecipient()).toEqual("RFC822; edwin@zzzzzzz.com");
      });

      it("should give an error code", () => {
        expect(mail.errorStatus()).toEqual("5.3.0");
      });

      it("should give a diagostic code", () => {
        expect(mail.diagnosticCode()).toEqual(
          "SMTP; 553 5.3.0 <edwin@zzzzzzz.com>... Unknown E-Mail Address",
        );
      });

      it("should give a remote-mta", () => {
        expect(mail.remoteMta()).toEqual("DNS; mail.zzzzzz.com");
      });

      it("should be retryable", () => {
        expect(mail.isRetryable()).toBeFalsy();
      });
    });
  });
});
