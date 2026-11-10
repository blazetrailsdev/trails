import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type RouteSet } from "@blazetrails/actionpack";
import { IntegrationTest } from "@blazetrails/actionpack/testing";
import { TopLevel } from "@blazetrails/activesupport";
import {
  assertDifference,
  assertNoDifference,
} from "@blazetrails/activesupport/testing/assertions";
import { travelBack, travelTo } from "@blazetrails/activesupport/testing/time-helpers";
import { Mail, type Field } from "@blazetrails/mail";
import { ArgumentError, File, env, setEnv } from "@blazetrails/ruby-compat";
import "../../../test-helpers/test-helper.js";
import { ActionMailbox } from "../../../action-mailbox.js";
import { InboundEmail } from "../../../inbound-email.js";
import "../../../ingresses/mailgun/inbound-emails-controller.js";

setEnv("MAILGUN_INGRESS_SIGNING_KEY", "tbsy84uSV1Kt3ZJZELY2TmShPRs91E3yL4tzf96297vBCkDWgL");

const routes = TopLevel.Trails!.application!.routes() as unknown as RouteSet;
let t: IntegrationTest;

function trailsMailgunInboundEmailsUrl(): string {
  return (
    routes.urlHelpers() as unknown as Record<string, (o: object) => string>
  ).trailsMailgunInboundEmailsUrl({ host: "www.example.com" });
}

async function switchKeyTo(newKey: string | null, block: () => Promise<unknown>): Promise<void> {
  const previousKey = env.MAILGUN_INGRESS_SIGNING_KEY;
  setEnv("MAILGUN_INGRESS_SIGNING_KEY", newKey ?? undefined);
  try {
    await block();
  } finally {
    setEnv("MAILGUN_INGRESS_SIGNING_KEY", previousKey);
  }
}

async function rawEmailOf(inboundEmail: InboundEmail): Promise<Uint8Array> {
  await inboundEmail.rawEmail.load();
  await (
    await inboundEmail.rawEmail.attachment
  )?.blob;
  return await inboundEmail.rawEmail.download();
}

const TOKEN = "7VwW7k6Ak7zcTwoSoNm7aTtbk1g67MKAnsYLfUB7PdszbgR5Xi";
const SIGNATURE = "ef24c5225322217bb065b80bb54eb4f9206d764e3e16abab07f0a64d1cf477cc";

describe("ActionMailbox::Ingresses::Mailgun::InboundEmailsControllerTest", () => {
  beforeEach(() => {
    ActionMailbox.ingress = "mailgun";
    t = new IntegrationTest(expect.getState().currentTestName!);
    t.app = routes;
  });

  afterEach(() => {
    travelBack();
  });

  it("receiving an inbound email from Mailgun", async () => {
    await assertDifference(
      () => InboundEmail.count(),
      +1,
      null,
      async () => {
        travelTo("2018-10-09 15:15:00 EDT");
        await t.post(trailsMailgunInboundEmailsUrl(), {
          params: {
            timestamp: 1539112500,
            token: TOKEN,
            signature: SIGNATURE,
            "body-mime": await t.fileFixture("../files/welcome.eml").read(),
          },
        });
      },
    );

    t.assertResponse("no_content");

    const inboundEmail = (await InboundEmail.last()) as InboundEmail;
    expect(new TextDecoder().decode(await rawEmailOf(inboundEmail))).toBe(
      await t.fileFixture("../files/welcome.eml").read(),
    );
    expect(inboundEmail.message_id).toBe("0CB459E0-0336-41DA-BC88-E6E28C697DDB@37signals.com");
  });

  // BLOCKED: ascii-8bit-param-encoding-answers-a-js-string-not-bytes
  it.skip("receiving an inbound email from Mailgun with non UTF-8 characters", async () => {
    await assertDifference(
      () => InboundEmail.count(),
      +1,
      null,
      async () => {
        travelTo("2018-10-09 15:15:00 EDT");
        await t.post(trailsMailgunInboundEmailsUrl(), {
          params: {
            timestamp: 1539112500,
            token: TOKEN,
            signature: SIGNATURE,
            "body-mime": await File.binreadAsync(String(t.fileFixture("../files/invalid_utf.eml"))),
          },
        });
      },
    );

    t.assertResponse("no_content");

    const inboundEmail = (await InboundEmail.last()) as InboundEmail;
    expect(await rawEmailOf(inboundEmail)).toEqual(
      await File.binreadAsync(String(t.fileFixture("../files/invalid_utf.eml"))),
    );
    expect(inboundEmail.message_id).toBe("05988AA6EC0D44318855A5E39E3B6F9E@jansterba.com");
  });

  it("add X-Original-To to email from Mailgun", async () => {
    await assertDifference(
      () => InboundEmail.count(),
      +1,
      null,
      async () => {
        travelTo("2018-10-09 15:15:00 EDT");
        await t.post(trailsMailgunInboundEmailsUrl(), {
          params: {
            timestamp: 1539112500,
            token: TOKEN,
            signature: SIGNATURE,
            "body-mime": await t.fileFixture("../files/welcome.eml").read(),
            recipient: "replies@example.com",
          },
        });
      },
    );

    t.assertResponse("no_content");

    const inboundEmail = (await InboundEmail.last()) as InboundEmail;
    const mail = Mail.fromSource(await rawEmailOf(inboundEmail));
    expect((mail.header().get("X-Original-To") as Field).decoded()).toBe("replies@example.com");
  });

  it("rejecting a delayed inbound email from Mailgun", async () => {
    await assertNoDifference(
      () => InboundEmail.count(),
      null,
      async () => {
        travelTo("2018-10-09 15:26:00 EDT");
        await t.post(trailsMailgunInboundEmailsUrl(), {
          params: {
            timestamp: 1539112500,
            token: TOKEN,
            signature: SIGNATURE,
            "body-mime": await t.fileFixture("../files/welcome.eml").read(),
          },
        });
      },
    );

    t.assertResponse("unauthorized");
  });

  it("rejecting a forged inbound email from Mailgun", async () => {
    await assertNoDifference(
      () => InboundEmail.count(),
      null,
      async () => {
        travelTo("2018-10-09 15:15:00 EDT");
        await t.post(trailsMailgunInboundEmailsUrl(), {
          params: {
            timestamp: 1539112500,
            token: "Zx8mJBiGmiiyyfWnho3zKyjCg2pxLARoCuBM7X9AKCioShGiMX",
            signature: SIGNATURE,
            "body-mime": await t.fileFixture("../files/welcome.eml").read(),
          },
        });
      },
    );

    t.assertResponse("unauthorized");
  });

  it("raising when the configured Mailgun Signing key is nil", async () => {
    await switchKeyTo(null, async () => {
      travelTo("2018-10-09 15:15:00 EDT");
      await expect(
        t.post(trailsMailgunInboundEmailsUrl(), {
          params: {
            timestamp: 1539112500,
            token: TOKEN,
            signature: SIGNATURE,
            "body-mime": await t.fileFixture("../files/welcome.eml").read(),
          },
        }),
      ).rejects.toThrow(ArgumentError);
    });
  });

  it("raising when the configured Mailgun Signing key is blank", async () => {
    await switchKeyTo("", async () => {
      travelTo("2018-10-09 15:15:00 EDT");
      await expect(
        t.post(trailsMailgunInboundEmailsUrl(), {
          params: {
            timestamp: 1539112500,
            token: TOKEN,
            signature: SIGNATURE,
            "body-mime": await t.fileFixture("../files/welcome.eml").read(),
          },
        }),
      ).rejects.toThrow(ArgumentError);
    });
  });
});
