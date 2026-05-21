// activerecord/test/fixtures/subscribers.yml
// Subscriber sets `self.primary_key = "nick"` (string PK). The subscribers
// table still has an integer `id` column in the schema, but it is not the PK
// and the Rails YAML never declares one.
export const subscriberFixtureData = {
  first: {
    nick: "alterself",
    name: "Luke Holden",
  },
  second: {
    nick: "webster132",
    name: "David Heinemeier Hansson",
  },
  third: {
    nick: "swistak",
    name: "Marcin Raczkowski",
  },
};
