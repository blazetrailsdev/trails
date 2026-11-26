import { Author } from "../app/models/author.ts";

const library: [name: string, born: number, books: [string, string, number][]][] = [
  [
    "Ursula K. Le Guin",
    1929,
    [
      ["A Wizard of Earthsea", "9780547773742", 1968],
      ["The Dispossessed", "9780061054884", 1974],
    ],
  ],
  [
    "Octavia E. Butler",
    1947,
    [
      ["Kindred", "9780807083697", 1979],
      ["Parable of the Sower", "9781538732182", 1993],
    ],
  ],
  ["Italo Calvino", 1923, [["Invisible Cities", "9780156453806", 1972]]],
];

for (const [name, born, books] of library) {
  const author = await Author.create({ name, born });
  for (const [title, isbn, published_year] of books) {
    await author.books.create({ title, isbn, published_year });
  }
}

console.log(`Seeded ${library.length} authors.`);
