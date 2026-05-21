import { ref, type FixtureRef } from "../define-fixtures.js";

// activerecord/test/fixtures/edges.yml
// Rails YAML uses ERB to generate edge_1..edge_4 with source/sink ids 1..4 / 2..5.
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
