import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TopLevel } from "@blazetrails/activesupport";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { include } from "@blazetrails/ruby-compat";
import "../test-helpers/database/setup.js";
import { ActiveStorage } from "../active-storage.js";
import type { Blob } from "../blob.js";
import { createFileBlob } from "../test-helpers/test-helper.js";

type PathHelper = (model: unknown, options: { onlyPath: boolean }) => string;

class Helpers {
  declare railsStorageProxyPath: PathHelper;
  declare railsStorageRedirectPath: PathHelper;
  declare railsBlobPath: PathHelper;
  declare railsRepresentationPath: PathHelper;
}
include(Helpers, TopLevel.Trails!.application!.routes().urlHelpers());

describe("RailsStorageProxyUrlTest", () => {
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
    ActiveStorage.resolveModelToRoute = "rails_storage_proxy";
  });

  afterEach(() => {
    ActiveStorage.variableContentTypes = variableContentTypesWas;
    ActiveStorage.resolveModelToRoute = wasResolveModelToRoute;
  });

  it("rails_storage_proxy_path generates proxy path", () => {
    expect(helpers.railsStorageProxyPath(blob, { onlyPath: true })).toContain(
      "/rails/active_storage/blobs/proxy/",
    );
  });

  it("rails_storage_redirect_path generates redirect path", () => {
    expect(helpers.railsStorageRedirectPath(blob, { onlyPath: true })).toContain(
      "/rails/active_storage/blobs/redirect/",
    );
  });

  it("rails_blob_path generates proxy path", () => {
    expect(helpers.railsBlobPath(blob, { onlyPath: true })).toContain(
      "/rails/active_storage/blobs/proxy/",
    );
  });

  it("rails_blob_path with variant generates proxy path", () => {
    const variant = blob.variant({ resizeToLimit: [100, 100] });
    expect(helpers.railsBlobPath(variant, { onlyPath: true })).toContain(
      "/rails/active_storage/representations/proxy/",
    );
  });

  it("rails_representation_path generates proxy path", () => {
    const variant = blob.variant({ resizeToLimit: [100, 100] });
    expect(helpers.railsRepresentationPath(variant, { onlyPath: true })).toContain(
      "/rails/active_storage/representations/proxy/",
    );
  });
});
