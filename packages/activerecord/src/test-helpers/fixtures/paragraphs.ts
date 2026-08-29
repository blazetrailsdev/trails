export const paragraphFixtureData = Object.fromEntries(
  Array.from({ length: 1001 }, (_, i) => [`fixture_no_${i}`, { id: i, book_id: i * i }]),
);
