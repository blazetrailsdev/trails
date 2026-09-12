export const edgeFixtureData: Record<string, { source_id: number; sink_id: number }> = (() => {
  const out: Record<string, { source_id: number; sink_id: number }> = {};
  for (let id = 1; id <= 4; id++) {
    out[`edge_${id}`] = {
      source_id: id,
      sink_id: id + 1,
    };
  }
  return out;
})();
