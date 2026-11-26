const db = { adapter: "expo-sqlite", database: "browser.db" };
export default { development: db, test: db, production: db };
