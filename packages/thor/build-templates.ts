import { buildTemplates } from "@blazetrails/trails-tsc";

const fixtures = decodeURIComponent(
  new URL("./src/test-helpers/fixtures", import.meta.url).pathname,
);

export default async function setup(): Promise<void> {
  await buildTemplates([fixtures, `${fixtures}/doc/config.rb`, `${fixtures}/doc/block_helper.rb`]);
}
