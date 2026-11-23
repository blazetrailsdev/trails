import { describe } from "vitest";
import "../support/database/setup.js";
import { Service } from "../../lib/service.js";
import "../../lib/service/configurator.js";
import "../../lib/service/s3-service.js";
import { SERVICE_CONFIGURATIONS } from "../support/test-helper.js";
import { SharedServiceTests } from "./shared-service-tests.js";

describe.skipIf(!SERVICE_CONFIGURATIONS.s3)("ActiveStorage::Service::S3ServiceTest", () => {
  SharedServiceTests(Service.configure("s3", SERVICE_CONFIGURATIONS));
});
