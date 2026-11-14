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
import { credentials, switchPasswordTo } from "../../../test-helper.js";
import { ActionMailbox } from "../../../../lib/action-mailbox.js";
import { InboundEmail } from "../../../../lib/inbound-email.js";
import "../../../../lib/ingresses/sendgrid/inbound-emails-controller.js";

const routes = TopLevel.Trails!.application!.routes() as unknown as RouteSet;
let t: IntegrationTest;

function trailsSendgridInboundEmailsUrl(): string {
  return (
    routes.urlHelpers() as unknown as Record<string, (o: object) => string>
  ).trailsSendgridInboundEmailsUrl({ host: "www.example.com" });
}

async function rawEmailOf(inboundEmail: InboundEmail): Promise<Uint8Array> {
  await inboundEmail.rawEmail.load();
  await (
    await inboundEmail.rawEmail.attachment
  )?.blob;
  return await inboundEmail.rawEmail.download();
}

describe("ActionMailbox::Ingresses::Sendgrid::InboundEmailsControllerTest", () => {
  beforeEach(() => {
    ActionMailbox.ingress = "sendgrid";
    t = new IntegrationTest(expect.getState().currentTestName!);
    t.app = routes;
  });

  it("receiving an inbound email from Sendgrid", async () => {
    await assertDifference(
      () => InboundEmail.count(),
      +1,
      null,
      async () => {
        await t.post(trailsSendgridInboundEmailsUrl(), {
          headers: { Authorization: credentials() },
          params: { email: await t.fileFixture("../files/welcome.eml").read() },
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
  it.skip("receiving an inbound email from Sendgrid with non UTF-8 characters", async () => {
    await assertDifference(
      () => InboundEmail.count(),
      +1,
      null,
      async () => {
        await t.post(trailsSendgridInboundEmailsUrl(), {
          headers: { Authorization: credentials() },
          params: { email: await t.fileFixture("../files/invalid_utf.eml").read() },
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

  it("add X-Original-To to email from Sendgrid", async () => {
    await assertDifference(
      () => InboundEmail.count(),
      +1,
      null,
      async () => {
        await t.post(trailsSendgridInboundEmailsUrl(), {
          headers: { Authorization: credentials() },
          params: {
            email: await t.fileFixture("../files/welcome.eml").read(),
            envelope: '{"to":["replies@example.com"],"from":"jason@37signals.com"}',
          },
        });
      },
    );

    t.assertResponse(":no_content");

    const inboundEmail = (await InboundEmail.last()) as InboundEmail;
    const mail = Mail.fromSource(await rawEmailOf(inboundEmail));
    expect((mail.header().get("X-Original-To") as Field).decoded()).toBe("replies@example.com");
  });

  it("rejecting an unauthorized inbound email from Sendgrid", async () => {
    await assertNoDifference(
      () => InboundEmail.count(),
      null,
      async () => {
        await t.post(trailsSendgridInboundEmailsUrl(), {
          params: { email: await t.fileFixture("../files/welcome.eml").read() },
        });
      },
    );

    t.assertResponse(":unauthorized");
  });

  it("raising when the configured password is nil", async () => {
    await switchPasswordTo(null, async () => {
      await expect(
        t.post(trailsSendgridInboundEmailsUrl(), {
          headers: { Authorization: credentials() },
          params: { email: await t.fileFixture("../files/welcome.eml").read() },
        }),
      ).rejects.toThrow(ArgumentError);
    });
  });

  it("raising when the configured password is blank", async () => {
    await switchPasswordTo("", async () => {
      await expect(
        t.post(trailsSendgridInboundEmailsUrl(), {
          headers: { Authorization: credentials() },
          params: { email: await t.fileFixture("../files/welcome.eml").read() },
        }),
      ).rejects.toThrow(ArgumentError);
    });
  });
});
