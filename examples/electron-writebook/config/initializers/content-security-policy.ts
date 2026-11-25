import { Trails } from "@blazetrails/trailties";

// Enforcing baseline policy. Scripts run only from this origin (and a
// configured asset host, which InlineScriptHashes adds per request).
//
// Nothing else is restricted: images, media, fonts, styles (including an
// account's custom styles) and connections behave as before.
//
// DISABLE_CONTENT_SECURITY_POLICY=true is the escape hatch for an install whose
// proxy or customization injects scripts the policy would block.
if (process.env.DISABLE_CONTENT_SECURITY_POLICY !== "true") {
  Trails.application.config.contentSecurityPolicy((policy) => {
    policy.scriptSrc(":self");
    policy.objectSrc(":none");
    policy.baseUri(":self");
  });
}
