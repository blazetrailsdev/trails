// activerecord/test/fixtures/citations.yml
// Rails YAML uses ERB to generate 65536 rows (fixture_no_0..fixture_no_65535)
// with book2_id = i*i. Used to stress fixture-set-size limits.
export const citationFixtureData: Record<string, { id: number; book2_id: number }> = (() => {
  const out: Record<string, { id: number; book2_id: number }> = {};
  for (let i = 0; i < 65536; i++) {
    out[`fixture_no_${i}`] = { id: i, book2_id: i * i };
  }
  return out;
})();
