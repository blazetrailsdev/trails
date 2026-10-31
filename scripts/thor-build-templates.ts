import { buildTemplates } from "../packages/trails-tsc/src/index.js";

const fixtures = decodeURIComponent(
  new URL("../packages/thor/src/test-helpers/fixtures", import.meta.url).pathname,
);

export default async function setup(): Promise<void> {
  await buildTemplates([fixtures, `${fixtures}/doc/config.rb`, `${fixtures}/doc/block_helper.rb`]);
}
