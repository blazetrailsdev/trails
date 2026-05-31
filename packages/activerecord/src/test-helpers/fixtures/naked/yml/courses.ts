// activerecord/test/fixtures/naked/yml/courses.yml
// Contains only the scalar "qwerty" — not a hash — so Rails raises FormatError.
// Zero valid fixture rows; seeding this data should succeed (empty insert).
export const nakedYmlCoursesFixtureData: Record<string, Record<string, unknown>> = {};
