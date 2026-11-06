import { buildTemplates } from "@blazetrails/trails-tsc";

export default async function setup(): Promise<void> {
  await buildTemplates([decodeURIComponent(new URL("../generators", import.meta.url).pathname)]);
}
