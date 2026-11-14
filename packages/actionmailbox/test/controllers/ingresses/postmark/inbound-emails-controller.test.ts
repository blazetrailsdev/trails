import { beforeEach, describe, expect, it } from "vitest";
import { type RouteSet } from "@blazetrails/actionpack";
import { IntegrationTest } from "@blazetrails/actionpack/testing";
import { TopLevel } from "@blazetrails/activesupport";
import {
  assertDifference,
  assertNoDifference,
} from "@blazetrails/activesupport/testing/assertions";
import { Mail, type Field } from "@blazetrails/mail";
import { ArgumentError, File } from "@blazetrails/ruby-compat";
import { credentials, switchPasswordTo } from "../../../support/test-helper.js";
import { ActionMailbox } from "../../../../lib/action-mailbox.js";
import { InboundEmail } from "../../../../lib/inbound-email.js";
import "../../../../lib/ingresses/postmark/inbound-emails-controller.js";

const routes = TopLevel.Trails!.application!.routes() as unknown as RouteSet;
let t: IntegrationTest;

function trailsPostmarkInboundEmailsUrl(): string {
  return (
    routes.urlHelpers() as unknown as Record<string, (o: object) => string>
  ).trailsPostmarkInboundEmailsUrl({ host: "www.example.com" });
}

async function rawEmailOf(inboundEmail: InboundEmail): Promise<Uint8Array> {
  await inboundEmail.rawEmail.load();
  await (
    await inboundEmail.rawEmail.attachment
  )?.blob;
  return await inboundEmail.rawEmail.download();
}

describe("ActionMailbox::Ingresses::Postmark::InboundEmailsControllerTest", () => {
  beforeEach(() => {
    ActionMailbox.ingress = "postmark";
    t = new IntegrationTest(expect.getState().currentTestName!);
    t.app = routes;
  });

  it("receiving an inbound email from Postmark", async () => {
    await assertDifference(
      () => InboundEmail.count(),
      +1,
      null,
      async () => {
        await t.post(trailsPostmarkInboundEmailsUrl(), {
          headers: { Authorization: credentials() },
          params: { RawEmail: await t.fileFixture("../files/welcome.eml").read() },
        });
      },
    );

    t.assertResponse(":no_content");

    const inboundEmail = (await InboundEmail.last()) as InboundEmail;
    expect(new TextDecoder().decode(await rawEmailOf(inboundEmail))).toBe(
      await t.fileFixture("../files/welcome.eml").read(),
    );
    expect(inboundEmail.message_id).toBe("0CB459E0-0336-41DA-BC88-E6E28C697DDB@37signals.com");
  });

  // BLOCKED: ascii-8bit-param-encoding-answers-a-js-string-not-bytes
  it.skip("receiving an inbound email from Postmark with non UTF-8 characters", async () => {
    await assertDifference(
      () => InboundEmail.count(),
      +1,
      null,
      async () => {
        await t.post(trailsPostmarkInboundEmailsUrl(), {
          headers: { Authorization: credentials() },
          params: { RawEmail: await t.fileFixture("../files/invalid_utf.eml").read() },
        });
      },
    );

    t.assertResponse(":no_content");

    const inboundEmail = (await InboundEmail.last()) as InboundEmail;
    expect(await rawEmailOf(inboundEmail)).toEqual(
      await File.binreadAsync(String(t.fileFixture("../files/invalid_utf.eml"))),
    );
    expect(inboundEmail.message_id).toBe("05988AA6EC0D44318855A5E39E3B6F9E@jansterba.com");
  });

  it("add X-Original-To to email from Postmark", async () => {
    await assertDifference(
      () => InboundEmail.count(),
      +1,
      null,
      async () => {
        await t.post(trailsPostmarkInboundEmailsUrl(), {
          headers: { Authorization: credentials() },
          params: {
            RawEmail: await t.fileFixture("../files/welcome.eml").read(),
            OriginalRecipient: "thisguy@domain.abcd",
          },
        });
      },
    );

    t.assertResponse(":no_content");

    const inboundEmail = (await InboundEmail.last()) as InboundEmail;
    const mail = Mail.fromSource(await rawEmailOf(inboundEmail));
    expect((mail.header().get("X-Original-To") as Field).decoded()).toBe("thisguy@domain.abcd");
  });

  it("rejecting when RawEmail param is missing", async () => {
    await assertNoDifference(
      () => InboundEmail.count(),
      null,
      async () => {
        await t.post(trailsPostmarkInboundEmailsUrl(), {
          headers: { Authorization: credentials() },
          params: { From: "someone@example.com" },
        });
      },
    );

    t.assertResponse(":unprocessable_entity");
  });

  it("rejecting an unauthorized inbound email from Postmark", async () => {
    await assertNoDifference(
      () => InboundEmail.count(),
      null,
      async () => {
        await t.post(trailsPostmarkInboundEmailsUrl(), {
          params: { RawEmail: await t.fileFixture("../files/welcome.eml").read() },
        });
      },
    );

    t.assertResponse(":unauthorized");
  });

  it("raising when the configured password is nil", async () => {
    await switchPasswordTo(null, async () => {
      await expect(
        t.post(trailsPostmarkInboundEmailsUrl(), {
          headers: { Authorization: credentials() },
          params: { RawEmail: await t.fileFixture("../files/welcome.eml").read() },
        }),
      ).rejects.toThrow(ArgumentError);
    });
  });

  it("raising when the configured password is blank", async () => {
    await switchPasswordTo("", async () => {
      await expect(
        t.post(trailsPostmarkInboundEmailsUrl(), {
          headers: { Authorization: credentials() },
          params: { RawEmail: await t.fileFixture("../files/welcome.eml").read() },
        }),
      ).rejects.toThrow(ArgumentError);
    });
  });
});
