import { env as ENV, File, OpenSSL } from "@blazetrails/ruby-compat";

const s3Endpoint = ENV["ACTIVE_STORAGE_S3_ENDPOINT"];
const gcsEndpoint = ENV["ACTIVE_STORAGE_GCS_ENDPOINT"];

export function s3Configuration(bucket: string, endpoint?: string): Record<string, unknown> {
  return {
    service: "S3",
    accessKeyId: "trails",
    secretAccessKey: "trails-secret",
    region: "us-east-1",
    bucket: bucket,
    ...(endpoint === undefined ? {} : { endpoint: endpoint, forcePathStyle: true }),
  };
}

export function gcsConfiguration(bucket: string, endpoint?: string): Record<string, unknown> {
  return {
    service: "GCS",
    credentials: {
      type: "service_account",
      project_id: "trails",
      private_key_id: "trails",
      private_key: new OpenSSL.PKey.RSA(2048).toPem(),
      client_email: "trails@trails.iam.gserviceaccount.com",
      client_id: "",
    },
    project: "trails",
    bucket: bucket,
    iam: false,
    ...(endpoint === undefined ? {} : { apiEndpoint: endpoint }),
  };
}

export const SERVICE_CONFIGURATIONS: Record<string, Record<string, unknown>> = {
  local: { service: "Disk", root: File.join(import.meta.dirname, "../../tmp/storage") },
  ...(s3Endpoint === undefined
    ? {}
    : {
        s3: s3Configuration("trails-private", s3Endpoint),
        s3_public: { ...s3Configuration("trails-public", s3Endpoint), public: true },
      }),
  ...(gcsEndpoint === undefined
    ? {}
    : {
        gcs: gcsConfiguration("trails-private", gcsEndpoint.replace("localhost", "127.0.0.1")),
        gcs_public: {
          ...gcsConfiguration("trails-public", gcsEndpoint.replace("localhost", "127.0.0.1")),
          public: true,
        },
      }),
};
