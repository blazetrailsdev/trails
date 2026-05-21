// activerecord/test/fixtures/paragraphs.yml
// Rails ERB generates 1001 rows: fixture_no_<i> with id=i, book_id=i*i.
export const paragraphFixtureData = Object.fromEntries(
  Array.from({ length: 1001 }, (_, i) => [`fixture_no_${i}`, { id: i, book_id: i * i }]),
);
