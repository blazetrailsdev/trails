// activerecord/test/fixtures/naked/yml/courses_with_invalid_key.yml
// "one" is a valid hash row; "two" is an array (not a hash) — Rails raises FormatError
// (test_yaml_file_with_one_invalid_fixture). In trails there is no YAML-parse step;
// this file is ported for fixtures-compare parity. The valid row { id: 1 } cannot be
// seeded in a tableless test because the courses.name column is NOT NULL (no default),
// and the FormatError behavior is YAML-parser-specific and cannot be ported.
export const nakedYmlCoursesWithInvalidKeyFixtureData = {
  one: { id: 1 },
};
