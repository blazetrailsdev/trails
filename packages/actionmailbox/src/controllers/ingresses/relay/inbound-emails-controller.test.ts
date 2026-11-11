import { beforeEach, describe, expect, it } from "vitest";
import { type RouteSet } from "@blazetrails/actionpack";
import { IntegrationTest } from "@blazetrails/actionpack/testing";
import { TopLevel } from "@blazetrails/activesupport";
import {
  assertDifference,
  assertNoDifference,
} from "@blazetrails/activesupport/testing/assertions";
import { ArgumentError, File } from "@blazetrails/ruby-compat";
import { credentials, switchPasswordTo } from "../../../test-helpers/test-helper.js";
import { ActionMailbox } from "../../../action-mailbox.js";
import { InboundEmail } from "../../../inbound-email.js";
import "../../../ingresses/relay/inbound-emails-controller.js";

const routes = TopLevel.Trails!.application!.routes() as unknown as RouteSet;
let t: IntegrationTest;

function trailsRelayInboundEmailsUrl(): string {
  return (
    routes.urlHelpers() as unknown as Record<string, (o: object) => string>
  ).trailsRelayInboundEmailsUrl({ host: "www.example.com" });
}

describe("ActionMailbox::Ingresses::Relay::InboundEmailsControllerTest", () => {
  beforeEach(() => {
    ActionMailbox.ingress = "relay";
    t = new IntegrationTest(expect.getState().currentTestName!);
    t.app = routes;
  });

  it("receiving an inbound email relayed from an SMTP server", async () => {
    await assertDifference(
      () => InboundEmail.count(),
      +1,
      null,
      async () => {
        await t.post(trailsRelayInboundEmailsUrl(), {
          headers: { Authorization: credentials(), "Content-Type": "message/rfc822" },
          params: await t.fileFixture("../files/welcome.eml").read(),
        });
      },
    );

    t.assertResponse(":no_content");

    const inboundEmail = (await InboundEmail.last()) as InboundEmail;
    await inboundEmail.rawEmail.load();
    await (
      await inboundEmail.rawEmail.attachment
    )?.blob;
    expect(await inboundEmail.rawEmail.download()).toEqual(
      await File.binreadAsync(String(t.fileFixture("../files/welcome.eml"))),
    );
    expect(inboundEmail.message_id).toBe("0CB459E0-0336-41DA-BC88-E6E28C697DDB@37signals.com");
  });

  it("receiving an inbound email relayed from an SMTP server with non UTF-8 characters", async () => {
    await assertDifference(
      () => InboundEmail.count(),
      +1,
      null,
      async () => {
        await t.post(trailsRelayInboundEmailsUrl(), {
          headers: { Authorization: credentials(), "Content-Type": "message/rfc822" },
          params: await File.binreadAsync(String(t.fileFixture("../files/invalid_utf.eml"))),
        });
      },
    );

    t.assertResponse(":no_content");

    const inboundEmail = (await InboundEmail.last()) as InboundEmail;
    await inboundEmail.rawEmail.load();
    await (
      await inboundEmail.rawEmail.attachment
    )?.blob;
    expect(await inboundEmail.rawEmail.download()).toEqual(
      await File.binreadAsync(String(t.fileFixture("../files/invalid_utf.eml"))),
    );
    expect(inboundEmail.message_id).toBe("05988AA6EC0D44318855A5E39E3B6F9E@jansterba.com");
  });

  it("rejecting a request with no body", async () => {
    await assertNoDifference(
      () => InboundEmail.count(),
      null,
      async () => {
        await t.post(trailsRelayInboundEmailsUrl(), {
          headers: { Authorization: credentials(), "Content-Type": "message/rfc822" },
          env: { "rack.input": null },
        });
      },
    );

    t.assertResponse(":unprocessable_entity");
  });

  it("rejecting an unauthorized inbound email", async () => {
    await assertNoDifference(
      () => InboundEmail.count(),
      null,
      async () => {
        await t.post(trailsRelayInboundEmailsUrl(), {
          headers: { "Content-Type": "message/rfc822" },
          params: await t.fileFixture("../files/welcome.eml").read(),
        });
      },
    );

    t.assertResponse(":unauthorized");
  });

  it("rejecting an inbound email of an unsupported media type", async () => {
    await assertNoDifference(
      () => InboundEmail.count(),
      null,
      async () => {
        await t.post(trailsRelayInboundEmailsUrl(), {
          headers: { Authorization: credentials(), "Content-Type": "text/plain" },
          params: await t.fileFixture("../files/welcome.eml").read(),
        });
      },
    );

    t.assertResponse(":unsupported_media_type");
  });

  it("raising when the configured password is nil", async () => {
    await switchPasswordTo(null, async () => {
      await expect(
        t.post(trailsRelayInboundEmailsUrl(), {
          headers: { Authorization: credentials(), "Content-Type": "message/rfc822" },
          params: await t.fileFixture("../files/welcome.eml").read(),
        }),
      ).rejects.toThrow(ArgumentError);
    });
  });

  it("raising when the configured password is blank", async () => {
    await switchPasswordTo("", async () => {
      await expect(
        t.post(trailsRelayInboundEmailsUrl(), {
          headers: { Authorization: credentials(), "Content-Type": "message/rfc822" },
          params: await t.fileFixture("../files/welcome.eml").read(),
        }),
      ).rejects.toThrow(ArgumentError);
    });
  });
});
