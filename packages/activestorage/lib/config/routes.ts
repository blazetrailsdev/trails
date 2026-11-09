import type { Mapper, RouteSet } from "@blazetrails/actionpack";
import { TopLevel } from "@blazetrails/activesupport";
import { hashDelete, rbObjRespondTo } from "@blazetrails/ruby-compat";
import { ActiveStorage } from "../active-storage.js";
import type { Attachment } from "../attachment.js";
import type { Blob } from "../blob.js";
import type { Variant } from "../variant.js";

type Host = { routeFor(name: string, ...args: unknown[]): string };
type Options = Record<string, unknown>;
type SignedIdOptions = NonNullable<Parameters<Blob["signedId"]>[0]>;
type Representation = Pick<Variant, "blob" | "variation">;

if (ActiveStorage.drawRoutes) {
  (TopLevel.Trails!.application!.routes() as unknown as RouteSet).draw(function (this: Mapper) {
    this.scope(ActiveStorage.routesPrefix, function (this: Mapper) {
      this.get("/blobs/redirect/:signed_id/*filename", {
        to: "active_storage/blobs/redirect#show",
        as: "trails_service_blob",
      });
      this.get("/blobs/proxy/:signed_id/*filename", {
        to: "active_storage/blobs/proxy#show",
        as: "trails_service_blob_proxy",
      });
      this.get("/blobs/:signed_id/*filename", { to: "active_storage/blobs/redirect#show" });

      this.get("/representations/redirect/:signed_blob_id/:variation_key/*filename", {
        to: "active_storage/representations/redirect#show",
        as: "trails_blob_representation",
      });
      this.get("/representations/proxy/:signed_blob_id/:variation_key/*filename", {
        to: "active_storage/representations/proxy#show",
        as: "trails_blob_representation_proxy",
      });
      this.get("/representations/:signed_blob_id/:variation_key/*filename", {
        to: "active_storage/representations/redirect#show",
      });

      this.get("/disk/:encoded_key/*filename", {
        to: "active_storage/disk#show",
        as: "trails_disk_service",
      });
      this.put("/disk/:encoded_token", {
        to: "active_storage/disk#update",
        as: "update_trails_disk_service",
      });
      this.post("/direct_uploads", {
        to: "active_storage/direct_uploads#create",
        as: "trails_direct_uploads",
      });
    });

    this.direct("trails_representation", {}, function (representation, options) {
      return (this as unknown as Host).routeFor(
        ActiveStorage.resolveModelToRoute,
        representation,
        options,
      );
    });

    this.resolve(
      "ActiveStorage::Variant",
      function (this: Host, variant: unknown, options: unknown) {
        return this.routeFor(ActiveStorage.resolveModelToRoute, variant, options);
      },
    );
    this.resolve(
      "ActiveStorage::VariantWithRecord",
      function (this: Host, variant: unknown, options: unknown) {
        return this.routeFor(ActiveStorage.resolveModelToRoute, variant, options);
      },
    );
    this.resolve(
      "ActiveStorage::Preview",
      function (this: Host, preview: unknown, options: unknown) {
        return this.routeFor(ActiveStorage.resolveModelToRoute, preview, options);
      },
    );

    this.direct("trails_blob", {}, function (blob, options) {
      return (this as unknown as Host).routeFor(ActiveStorage.resolveModelToRoute, blob, options);
    });

    this.resolve("ActiveStorage::Blob", function (this: Host, blob: unknown, options: unknown) {
      return this.routeFor(ActiveStorage.resolveModelToRoute, blob, options);
    });
    this.resolve(
      "ActiveStorage::Attachment",
      function (this: Host, attachment: unknown, options: unknown) {
        return this.routeFor(
          ActiveStorage.resolveModelToRoute,
          (attachment as Attachment).blob,
          options,
        );
      },
    );

    this.direct("trails_storage_proxy", {}, function (model, options) {
      const expiresIn = hashDelete(
        options as Options,
        "expiresIn",
        () => ActiveStorage.urlsExpireIn,
      ) as SignedIdOptions["expiresIn"];
      const expiresAt = hashDelete(options as Options, "expiresAt") as SignedIdOptions["expiresAt"];

      if (rbObjRespondTo(model, "signedId")) {
        return (this as unknown as Host).routeFor(
          "trails_service_blob_proxy",
          (model as Blob).signedId({ expiresIn: expiresIn, expiresAt: expiresAt }),
          (model as Blob).filename,
          options,
        );
      } else {
        const signedBlobId = (model as Representation).blob.signedId({
          expiresIn: expiresIn,
          expiresAt: expiresAt,
        });
        const variationKey = (model as Representation).variation.key;
        const filename = (model as Representation).blob.filename;

        return (this as unknown as Host).routeFor(
          "trails_blob_representation_proxy",
          signedBlobId,
          variationKey,
          filename,
          options,
        );
      }
    });

    this.direct("trails_storage_redirect", {}, function (model, options) {
      const expiresIn = hashDelete(
        options as Options,
        "expiresIn",
        () => ActiveStorage.urlsExpireIn,
      ) as SignedIdOptions["expiresIn"];
      const expiresAt = hashDelete(options as Options, "expiresAt") as SignedIdOptions["expiresAt"];

      if (rbObjRespondTo(model, "signedId")) {
        return (this as unknown as Host).routeFor(
          "trails_service_blob",
          (model as Blob).signedId({ expiresIn: expiresIn, expiresAt: expiresAt }),
          (model as Blob).filename,
          options,
        );
      } else {
        const signedBlobId = (model as Representation).blob.signedId({
          expiresIn: expiresIn,
          expiresAt: expiresAt,
        });
        const variationKey = (model as Representation).variation.key;
        const filename = (model as Representation).blob.filename;

        return (this as unknown as Host).routeFor(
          "trails_blob_representation",
          signedBlobId,
          variationKey,
          filename,
          options,
        );
      }
    });
  });
}
