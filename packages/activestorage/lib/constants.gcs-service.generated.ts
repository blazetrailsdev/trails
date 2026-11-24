import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./service/gcs-service.js";

defineConstants([
  [() => m0, "GCSService", "ActiveStorage::Service::GCSService"],
  [() => m0, "MetadataServerError", "ActiveStorage::Service::GCSService::MetadataServerError"],
  [
    () => m0,
    "MetadataServerNotFoundError",
    "ActiveStorage::Service::GCSService::MetadataServerNotFoundError",
  ],
]);
