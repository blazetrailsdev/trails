import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { currentTimeInstant, Duration, TopLevel } from "@blazetrails/activesupport";
import { travel, travelBack } from "@blazetrails/activesupport/testing/time-helpers";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { IntegrationTest } from "@blazetrails/actionpack";
import "../../support/database/setup.js";
import { ActiveStorage } from "../../../lib/active-storage.js";
import type { Blob } from "../../../lib/blob.js";
import { createFileBlob } from "../../support/test-helper.js";
import "../../../lib/blobs/redirect-controller.js";

type Url = (...args: unknown[]) => string;
type Session = IntegrationTest & {
  integrationSession: { trailsServiceBlobUrl: Url; trailsStorageRedirectUrl: Url };
};

function integrationTest(name: string): Session {
  const t = new IntegrationTest(name) as Session;
  const routes = TopLevel.Trails!.application!.routes() as unknown as {
    call(env: unknown): unknown;
  };
  t.app = { routes: () => routes, call: (env: unknown) => routes.call(env) };
  return t;
}

describe("ActiveStorage::Blobs::RedirectControllerTest", () => {
  let t: Session;
  let blob: Blob;

  beforeEach(async ({ task }) => {
    ActiveStorage.verifier = new MessageVerifier("Testing");
    t = integrationTest(task.name);
    blob = await createFileBlob({ filename: "racecar.jpg" });
  });

  afterEach(() => {
    travelBack();
  });

  it("invalid signed ID", async () => {
    await t.get(t.integrationSession.trailsServiceBlobUrl("invalid", "racecar.jpg"));
    t.assertResponse("not_found");
  });

  it("HTTP caching", async () => {
    await t.get(t.integrationSession.trailsStorageRedirectUrl(blob));
    t.assertRedirectedTo(/racecar\.jpg/);
    expect(t.response.headers.get("Cache-Control")).toBe("max-age=300, private");
  });

  it("signed ID within expiration duration", async () => {
    await t.get(
      t.integrationSession.trailsStorageRedirectUrl(blob, { expiresIn: Duration.minutes(1) }),
    );
    t.assertRedirectedTo(/racecar\.jpg/);
  });

  it("Expired signed ID within expiration duration", async () => {
    const url = t.integrationSession.trailsStorageRedirectUrl(blob, {
      expiresIn: Duration.minutes(1),
    });
    travel(Duration.minutes(2));
    await t.get(url);
    t.assertResponse("not_found");
  });

  it("signed ID within expiration time", async () => {
    await t.get(
      t.integrationSession.trailsStorageRedirectUrl(blob, {
        expiresAt: currentTimeInstant().add({ minutes: 1 }),
      }),
    );
    t.assertRedirectedTo(/racecar\.jpg/);
  });

  it("Expired signed ID within expiration time", async () => {
    const url = t.integrationSession.trailsStorageRedirectUrl(blob, {
      expiresAt: currentTimeInstant().add({ minutes: 1 }),
    });
    travel(Duration.minutes(2));
    await t.get(url);
    t.assertResponse("not_found");
  });
});

describe("ActiveStorage::Blobs::ExpiringRedirectControllerTest", () => {
  let t: Session;
  let blob: Blob;
  let oldUrlsExpireIn: Duration | null;

  beforeEach(async ({ task }) => {
    ActiveStorage.verifier = new MessageVerifier("Testing");
    t = integrationTest(task.name);
    blob = await createFileBlob({ filename: "racecar.jpg" });
    oldUrlsExpireIn = ActiveStorage.urlsExpireIn;
    ActiveStorage.urlsExpireIn = Duration.minutes(1);
  });

  afterEach(() => {
    ActiveStorage.urlsExpireIn = oldUrlsExpireIn;
    travelBack();
  });

  it("signed ID within expiration date", async () => {
    await t.get(t.integrationSession.trailsStorageRedirectUrl(blob));
    t.assertRedirectedTo(/racecar\.jpg/);
  });

  it("Expired signed ID", async () => {
    const url = t.integrationSession.trailsStorageRedirectUrl(blob);
    travel(Duration.minutes(2));
    await t.get(url);
    t.assertResponse("not_found");
  });
});
