import { CreateBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { Storage } from "@google-cloud/storage";

const s3 = new S3Client({
  endpoint: "http://localhost:8333",
  forcePathStyle: true,
  region: "us-east-1",
  credentials: { accessKeyId: "trails", secretAccessKey: "trails-secret" },
});
const gcs = new Storage({ apiEndpoint: "http://localhost:4443", projectId: "trails" });

for (const bucket of ["trails-private", "trails-public"]) {
  await s3.send(new CreateBucketCommand({ Bucket: bucket }));
  await gcs.createBucket(bucket);
}
