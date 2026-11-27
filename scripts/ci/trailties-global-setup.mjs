import buildActionmailboxTemplates from "../../packages/actionmailbox/test/support/build-templates.ts";
import buildActiontextTemplates from "../../packages/actiontext/test/support/build-templates.ts";
import buildSolidCableTemplates from "../../packages/solid-cable/test/support/build-templates.ts";
import buildSolidCacheTemplates from "../../packages/solid-cache/test/support/build-templates.ts";
import buildSolidQueueTemplates from "../../packages/solid-queue/test/support/build-templates.ts";
import buildStimulusTemplates from "../../packages/stimulus/test/support/build-templates.ts";
import buildTemplates from "../../packages/trailties/test/support/build-templates.ts";
import isolationSetup from "../../packages/trailties/test/support/isolation/global-setup.ts";

export default async function setup() {
  for (const run of [
    buildTemplates,
    isolationSetup,
    buildSolidCableTemplates,
    buildSolidQueueTemplates,
    buildSolidCacheTemplates,
    buildActionmailboxTemplates,
    buildActiontextTemplates,
    buildStimulusTemplates,
  ]) {
    await run();
  }
}
