import { describe } from "vitest";
import "../support/database/setup.js";
import { Service } from "../../lib/service.js";
import "../../lib/service/configurator.js";
import "../../lib/service/gcs-service.js";
import { SERVICE_CONFIGURATIONS } from "../support/test-helper.js";
import { SharedServiceTests } from "./shared-service-tests.js";

describe.skipIf(!SERVICE_CONFIGURATIONS.gcs)("ActiveStorage::Service::GCSServiceTest", () => {
  SharedServiceTests(Service.configure("gcs", SERVICE_CONFIGURATIONS));
});
