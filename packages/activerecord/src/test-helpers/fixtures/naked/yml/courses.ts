// activerecord/test/fixtures/naked/yml/courses.yml
// Contains only the scalar "qwerty" — not a hash — so Rails raises FormatError
// (test_dirty_dirty_yaml_file). In trails, fixtures are TS objects so there is no
// YAML-parse step; this file is ported for fixtures-compare parity (0 valid rows).
// The corresponding error behavior is YAML-parser-specific and cannot be ported.
export const nakedYmlCoursesFixtureData = {} as const;
