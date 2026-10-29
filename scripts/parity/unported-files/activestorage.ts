import type { UnportedFile } from "./types.js";

const CLOUD_SERVICE =
  "PERMANENT: a cloud-SDK service, a non-goal of RFC 0209-activestorage-port; Disk is the one ported service.";
const JAVASCRIPT_PACKAGE =
  "PERMANENT: tests the browser JavaScript, a non-goal of RFC 0209-activestorage-port (published upstream as @rails/activestorage).";

export const ACTIVESTORAGE_UNPORTED_FILES: UnportedFile[] = [
  {
    pattern: "service/s3_service.rb",
    testFile: "service/s3_service_test.rb",
    package: "activestorage",
    reason: CLOUD_SERVICE,
  },
  {
    testFile: "service/s3_public_service_test.rb",
    package: "activestorage",
    reason: CLOUD_SERVICE,
  },
  {
    pattern: "service/gcs_service.rb",
    testFile: "service/gcs_service_test.rb",
    package: "activestorage",
    reason: CLOUD_SERVICE,
  },
  {
    testFile: "service/gcs_public_service_test.rb",
    package: "activestorage",
    reason: CLOUD_SERVICE,
  },
  {
    pattern: "service/azure_storage_service.rb",
    testFile: "service/azure_storage_service_test.rb",
    package: "activestorage",
    reason: CLOUD_SERVICE,
  },
  {
    testFile: "service/azure_storage_public_service_test.rb",
    package: "activestorage",
    reason: CLOUD_SERVICE,
  },
  { testFile: "javascript_package_test.rb", package: "activestorage", reason: JAVASCRIPT_PACKAGE },
];
