const PUBLISHED = {
  status: 2,
};

const PUBLISHED_PAPERBACK = {
  ...PUBLISHED,
  format: "paperback",
  language: 0,
};

const PUBLISHED_EBOOK = {
  ...PUBLISHED,
  format: "ebook",
};

export const otherBookFixtureData = {
  _fixture: {
    ignore: ["PUBLISHED", "PUBLISHED_PAPERBACK", "PUBLISHED_EBOOK"],
  },
  PUBLISHED,
  PUBLISHED_PAPERBACK,
  PUBLISHED_EBOOK,
  awdr: {
    ...PUBLISHED_PAPERBACK,
    name: "Agile Web Development with Rails",
  },
  rfr: {
    ...PUBLISHED_EBOOK,
    name: "Ruby for Rails",
  },
};
