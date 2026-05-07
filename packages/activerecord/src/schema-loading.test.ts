import { describe, it } from "vitest";

describe("SchemaLoadingTest", () => {
  it.skip("basic model is loaded once", () => {
    // BLOCKED: GVL — schema loading via ActiveSupport.on_load / Zeitwerk, no Node.js equivalent
    // ROOT-CAUSE: Node.js has no Zeitwerk autoload or ActiveSupport::Dependencies; class reloading tests cannot translate
    // SCOPE: ~0 LOC fix; permanent skip-list.ts candidate
  });
  it.skip("model with custom lock is loaded once", () => {
    // BLOCKED: GVL — schema loading via ActiveSupport.on_load / Zeitwerk, no Node.js equivalent
    // ROOT-CAUSE: Node.js has no Zeitwerk autoload or ActiveSupport::Dependencies; class reloading tests cannot translate
    // SCOPE: ~0 LOC fix; permanent skip-list.ts candidate
  });
  it.skip("model with changed custom lock is loaded twice", () => {
    // BLOCKED: GVL — schema loading via ActiveSupport.on_load / Zeitwerk, no Node.js equivalent
    // ROOT-CAUSE: Node.js has no Zeitwerk autoload or ActiveSupport::Dependencies; class reloading tests cannot translate
    // SCOPE: ~0 LOC fix; permanent skip-list.ts candidate
  });
});
