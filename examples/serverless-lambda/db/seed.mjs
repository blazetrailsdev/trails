import { DatabaseSync } from "node:sqlite";
import { rmSync } from "node:fs";

const path = new URL("./spike.sqlite3", import.meta.url).pathname;
rmSync(path, { force: true });
const db = new DatabaseSync(path);
db.exec(
  "CREATE TABLE posts (id INTEGER PRIMARY KEY, title VARCHAR, created_at DATETIME, updated_at DATETIME)",
);
const insert = db.prepare(
  "INSERT INTO posts (title, created_at, updated_at) VALUES (?, datetime(), datetime())",
);
for (let i = 1; i <= 10; i++) insert.run(`Post ${i}`);
db.close();
console.log(`seeded ${path}`);
