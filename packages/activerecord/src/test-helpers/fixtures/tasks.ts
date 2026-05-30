// activerecord/test/fixtures/tasks.yml
// Rails YAML carries tz-offset literals (`2005-03-30t06:30:00.00+01:00`).
// Rails parses them as Time and stores in UTC (default_timezone = :utc), so the
// persisted DATETIME is the +01:00 value minus one hour. MariaDB's `datetime`
// column rejects a tz suffix outright (SQLite tolerated it), so we carry the
// pre-normalized UTC wall-clock string — the same value Rails would store.
export const taskFixtureData = {
  first_task: {
    id: 1,
    starting: "2005-03-30 05:30:00",
    ending: "2005-03-30 07:30:00",
  },
  another_task: {
    id: 2,
  },
};
