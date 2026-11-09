import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { currentTimeInstant, Duration, TopLevel } from "@blazetrails/activesupport";
import { stub } from "@blazetrails/activesupport/testing/method-call-assertions";
import { travel, travelBack } from "@blazetrails/activesupport/testing/time-helpers";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { ActionController } from "@blazetrails/actionpack";
import { ControllerTestRequest, IntegrationTest } from "@blazetrails/actionpack/testing";
import { SecureRandom, StandardError } from "@blazetrails/ruby-compat";
import "../../support/database/setup.js";
import { ActiveStorage } from "../../../lib/active-storage.js";
import { FileNotFoundError } from "../../../lib/errors.js";
import { createBlob, createFileBlob } from "../../support/test-helper.js";
import { ProxyController } from "../../../lib/blobs/proxy-controller.js";

type Url = (...args: unknown[]) => string;
type Session = IntegrationTest & {
  integrationSession: { trailsServiceBlobProxyUrl: Url; trailsStorageProxyUrl: Url };
};

function integrationTest(name: string): Session {
  const t = new IntegrationTest(name) as Session;
  const routes = TopLevel.Trails!.application!.routes() as unknown as {
    call(env: unknown): unknown;
  };
  t.app = { routes: () => routes, call: (env: unknown) => routes.call(env) };
  return t;
}

describe("ActiveStorage::Blobs::ProxyControllerTest", () => {
  let t: Session;

  beforeEach(({ task }) => {
    ActiveStorage.verifier = new MessageVerifier("Testing");
    t = integrationTest(task.name);
  });

  afterEach(() => {
    travelBack();
  });

  it("invalid signed ID", async () => {
    await t.get(t.integrationSession.trailsServiceBlobProxyUrl("invalid", "racecar.jpg"));
    t.assertResponse("not_found");
  });

  it("HTTP caching", async () => {
    await t.get(
      t.integrationSession.trailsStorageProxyUrl(await createFileBlob({ filename: "racecar.jpg" })),
    );
    t.assertResponse("success");
    expect(t.response.headers.get("Cache-Control")).toBe("max-age=3155695200, public, immutable");
  });

  it("invalidates cache and returns a 404 if the file is not found on download", async () => {
    const blob = await createFileBlob({ filename: "racecar.jpg" });
    const mockDownload = () => {
      throw new FileNotFoundError("File still uploading!");
    };
    await stub(blob.service, "download", mockDownload, [], async () => {
      await t.get(t.integrationSession.trailsStorageProxyUrl(blob));
    });
    t.assertResponse("not_found");
    expect(t.response.headers.get("Cache-Control")).toBe("no-cache");
  });

  it("invalidates cache and returns a 500 if an error is raised on download", async () => {
    const blob = await createFileBlob({ filename: "racecar.jpg" });
    const mockDownload = () => {
      throw new StandardError("Something is not cool!");
    };
    await stub(blob.service, "download", mockDownload, [], async () => {
      await t.get(t.integrationSession.trailsStorageProxyUrl(blob));
    });
    t.assertResponse("internal_server_error");
    expect(t.response.headers.get("Cache-Control")).toBe("no-cache");
  });

  it("forcing Content-Type to binary", async () => {
    await t.get(
      t.integrationSession.trailsStorageProxyUrl(await createBlob({ contentType: "text/html" })),
    );
    expect(t.response.headers.get("Content-Type")).toBe("application/octet-stream");
  });

  it("forcing Content-Disposition to attachment based on type", async () => {
    await t.get(
      t.integrationSession.trailsStorageProxyUrl(
        await createBlob({ contentType: "application/zip" }),
      ),
    );
    expect(t.response.headers.get("Content-Disposition")).toMatch(/^attachment; /);
  });

  it("caller can change disposition to attachment", async () => {
    const url = t.integrationSession.trailsStorageProxyUrl(
      await createBlob({ contentType: "image/jpeg" }),
      { disposition: "attachment" },
    );
    await t.get(url);
    expect(t.response.headers.get("Content-Disposition")).toMatch(/^attachment; /);
  });

  it("signed ID within expiration duration", async () => {
    await t.get(
      t.integrationSession.trailsStorageProxyUrl(
        await createFileBlob({ filename: "racecar.jpg" }),
        {
          expiresIn: Duration.minutes(1),
        },
      ),
    );
    t.assertResponse("success");
  });

  it("Expired signed ID within expiration duration", async () => {
    const url = t.integrationSession.trailsStorageProxyUrl(
      await createFileBlob({ filename: "racecar.jpg" }),
      { expiresIn: Duration.minutes(1) },
    );
    travel(Duration.minutes(2));
    await t.get(url);
    t.assertResponse("not_found");
  });

  it("signed ID within expiration time", async () => {
    await t.get(
      t.integrationSession.trailsStorageProxyUrl(
        await createFileBlob({ filename: "racecar.jpg" }),
        {
          expiresAt: currentTimeInstant().add({ minutes: 1 }),
        },
      ),
    );
    t.assertResponse("success");
  });

  it("Expired signed ID within expiration time", async () => {
    const url = t.integrationSession.trailsStorageProxyUrl(
      await createFileBlob({ filename: "racecar.jpg" }),
      { expiresAt: currentTimeInstant().add({ minutes: 1 }) },
    );
    travel(Duration.minutes(2));
    await t.get(url);
    t.assertResponse("not_found");
  });

  it("single Byte Range", async () => {
    await t.get(
      t.integrationSession.trailsStorageProxyUrl(await createFileBlob({ filename: "racecar.jpg" })),
      { headers: { Range: "bytes=5-9" } },
    );
    t.assertResponse("partial_content");
    expect(t.response.headers.get("Content-Length")).toBe("5");
    expect(t.response.headers.get("Content-Range")).toBe("bytes 5-9/1124062");
    expect(t.response.headers.get("Content-Type")).toBe("image/jpeg");
    expect(t.response.body).toBe(" Exif");
  });

  it("invalid Byte Range", async () => {
    await t.get(
      t.integrationSession.trailsStorageProxyUrl(await createFileBlob({ filename: "racecar.jpg" })),
      { headers: { Range: "bytes=*/1234" } },
    );
    t.assertResponse("range_not_satisfiable");
  });

  it("multiple Byte Ranges", async () => {
    const boundary = SecureRandom.hex();
    await stub(SecureRandom, "hex", boundary, [], async () => {
      await t.get(
        t.integrationSession.trailsStorageProxyUrl(
          await createFileBlob({ filename: "racecar.jpg" }),
        ),
        { headers: { Range: "bytes=5-9,13-17" } },
      );
      t.assertResponse("partial_content");
      expect(t.response.headers.get("Content-Length")).toBe("252");
      expect(t.response.headers.get("Content-Type")).toBe(
        `multipart/byteranges; boundary=${boundary}`,
      );
      expect(t.response.body).toBe(
        [
          "",
          `--${boundary}`,
          "Content-Type: image/jpeg",
          "Content-Range: bytes 5-9/1124062",
          "",
          " Exif",
          `--${boundary}`,
          "Content-Type: image/jpeg",
          "Content-Range: bytes 13-17/1124062",
          "",
          "I*\u0000\b\u0000",
          `--${boundary}--`,
          "",
        ].join("\r\n"),
      );
    });
  });

  it("uses a Live::Response", () => {
    const request = ControllerTestRequest.create({} as never);
    expect(
      (ProxyController as unknown as { makeResponseBang(r: unknown): unknown }).makeResponseBang(
        request,
      ),
    ).toBeInstanceOf(ActionController.LiveResponse);
  });
});

describe("ActiveStorage::Blobs::ExpiringProxyControllerTest", () => {
  let t: Session;
  let oldUrlsExpireIn: Duration | null;

  beforeEach(({ task }) => {
    ActiveStorage.verifier = new MessageVerifier("Testing");
    t = integrationTest(task.name);
    oldUrlsExpireIn = ActiveStorage.urlsExpireIn;
    ActiveStorage.urlsExpireIn = Duration.minutes(1);
  });

  afterEach(() => {
    ActiveStorage.urlsExpireIn = oldUrlsExpireIn;
    travelBack();
  });

  it("signed ID within expiration date", async () => {
    await t.get(
      t.integrationSession.trailsStorageProxyUrl(await createFileBlob({ filename: "racecar.jpg" })),
    );
    t.assertResponse("success");
  });

  it("Expired signed ID", async () => {
    const url = t.integrationSession.trailsStorageProxyUrl(
      await createFileBlob({ filename: "racecar.jpg" }),
    );
    travel(Duration.minutes(2));
    await t.get(url);
    t.assertResponse("not_found");
  });
});
