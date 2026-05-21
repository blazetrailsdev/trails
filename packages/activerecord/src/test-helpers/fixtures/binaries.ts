// activerecord/test/fixtures/binaries.yml
// Rails YAML carries a `!binary` literal (flowers) and an `<%= binary(...) %>`
// ERB helper (binary_helper). fixtures:compare reports the YAML as
// ERB-UNSUPPORTED and skips it; the binary payload is intentionally
// not mirrored here — tests that need real bytes should build them in-test.
export const binaryFixtureData = {
  flowers: {
    id: 1,
  },
  binary_helper: {
    id: 2,
  },
};
