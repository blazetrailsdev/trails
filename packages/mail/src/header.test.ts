import { describe, expect, it } from "vitest";
import { ArgumentError, rbObjDup } from "@blazetrails/ruby-compat";
import { Field, Header, Mail } from "./index.js";

const one = (field: unknown) => field as Field;

describe("Mail::Header", () => {
  describe("instance methods", () => {
    it("should be Enumerable", () => {
      const header = new Header("To: James Random\r\nFrom: Santa Claus\r\n");
      expect(header.find((f: Field) => f.isResponsibleFor("From"))).toBeInstanceOf(Field);
    });
  });

  describe("creating fields", () => {
    it("should not accept field names containing colons", () => {
      expect(() => new Header().set("a:b", "c")).toThrow(ArgumentError);
    });
  });

  describe("parsing", () => {
    it("should handle an empty X-* header value", () => {
      const header = new Header("X-MS-TNEF-Correlator:\r\n");
      expect(header.fields.length).toEqual(1);
      expect(one(header.get("X-MS-TNEF-Correlator")).decoded()).toBeNull();
      expect(one(header.get("X-MS-TNEF-Correlator")).encoded()).toEqual(
        "X-MS-TNEF-Correlator: \r\n",
      );
    });
  });

  describe("error handling", () => {
    it("should collect up any of its fields' errors", () => {
      const header = new Header("Content-Transfer-Encoding: vl@d\r\nReply-To: a b b");
      const errors = header.errors() as unknown[][];
      expect(errors.length).toEqual(2);
      expect(errors[0][0]).toEqual("Reply-To");
      expect(errors[1][1]).toEqual("vl@d");
    });
  });

  describe("handling date fields with multiple values", () => {
    it("should delete all references to a field", () => {
      const header = new Header();
      header.fields = ["X-Mail-SPAM: 15", "X-Mail-SPAM: 20"];
      header.set("X-Mail-SPAM", "10000");
      expect((header.get("X-Mail-SPAM") as Field[]).map((x) => x.value)).toEqual([
        "15",
        "20",
        "10000",
      ]);
      header.set("X-Mail-SPAM", null);
      expect(header.get("X-Mail-SPAM")).toBeNull();
    });
  });

  describe("copying", () => {
    it("should instantiate with a string passed in", () => {
      const header = new Header("To: Mikel\r\nFrom: bob\r\n");
      const copy = rbObjDup(header);
      expect(one(copy.get("to")).equals(one(header.get("to")))).toBe(true);
    });
  });

  describe("creating fields", () => {
    it("should recognise a bcc field", () => {
      const header = new Header();
      header.set("bcc", "mikel@test.lindsaar.net");
      expect(one(header.get("bcc")).field.constructor).toBe(Mail.BccField);
    });

    it("should recognise a cc field", () => {
      const header = new Header();
      header.set("cc", "mikel@test.lindsaar.net");
      expect(one(header.get("cc")).field.constructor).toBe(Mail.CcField);
    });

    it("should recognise a content-description field", () => {
      const header = new Header();
      header.set("content-description", "Text");
      expect(one(header.get("content-description")).field.constructor).toBe(
        Mail.ContentDescriptionField,
      );
    });

    it("should recognise a content-transfer-encoding field", () => {
      const header = new Header();
      header.set("content-transfer-encoding", "7bit");
      expect(one(header.get("content-transfer-encoding")).field.constructor).toBe(
        Mail.ContentTransferEncodingField,
      );
    });

    it("should recognise a date field", () => {
      const header = new Header();
      header.set("date", "Fri, 21 Nov 1997 09:55:06 -0600");
      expect(one(header.get("date")).field.constructor).toBe(Mail.DateField);
    });

    it("should recognise a from field", () => {
      const header = new Header();
      header.set("from", "mikel@test.lindsaar.net");
      expect(one(header.get("from")).field.constructor).toBe(Mail.FromField);
    });

    it("should recognise a in-reply-to field", () => {
      const header = new Header();
      header.set("in-reply-to", "<1234@test.lindsaar.net>");
      expect(one(header.get("in-reply-to")).field.constructor).toBe(Mail.InReplyToField);
    });

    it("should recognise a keywords field", () => {
      const header = new Header();
      header.set("keywords", "mikel test lindsaar net");
      expect(one(header.get("keywords")).field.constructor).toBe(Mail.KeywordsField);
    });

    it("should recognise a message-id field", () => {
      const header = new Header();
      header.set("message-id", "<1234@test.lindsaar.net>");
      expect(one(header.get("message-id")).field.constructor).toBe(Mail.MessageIdField);
    });

    it("should recognise a mime-version field", () => {
      const header = new Header();
      header.set("mime-version", "1.0");
      expect(one(header.get("mime-version")).field.constructor).toBe(Mail.MimeVersionField);
    });

    it("should recognise a references field", () => {
      const header = new Header();
      header.set("references", "<1234@test.lindsaar.net>");
      expect(one(header.get("references")).field.constructor).toBe(Mail.ReferencesField);
    });

    it("should recognise a reply-to field", () => {
      const header = new Header();
      header.set("reply-to", "mikel@test.lindsaar.net");
      expect(one(header.get("reply-to")).field.constructor).toBe(Mail.ReplyToField);
    });

    it("should recognise a resent-bcc field", () => {
      const header = new Header();
      header.set("resent-bcc", "mikel@test.lindsaar.net");
      expect(one(header.get("resent-bcc")).field.constructor).toBe(Mail.ResentBccField);
    });

    it("should recognise a resent-cc field", () => {
      const header = new Header();
      header.set("resent-cc", "mikel@test.lindsaar.net");
      expect(one(header.get("resent-cc")).field.constructor).toBe(Mail.ResentCcField);
    });

    it("should recognise a resent-date field", () => {
      const header = new Header();
      header.set("resent-date", "Fri, 21 Nov 1997 09:55:06 -0600");
      expect(one(header.get("resent-date")).field.constructor).toBe(Mail.ResentDateField);
    });

    it("should recognise a resent-from field", () => {
      const header = new Header();
      header.set("resent-from", "mikel@test.lindsaar.net");
      expect(one(header.get("resent-from")).field.constructor).toBe(Mail.ResentFromField);
    });

    it("should recognise a resent-message-id field", () => {
      const header = new Header();
      header.set("resent-message-id", "<1234@mail.baci.local>");
      expect(one(header.get("resent-message-id")).field.constructor).toBe(
        Mail.ResentMessageIdField,
      );
    });

    it("should recognise a resent-sender field", () => {
      const header = new Header();
      header.set("resent-sender", "mikel@test.lindsaar.net");
      expect(one(header.get("resent-sender")).field.constructor).toBe(Mail.ResentSenderField);
    });

    it("should recognise a resent-to field", () => {
      const header = new Header();
      header.set("resent-to", "mikel@test.lindsaar.net");
      expect(one(header.get("resent-to")).field.constructor).toBe(Mail.ResentToField);
    });

    it("should recognise a return-path field", () => {
      const header = new Header();
      header.set("return-path", "<mikel@me.com>");
      expect(one(header.get("return-path")).field.constructor).toBe(Mail.ReturnPathField);
    });

    it("should recognise a sender field", () => {
      const header = new Header();
      header.set("sender", "mikel@test.lindsaar.net");
      expect(one(header.get("sender")).field.constructor).toBe(Mail.SenderField);
    });

    it("should recognise a to field", () => {
      const header = new Header();
      header.set("to", "mikel@test.lindsaar.net");
      expect(one(header.get("to")).field.constructor).toBe(Mail.ToField);
    });

    it("should maintain header case", () => {
      const header = new Header();
      header.set("User-Agent", "My funky mailer");
      expect(header.encoded()).toMatch(/^User-Agent: /m);
      expect(header.encoded()).not.toMatch(/^user-agent: /m);
    });
  });

  describe("parsing", () => {
    it("should split the header into separate fields", () => {
      expect(new Header("To: Mikel\r\nFrom: bob\r\n").fields.length).toEqual(2);
    });

    it("should not try to accept colons in header field names", () => {
      const header = new Header("Colon:in:header: oops");
      expect(header.fields.length).toEqual(1);
      expect(header.fields[0].name).toEqual("Colon");
      expect(one(header.get("Colon")).value).toEqual("in:header: oops");
    });

    it("should split each field into an name and value", () => {
      const header = new Header("To: Mikel\r\nFrom: bob\r\n");
      expect(header.fields[0].name).toEqual("From");
      expect(header.fields[0].value).toEqual("bob");
      expect(header.fields[1].name).toEqual("To");
      expect(header.fields[1].value).toEqual("Mikel");
    });

    it("should preserve the order of the fields it is given", () => {
      const header = new Header();
      header.fields = [
        "From: mikel@me.com",
        "To: bob@you.com",
        "Subject: This is a badly formed email",
      ];
      expect(header.fields.map((f) => f.name)).toEqual(["From", "To", "Subject"]);
    });

    it("should return nil if no value in the header", () => {
      expect(new Header("To: Mikel\r\nFrom: bob\r\n").get("Subject")).toBeNull();
    });

    it("should add a new field if the field does not exist", () => {
      const header = new Header("To: Mikel\r\nFrom: bob\r\n");
      header.set("Subject", "G'Day!");
      expect(one(header.get("Subject")).value).toEqual("G'Day!");
    });

    it("should reset the value of a single-only field if it already exists", () => {
      const header = new Header("To: Mikel\r\nFrom: bob\r\n");
      header.set("To", "George");
      expect(one(header.get("To")).value).toEqual("George");
    });

    it("should allow you to delete a field by setting it to nil", () => {
      const header = new Header();
      header.fields = ["To: bob@you.com"];
      header.set("To", null);
      expect(header.fields.length).toEqual(0);
    });

    it("should delete all matching fields found if there are multiple options", () => {
      const header = new Header();
      header.fields = ["X-SPAM: 1000", "X-SPAM: 20"];
      header.set("X-SPAM", null);
      expect(header.fields.length).toEqual(0);
    });

    it("should delete only matching fields found", () => {
      const header = new Header();
      header.fields = ["X-SPAM: 1000", "X-AUTHOR: Steve"];
      header.set("X-SPAM", null);
      expect(header.get("X-AUTHOR")).not.toBeNull();
      expect(header.fields.length).toEqual(1);
    });

    it("should accept X- option fields from MS-Exchange", () => {
      const header = new Header("X-Ms-Has-Attach:\r\nX-MS-TNEF-Correlator: \r\n");
      expect(header.fields.length).toEqual(2);
      expect(one(header.get("X-Ms-Has-Attach")).decoded()).toBeNull();
      expect(one(header.get("X-Ms-Has-Attach")).encoded()).toEqual("X-Ms-Has-Attach: \r\n");
    });

    it("should allow you to replace a from field", () => {
      const header = new Header();
      expect(header.get("From")).toBeNull();
      header.set("From", "mikel@test.lindsaar.net");
      header.set("From", "bob@test.lindsaar.net");
      expect(one(header.get("From")).decoded()).toEqual("bob@test.lindsaar.net");
    });

    it("should maintain the class of the field", () => {
      const header = new Header();
      header.set("From", "mikel@test.lindsaar.net");
      header.set("From", "bob@test.lindsaar.net");
      expect(one(header.get("From")).field.constructor).toBe(Mail.FromField);
    });
  });

  describe("folding and unfolding", () => {
    it("should unfold a header", () => {
      expect(one(new Header("To: Mikel,\r\n Lindsaar, Bob").get("To")).value).toEqual(
        "Mikel, Lindsaar, Bob",
      );
    });

    it("should preserve whitespace when unfolding a header", () => {
      const header = new Header("To: Mikel,\r\n\t   Lindsaar,     Bob");
      expect(one(header.get("To")).value).toEqual("Mikel,\t   Lindsaar,     Bob");
    });
  });

  describe("handling date fields with multiple values", () => {
    it("should add additional fields that can appear more than once", () => {
      for (const field of ["comments", "keywords", "x-spam"]) {
        const header = new Header();
        header.set(field, "1234");
        header.set(field, "5678");
        expect((header.get(field) as Field[]).map((x) => x.value)).toEqual(["1234", "5678"]);
      }
    });
  });

  describe("encoding", () => {
    it("should output a parsed version of itself to US-ASCII on encoded and tidy up and sort correctly", () => {
      const encoded = new Header(
        "To: Mikel\r\n Lindsaar <mikel@test.lindsaar.net>\r\nFrom: bob\r\n <bob@test.lindsaar.net>\r\nSubject: This is\r\n a long\r\n  \t \t \t    badly formatted             \r\n       \t\t  \t       field",
      ).encoded();
      expect(encoded).toEqual(
        "From: bob <bob@test.lindsaar.net>\r\nTo: Mikel Lindsaar <mikel@test.lindsaar.net>\r\nSubject: This is a long           badly formatted                             \r\n   field\r\n",
      );
    });
  });

  describe("detecting required fields", () => {
    it("should not say it has a message id if it doesn't", () => {
      expect(new Header().hasMessageId()).toBe(false);
    });

    it("should say it has a message id if it does", () => {
      expect(new Header("Message-ID: 1234").hasMessageId()).toBe(true);
    });

    it("should not say it has a date if it doesn't", () => {
      expect(new Header().hasDate()).toBe(false);
    });

    it("should not say it has a mime-version if it doesn't", () => {
      expect(new Header().hasMimeVersion()).toBe(false);
    });
  });

  describe("configuration option .maximum_amount", () => {
    it("should be 1000 by default", () => {
      expect(Header.maximumAmount).toEqual(1000);
    });

    it("should limit amount of parsed headers", () => {
      const old = Header.maximumAmount;
      Header.maximumAmount = 10;
      try {
        expect(new Header("X-SubscriberID: 345\n".repeat(11)).fields.length).toEqual(10);
      } finally {
        Header.maximumAmount = old;
      }
    });
  });
});
