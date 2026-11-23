import { Configurator } from "@blazetrails/activestorage/service/configurator";

await Configurator.load();

for (const [name, config] of Object.entries({
  s3: { service: "S3", bucket: "bucket", region: "us-east-1" },
  gcs: { service: "GCS", bucket: "bucket", project: "project" },
})) {
  let message: string | undefined;
  try {
    Configurator.build(name, { [name]: config });
  } catch (error) {
    message = (error as Error).message;
  }
  const expected = `Missing service adapter for "${config.service}"`;
  if (message !== expected) throw new Error(`${name}: expected ${expected}, got ${message}`);
}
