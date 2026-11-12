import { env as ENV } from "@blazetrails/ruby-compat";
import { buildTemplates } from "@blazetrails/trails-tsc";

export default async function setup(): Promise<void> {
  if (ENV["ISOLATION_TEST"] != null) return;
  await buildTemplates([
    decodeURIComponent(new URL("../../lib/generators", import.meta.url).pathname),
    decodeURIComponent(new URL("../../lib/trails/generators", import.meta.url).pathname),
  ]);
}
