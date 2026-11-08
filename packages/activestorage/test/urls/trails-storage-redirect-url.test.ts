import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TopLevel } from "@blazetrails/activesupport";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { include } from "@blazetrails/ruby-compat";
import "../support/database/setup.js";
import { ActiveStorage } from "../../lib/active-storage.js";
import type { Blob } from "../../lib/blob.js";
import { createFileBlob } from "../support/test-helper.js";

type PathHelper = (model: unknown, options: { onlyPath: boolean }) => string;

class Helpers {
  declare trailsStorageProxyPath: PathHelper;
  declare trailsStorageRedirectPath: PathHelper;
  declare trailsBlobPath: PathHelper;
  declare trailsRepresentationPath: PathHelper;
}
include(Helpers, TopLevel.Trails!.application!.routes().urlHelpers());

describe("TrailsStorageRedirectUrlTest", () => {
  const helpers = new Helpers();
  let blob: Blob;
  let wasResolveModelToRoute: string;
  let variableContentTypesWas: string[];

  beforeEach(async () => {
    ActiveStorage.verifier = new MessageVerifier("Testing");
    variableContentTypesWas = ActiveStorage.variableContentTypes;
    ActiveStorage.variableContentTypes = ["image/jpeg"];
    blob = await createFileBlob({ filename: "racecar.jpg" });
    wasResolveModelToRoute = ActiveStorage.resolveModelToRoute;
    ActiveStorage.resolveModelToRoute = "trails_storage_redirect";
  });

  afterEach(() => {
    ActiveStorage.variableContentTypes = variableContentTypesWas;
    ActiveStorage.resolveModelToRoute = wasResolveModelToRoute;
  });

  it("trails_storage_proxy_path generates proxy path", () => {
    expect(helpers.trailsStorageProxyPath(blob, { onlyPath: true })).toContain(
      "/trails/active_storage/blobs/proxy/",
    );
  });

  it("trails_storage_redirect_path generates redirect path", () => {
    expect(helpers.trailsStorageRedirectPath(blob, { onlyPath: true })).toContain(
      "/trails/active_storage/blobs/redirect/",
    );
  });

  it("trails_blob_path generates redirect path", () => {
    expect(helpers.trailsBlobPath(blob, { onlyPath: true })).toContain(
      "/trails/active_storage/blobs/redirect/",
    );
  });

  it("trails_blob_path with variant generates redirect path", () => {
    const variant = blob.variant({ resizeToLimit: [100, 100] });
    expect(helpers.trailsBlobPath(variant, { onlyPath: true })).toContain(
      "/trails/active_storage/representations/redirect/",
    );
  });

  it("trails_representation_path generates proxy path", () => {
    const variant = blob.variant({ resizeToLimit: [100, 100] });
    expect(helpers.trailsRepresentationPath(variant, { onlyPath: true })).toContain(
      "/trails/active_storage/representations/redirect/",
    );
  });
});
