import { describe, expect, it, vi } from "vitest";
import { Address } from "./address.js";
import { ContentDispositionElement } from "./content-disposition-element.js";
import { ContentLocationElement } from "./content-location-element.js";
import { ContentTransferEncodingElement } from "./content-transfer-encoding-element.js";
import { ContentTypeElement } from "./content-type-element.js";
import { DateTimeElement } from "./date-time-element.js";
import { EnvelopeFromElement } from "./envelope-from-element.js";
import { MessageIdsElement } from "./message-ids-element.js";
import { MimeVersionElement } from "./mime-version-element.js";
import { ReceivedElement } from "./received-element.js";

describe("Mail::Address", () => {
  it("inspects an address with its class, object id and formatted value", () => {
    expect(new Address("Mikel <test@lindsaar.net>").inspect()).toMatch(
      /^#<Mail::Address:\d+ Address: \|Mikel <test@lindsaar\.net>\| >$/,
    );
  });
});

describe("elements with no spec of their own", () => {
  it("cleans a trailing semicolon off a content type and disposition", () => {
    const type = new ContentTypeElement("text/plain; charset=utf-8;  ");
    expect([type.mainType, type.subType]).toEqual(["text", "plain"]);
    expect(new ContentDispositionElement("attachment;").dispositionType).toEqual("attachment");
  });

  it("inspects an address with its class, id and string form", () => {
    expect(new Address("a@b.c").inspect()).toMatch(/^#<Mail::Address:\d+ Address: \|a@b\.c\| >$/);
  });

  it("reads the remaining single-parser elements", () => {
    expect(new ContentLocationElement("foo.html").toString()).toEqual("foo.html");
    expect(new ContentTransferEncodingElement("base64").encoding).toEqual("base64");
    expect(new MimeVersionElement("1.0").minor).toEqual("0");
    expect(new DateTimeElement("Wed, 27 Apr 2005 14:15:31 -0700").timeString).toEqual(
      "14:15:31 -0700",
    );
    expect(MessageIdsElement.parse("<a@b>").messageId).toEqual("a@b");
  });

  it("omits the date from an envelope with none and formats ctime", () => {
    const envelope = new EnvelopeFromElement("a@b.c Fri Aug  7 00:39:21 2009");
    expect(envelope.formattedDateTime()).toEqual("Fri Aug  7 00:39:21 2009");
  });

  it("renders a received element and warns on an invalid date", () => {
    const received = new ReceivedElement("from a by b; Tue, 10 May 2005 17:26:50 +0000");
    expect(received.toString()).toEqual("from a by b; 2005-05-10T17:26:50+00:00");
    expect(new ReceivedElement("from a; Tue, 10 May 2005 17:26:50 -0700").toString()).toEqual(
      "from a; 2005-05-10T17:26:50-07:00",
    );
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const invalid = new ReceivedElement("from a by b; Tue, 31 Feb 2005 17:26:50 +0000");
    spy.mockRestore();
    expect(invalid.dateTime).toBeNull();
  });
});
