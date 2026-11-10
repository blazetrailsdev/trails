import { beforeEach, describe, expect, it } from "vitest";
import { Message } from "../../lib/message.js";
import { TestMailer } from "../../lib/network/delivery-methods/test-mailer.js";
import { Matchers } from "../../lib/matchers/attachment-matchers.js";
import { haveSentEmail } from "../../lib/matchers/has-sent-mail.js";

async function deliver(build: (mail: Message) => void | Promise<void>): Promise<Message> {
  const mail = new Message();
  mail.setFrom("mikel@me.com");
  mail.setTo(["you@you.com", "other@you.com"]);
  mail.setCc("cc@you.com");
  mail.setBcc("bcc@you.com");
  mail.setSubject("testing");
  await build(mail);
  await new TestMailer({}).deliverBang(mail);
  return mail;
}

describe("Mail::Matchers::HasSentEmailMatcher", () => {
  beforeEach(() => {
    TestMailer.deliveries = [];
  });

  it("does not match when nothing was delivered", () => {
    const matcher = haveSentEmail.call(Matchers);
    expect(matcher.isMatches(null)).toBe(false);
    expect(matcher.failureMessage()).toBe("Expected email to be sent (actual deliveries: [])");
  });

  it("matches on sender, recipients, cc and bcc", async () => {
    await deliver((m) => m.setBody("hello"));
    expect(
      haveSentEmail
        .call(Matchers)
        .from("mikel@me.com")
        .to("you@you.com")
        .to(["other@you.com"])
        .cc("cc@you.com")
        .bcc("bcc@you.com")
        .isMatches(null),
    ).toBe(true);
    expect(haveSentEmail.call(Matchers).from("nobody@me.com").isMatches(null)).toBe(false);
    expect(haveSentEmail.call(Matchers).to(["you@you.com", "x@y.com"]).isMatches(null)).toBe(false);
    expect(haveSentEmail.call(Matchers).cc("x@y.com").isMatches(null)).toBe(false);
    expect(haveSentEmail.call(Matchers).bcc(["x@y.com"]).isMatches(null)).toBe(false);
  });

  it("matches on subject and body, literal and by matcher", async () => {
    await deliver((m) => m.setBody("hello world"));
    expect(haveSentEmail.call(Matchers).withSubject("testing").isMatches(null)).toBe(true);
    expect(haveSentEmail.call(Matchers).withSubject("other").isMatches(null)).toBe(false);
    expect(haveSentEmail.call(Matchers).matchingSubject(/test/).isMatches(null)).toBe(true);
    expect(haveSentEmail.call(Matchers).matchingSubject(/nope/).isMatches(null)).toBe(false);
    expect(haveSentEmail.call(Matchers).withBody("hello world").isMatches(null)).toBe(true);
    expect(haveSentEmail.call(Matchers).withBody("bye").isMatches(null)).toBe(false);
    expect(haveSentEmail.call(Matchers).matchingBody(/world/).isMatches(null)).toBe(true);
    expect(haveSentEmail.call(Matchers).matchingBody(/moon/).isMatches(null)).toBe(false);
  });

  it("matches on text and html parts", async () => {
    await deliver((m) => {
      m.setTextPart("plain body");
      m.setHtmlPart("<p>html body</p>");
    });
    expect(haveSentEmail.call(Matchers).withText("plain body").isMatches(null)).toBe(true);
    expect(haveSentEmail.call(Matchers).withText("other").isMatches(null)).toBe(false);
    expect(haveSentEmail.call(Matchers).withHtml("<p>html body</p>").isMatches(null)).toBe(true);
    expect(haveSentEmail.call(Matchers).withHtml("<p>other</p>").isMatches(null)).toBe(false);
  });

  it("matches on attachments", async () => {
    await deliver(async (m) => {
      m.setBody("see attached");
      await m.attachments().set("notes.txt", "some notes");
    });
    expect(haveSentEmail.call(Matchers).withAnyAttachments().isMatches(null)).toBe(true);
    expect(haveSentEmail.call(Matchers).withNoAttachments().isMatches(null)).toBe(false);
    expect(
      haveSentEmail.call(Matchers).withAttachments(Matchers.anyAttachment()).isMatches(null),
    ).toBe(true);
    expect(
      haveSentEmail
        .call(Matchers)
        .withAttachments([Matchers.anAttachmentWithFilename("notes.txt")])
        .isMatches(null),
    ).toBe(true);
    expect(
      haveSentEmail
        .call(Matchers)
        .withAttachments(Matchers.anAttachmentWithFilename("other.txt"))
        .isMatches(null),
    ).toBe(false);
    expect(
      haveSentEmail
        .call(Matchers)
        .withAttachments(Matchers.anAttachmentWithMimeType("text/plain"))
        .isMatches(null),
    ).toBe(true);
    expect(
      haveSentEmail
        .call(Matchers)
        .withAttachments(Matchers.anAttachmentWithMimeType("image/png"))
        .isMatches(null),
    ).toBe(false);
  });

  it("matches a delivery without attachments by with_no_attachments", async () => {
    await deliver((m) => m.setBody("plain"));
    expect(haveSentEmail.call(Matchers).withNoAttachments().isMatches(null)).toBe(true);
    expect(haveSentEmail.call(Matchers).withAnyAttachments().isMatches(null)).toBe(false);
  });

  it("describes itself and explains its expectations", async () => {
    const matcher = haveSentEmail
      .call(Matchers)
      .from("mikel@me.com")
      .to("you@you.com")
      .cc(["cc@you.com"])
      .bcc("bcc@you.com")
      .withSubject("testing")
      .withBody("hello")
      .withText("t")
      .withHtml("h");
    expect(matcher.description()).toBe("send a matching email");
    const expectations =
      'from mikel@me.com to ["you@you.com"] cc ["cc@you.com"] bcc ["bcc@you.com"] ' +
      'with subject "testing" with body "hello" with a text part matching "t" ' +
      'with an HTML part matching "h" ';
    expect(matcher.failureMessage()).toBe(
      `Expected email to be sent ${expectations}(actual deliveries: [])`,
    );
    expect(matcher.failureMessageWhenNegated()).toBe(
      `Expected no email to be sent ${expectations}(actual deliveries: [])`,
    );
  });
});

describe("Mail::Matchers attachment matchers", () => {
  it("case-matches attachments only", async () => {
    const mail = new Message();
    await mail.attachments().set("notes.txt", "some notes");
    const attachment = mail.attachments()[0];
    expect(Matchers.anyAttachment().caseEquals(attachment)).toBe(true);
    expect(Matchers.anyAttachment().caseEquals(new Message())).toBe(false);
    expect(Matchers.anAttachmentWithFilename("notes.txt").filename).toBe("notes.txt");
    expect(Matchers.anAttachmentWithFilename("notes.txt").caseEquals(attachment)).toBe(true);
    expect(Matchers.anAttachmentWithFilename("x.txt").caseEquals(attachment)).toBe(false);
    expect(Matchers.anAttachmentWithMimeType("text/plain").mimeType).toBe("text/plain");
    expect(Matchers.anAttachmentWithMimeType("text/plain").caseEquals(attachment)).toBe(true);
    expect(Matchers.anAttachmentWithMimeType("image/png").caseEquals(attachment)).toBe(false);
  });
});

describe("Mail::Matchers::HasSentEmailMatcher#failure_message", () => {
  it("interpolates a subject or body matcher through to_s", () => {
    const matcher = haveSentEmail.call(Matchers).matchingSubject(/test/).matchingBody(/world/);
    expect(matcher.failureMessage()).toBe(
      'Expected email to be sent with subject matching "(?-ims:test)" ' +
        'with body matching "(?-ims:world)" (actual deliveries: [])',
    );
  });
});
