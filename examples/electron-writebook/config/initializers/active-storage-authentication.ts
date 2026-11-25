import { include } from "@blazetrails/activesupport";
import { ActiveStorage, DirectUploadsController, DiskController } from "@blazetrails/activestorage";
import { RedirectController as BlobsRedirectController } from "@blazetrails/activestorage/app/controllers/active-storage/blobs/redirect-controller.js";
import { ProxyController as BlobsProxyController } from "@blazetrails/activestorage/app/controllers/active-storage/blobs/proxy-controller.js";
import { RedirectController as RepresentationsRedirectController } from "@blazetrails/activestorage/app/controllers/active-storage/representations/redirect-controller.js";
import { ProxyController as RepresentationsProxyController } from "@blazetrails/activestorage/app/controllers/active-storage/representations/proxy-controller.js";
import { Trails } from "@blazetrails/trailties";
import { ActiveStorageAuthentication } from "../../app/controllers/concerns/active-storage-authentication.ts";
import { ActiveStorageAuthorization } from "../../app/controllers/concerns/active-storage-authorization.ts";

// Active Storage mounts its endpoints on framework controllers that inherit from
// ActiveStorage::BaseController, so they never pass through ApplicationController's
// require_authentication.
//
// Writebook uploads attachments through ActionText::Markdown::UploadsController
// as an ordinary multipart POST and does not use direct uploads at all, leaving
// the direct-upload write endpoints reachable by anyone who can read a public
// page. Require a valid Writebook session before an anonymous caller can
// allocate a Blob or persist bytes to disk.
//
// Reads are authorized against the book a blob belongs to. Every byte Writebook
// serves passes through the disk service's show action, so that is where the
// check has to be; the redirect endpoints check too, so a revoked URL fails at
// its first hop. Writebook never links to the proxy endpoints, which mark every
// response publicly cacheable forever, so they are closed rather than authorized.
Trails.application.config.toPrepare(() => {
  include(DirectUploadsController, ActiveStorageAuthentication);
  DirectUploadsController.beforeAction(":requireActiveStorageAuthentication");

  include(DiskController, ActiveStorageAuthentication);
  DiskController.beforeAction(":requireActiveStorageAuthentication", { only: "update" });

  include(DiskController, ActiveStorageAuthorization);
  DiskController.beforeAction(":requireReadableBlob", { only: "show" });
  Object.defineProperty(DiskController.prototype, "blobForAuthorization", {
    value: async function (this: { decodeVerifiedKey(): { key?: string } | null }) {
      return await ActiveStorage.Blob!.findBy({ key: this.decodeVerifiedKey()?.key });
    },
    writable: true,
    configurable: true,
  });

  for (const controller of [BlobsRedirectController, RepresentationsRedirectController]) {
    include(controller, ActiveStorageAuthorization);
    controller.beforeAction(":requireReadableBlob");
  }

  for (const controller of [BlobsProxyController, RepresentationsProxyController]) {
    controller.prependBeforeAction(async function (this: { head(status: string): Promise<void> }) {
      await this.head(":not_found");
    });
  }
});
