import type {} from "@blazetrails/vitest-matchers";
import { beforeEach, describe, expect, it } from "vitest";
import { type RouteSet } from "@blazetrails/actionpack";
import { IntegrationTest } from "@blazetrails/actionpack/testing";
import { TopLevel } from "@blazetrails/activesupport";
import { assertDifference } from "@blazetrails/activesupport/testing/assertions";
import type { Message } from "@blazetrails/mail";
import { Trails } from "@blazetrails/trailties";
import "../../../test-helpers/test-helper.js";
import { InboundEmail } from "../../../inbound-email.js";
import "../../../action-mailbox/inbound-emails-controller.js";

const routes = TopLevel.Trails!.application!.routes() as unknown as RouteSet;
const trailsConductorInboundEmailsPath = () =>
  (
    routes.urlHelpers() as unknown as Record<string, () => string>
  ).trailsConductorInboundEmailsPath();

let t: IntegrationTest & { fixtureFileUpload(path: string): unknown };

async function withTrailsEnv(env: string, block: () => Promise<void>): Promise<void> {
  const oldTrailsEnv = Trails.env;
  try {
    Trails.env = env;
    await block();
  } finally {
    Trails.env = oldTrailsEnv;
  }
}

async function lastMail(): Promise<Message> {
  return ((await InboundEmail.last()) as InboundEmail).mail();
}

describe("Trails::Conductor::ActionMailbox::InboundEmailsControllerTest", () => {
  beforeEach(() => {
    t = new IntegrationTest(expect.getState().currentTestName!) as typeof t;
    t.app = routes;
  });

  it("create inbound email", async () => {
    await withTrailsEnv("development", async () => {
      await assertDifference(
        () => InboundEmail.count(),
        +1,
        null,
        async () => {
          await t.post(trailsConductorInboundEmailsPath(), {
            params: {
              mail: {
                from: "Jason Fried <jason@37signals.com>",
                to: "Replies <replies@example.com>",
                cc: "CC <cc@example.com>",
                bcc: "Bcc <bcc@example.com>",
                in_reply_to: "<4e6e35f5a38b4_479f13bb90078178@small-app-01.mail>",
                subject: "Hey there",
                body: "How's it going?",
              },
            },
          });
        },
      );

      const mail = await lastMail();
      expect(mail.from()).toEqualRuby(["jason@37signals.com"]);
      expect(mail.to()).toEqualRuby(["replies@example.com"]);
      expect(mail.cc()).toEqualRuby(["cc@example.com"]);
      expect(mail.bcc()).toEqualRuby(["bcc@example.com"]);
      expect(mail.inReplyTo()).toBe("4e6e35f5a38b4_479f13bb90078178@small-app-01.mail");
      expect(mail.subject()).toBe("Hey there");
      expect(mail.body().decoded()).toEqualRuby("How's it going?");
    });
  });

  it("create inbound email with bcc", async () => {
    await withTrailsEnv("development", async () => {
      await assertDifference(
        () => InboundEmail.count(),
        +1,
        null,
        async () => {
          await t.post(trailsConductorInboundEmailsPath(), {
            params: {
              mail: {
                from: "Jason Fried <jason@37signals.com>",
                bcc: "Replies <replies@example.com>",
                subject: "Hey there",
                body: "How's it going?",
              },
            },
          });
        },
      );

      const mail = await lastMail();
      expect(mail.from()).toEqualRuby(["jason@37signals.com"]);
      expect(mail.bcc()).toEqualRuby(["replies@example.com"]);
      expect(mail.subject()).toBe("Hey there");
      expect(mail.body().decoded()).toEqualRuby("How's it going?");
    });
  });

  it("create inbound email with attachments", async () => {
    await withTrailsEnv("development", async () => {
      await assertDifference(
        () => InboundEmail.count(),
        +1,
        null,
        async () => {
          await t.post(trailsConductorInboundEmailsPath(), {
            params: {
              mail: {
                from: "Jason Fried <jason@37signals.com>",
                to: "Replies <replies@example.com>",
                subject: "Let's debate some attachments",
                body: "Let's talk about these images:",
                attachments: [
                  t.fixtureFileUpload("avatar1.jpeg"),
                  t.fixtureFileUpload("avatar2.jpeg"),
                ],
              },
            },
          });
        },
      );

      const mail = await lastMail();
      expect(mail.textPart()!.decoded()).toBe("Let's talk about these images:");
      expect(mail.attachments().length).toBe(2);
      expect(mail.attachments().map((a) => a.filename())).toEqual(["avatar1.jpeg", "avatar2.jpeg"]);
    });
  });

  it("create inbound email with empty attachment", async () => {
    await withTrailsEnv("development", async () => {
      await assertDifference(
        () => InboundEmail.count(),
        +1,
        null,
        async () => {
          await t.post(trailsConductorInboundEmailsPath(), {
            params: {
              mail: {
                from: "",
                to: "",
                cc: "",
                bcc: "",
                x_original_to: "",
                subject: "",
                in_reply_to: "",
                body: "",
                attachments: [""],
              },
            },
          });
        },
      );

      const mail = await lastMail();
      expect(mail.attachments().length).toBe(0);
    });
  });
});
