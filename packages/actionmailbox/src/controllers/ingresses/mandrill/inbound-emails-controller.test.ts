import { beforeEach, describe, expect, it } from "vitest";
import { type RouteSet } from "@blazetrails/actionpack";
import { IntegrationTest } from "@blazetrails/actionpack/testing";
import { TopLevel } from "@blazetrails/activesupport";
import {
  assertDifference,
  assertNoDifference,
} from "@blazetrails/activesupport/testing/assertions";
import { ArgumentError, env, setEnv } from "@blazetrails/ruby-compat";
import "../../../test-helpers/test-helper.js";
import { ActionMailbox } from "../../../action-mailbox.js";
import { InboundEmail } from "../../../inbound-email.js";
import "../../../ingresses/mandrill/inbound-emails-controller.js";

setEnv("MANDRILL_INGRESS_API_KEY", "1l9Qf7lutEf7h73VXfBwhw");

const routes = TopLevel.Trails!.application!.routes() as unknown as RouteSet;
const urlHelpers = () => routes.urlHelpers() as unknown as Record<string, (o: object) => string>;
const trailsMandrillInboundHealthCheckUrl = () =>
  urlHelpers().trailsMandrillInboundHealthCheckUrl({ host: "www.example.com" });
const trailsMandrillInboundEmailsUrl = () =>
  urlHelpers().trailsMandrillInboundEmailsUrl({ host: "www.example.com" });

const SIGNATURE = "3zfhiOajn0zjWVD6NPBp1sZJyPA=";

let t: IntegrationTest;
let events: string;

async function switchKeyTo(newKey: string | null, block: () => Promise<unknown>): Promise<void> {
  const previousKey = env.MANDRILL_INGRESS_API_KEY;
  setEnv("MANDRILL_INGRESS_API_KEY", newKey ?? undefined);
  try {
    await block();
  } finally {
    setEnv("MANDRILL_INGRESS_API_KEY", previousKey);
  }
}

describe("ActionMailbox::Ingresses::Mandrill::InboundEmailsControllerTest", () => {
  beforeEach(async () => {
    ActionMailbox.ingress = "mandrill";
    t = new IntegrationTest(expect.getState().currentTestName!);
    t.app = routes;
    events = JSON.stringify([
      { event: "inbound", msg: { raw_msg: await t.fileFixture("../files/welcome.eml").read() } },
    ]);
  });

  it("verifying existence of Mandrill inbound route", async () => {
    await t.head(trailsMandrillInboundHealthCheckUrl());
    t.assertResponse(":ok");
  });

  it("receiving an inbound email from Mandrill", async () => {
    await assertDifference(
      () => InboundEmail.count(),
      +1,
      null,
      async () => {
        await t.post(trailsMandrillInboundEmailsUrl(), {
          headers: { "X-Mandrill-Signature": SIGNATURE },
          params: { mandrill_events: events },
        });
      },
    );

    t.assertResponse(":ok");

    const inboundEmail = (await InboundEmail.last()) as InboundEmail;
    await inboundEmail.rawEmail.load();
    await (
      await inboundEmail.rawEmail.attachment
    )?.blob;
    expect(new TextDecoder().decode(await inboundEmail.rawEmail.download())).toBe(
      await t.fileFixture("../files/welcome.eml").read(),
    );
    expect(inboundEmail.message_id).toBe("0CB459E0-0336-41DA-BC88-E6E28C697DDB@37signals.com");
  });

  it("rejecting a forged inbound email from Mandrill", async () => {
    await assertNoDifference(
      () => InboundEmail.count(),
      null,
      async () => {
        await t.post(trailsMandrillInboundEmailsUrl(), {
          headers: { "X-Mandrill-Signature": "forged" },
          params: { mandrill_events: events },
        });
      },
    );

    t.assertResponse(":unauthorized");
  });

  it("raising when Mandrill API key is nil", async () => {
    await switchKeyTo(null, async () => {
      await expect(
        t.post(trailsMandrillInboundEmailsUrl(), {
          headers: { "X-Mandrill-Signature": "gldscd2tAb/G+DmpiLcwukkLrC4=" },
          params: { mandrill_events: events },
        }),
      ).rejects.toThrow(ArgumentError);
    });
  });

  it("raising when Mandrill API key is blank", async () => {
    await switchKeyTo("", async () => {
      await expect(
        t.post(trailsMandrillInboundEmailsUrl(), {
          headers: { "X-Mandrill-Signature": "gldscd2tAb/G+DmpiLcwukkLrC4=" },
          params: { mandrill_events: events },
        }),
      ).rejects.toThrow(ArgumentError);
    });
  });
});
