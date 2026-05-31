// activerecord/test/fixtures/naked/yml/courses_with_invalid_key.yml
// "one" is a valid hash row; "two" is an array (not a hash) and raises FormatError in Rails.
// Only the valid row is ported; the invalid "two" entry is intentionally omitted.
export const nakedYmlCoursesWithInvalidKeyFixtureData = {
  one: { id: 1 },
};
