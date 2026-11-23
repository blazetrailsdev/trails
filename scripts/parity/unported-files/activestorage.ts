import type { UnportedFile } from "./types.js";

const CLOUD_SERVICE =
  "PERMANENT: a cloud-SDK service, a non-goal of RFC 0209-activestorage-port; Disk is the one ported service.";
const AZURE_SERVICE =
  "PERMANENT: Rails deprecates AzureStorageService and the azure-storage-blob gem (vendor/rails/v8.0.5.2/activestorage/lib/active_storage/service/azure_storage_service.rb:21); RFC 0215-activestorage-cloud-services decision 1 keeps Azure unported.";
const JAVASCRIPT_PACKAGE =
  "PERMANENT: tests the browser JavaScript, a non-goal of RFC 0209-activestorage-port (published upstream as @rails/activestorage).";

export const ACTIVESTORAGE_UNPORTED_FILES: UnportedFile[] = [
  {
    testFile: "controllers/direct_uploads_controller_test.rb",
    tests: ["creating new direct upload"],
    className: "ActiveStorage::S3DirectUploadsControllerTest",
    reason: CLOUD_SERVICE,
  },
  {
    testFile: "controllers/direct_uploads_controller_test.rb",
    tests: ["creating new direct upload"],
    className: "ActiveStorage::GCSDirectUploadsControllerTest",
    reason: CLOUD_SERVICE,
  },
  {
    testFile: "controllers/direct_uploads_controller_test.rb",
    tests: ["creating new direct upload"],
    className: "ActiveStorage::AzureStorageDirectUploadsControllerTest",
    reason: AZURE_SERVICE,
  },
  {
    testFile: "controllers/blobs/redirect_controller_test.rb",
    tests: ["showing existing blob stored in s3", "showing existing blob stored in gcs"],
    reason: CLOUD_SERVICE,
  },
  {
    testFile: "controllers/blobs/redirect_controller_test.rb",
    tests: ["showing existing blob stored in azure"],
    reason: AZURE_SERVICE,
  },
  {
    testFile: "controllers/representations/redirect_controller_test.rb",
    tests: ["showing existing variant stored in azure"],
    reason: AZURE_SERVICE,
  },
  {
    testFile: "service/configurator_test.rb",
    tests: ["azure service is deprecated"],
    reason: AZURE_SERVICE,
  },
  {
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
    reason: AZURE_SERVICE,
  },
  {
    testFile: "service/azure_storage_public_service_test.rb",
    package: "activestorage",
    reason: AZURE_SERVICE,
  },
  { testFile: "javascript_package_test.rb", package: "activestorage", reason: JAVASCRIPT_PACKAGE },
];
