// activerecord/test/fixtures/vertices.yml
// Rails YAML uses ERB to generate vertex_1..vertex_5 with matching ids.
export const vertexFixtureData: Record<string, { id: number }> = (() => {
  const out: Record<string, { id: number }> = {};
  for (let id = 1; id <= 5; id++) {
    out[`vertex_${id}`] = { id };
  }
  return out;
})();
