import { ref, type FixtureRef } from "../../fixtures.js";

export const edgeFixtureData: Record<string, { source_id: FixtureRef; sink_id: FixtureRef }> =
  (() => {
    const out: Record<string, { source_id: FixtureRef; sink_id: FixtureRef }> = {};
    for (let id = 1; id <= 4; id++) {
      out[`edge_${id}`] = {
        source_id: ref("vertices", `vertex_${id}`),
        sink_id: ref("vertices", `vertex_${id + 1}`),
      };
    }
    return out;
  })();
