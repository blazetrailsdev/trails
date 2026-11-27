import buildActionmailboxTemplates from "../../../actionmailbox/test/support/build-templates.js";
import buildActiontextTemplates from "../../../actiontext/test/support/build-templates.js";
import buildSolidCableTemplates from "../../../solid-cable/test/support/build-templates.js";
import buildSolidCacheTemplates from "../../../solid-cache/test/support/build-templates.js";
import buildSolidQueueTemplates from "../../../solid-queue/test/support/build-templates.js";
import buildStimulusTemplates from "../../../stimulus/test/support/build-templates.js";
import buildTemplates from "./build-templates.js";
import isolationSetup from "./isolation/global-setup.js";

export default async function setup(): Promise<void> {
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
