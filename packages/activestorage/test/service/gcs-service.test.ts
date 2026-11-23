import { describe } from "vitest";
import "../support/database/setup.js";
import { Service } from "../../lib/service.js";
import "../../lib/service/configurator.js";
import "../../lib/service/gcs-service.js";
import { SERVICE_CONFIGURATIONS } from "../support/test-helper.js";
import { SharedServiceTests } from "./shared-service-tests.js";

const SERVICE = SERVICE_CONFIGURATIONS.gcs
  ? Service.configure("gcs", SERVICE_CONFIGURATIONS)
  : null;

describe.skipIf(!SERVICE_CONFIGURATIONS.gcs)("ActiveStorage::Service::GCSServiceTest", () => {
  SharedServiceTests(SERVICE!);
});
