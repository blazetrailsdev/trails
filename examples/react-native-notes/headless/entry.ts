import "../lib/hermes";
import "@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js";
import { Note, Notebook } from "../app/models";
import { connect, serially } from "../lib/database";

async function run(): Promise<string[]> {
  const out: string[] = [];
  await connect({ adapter: "expo-sqlite", database: "notes.db" });
  const work = await Notebook.createBang({ name: "Work" });
  await work.notes.createBang({ title: "Standup", pinned: true });
  await work.notes.createBang({ title: "Retro" });
  const titles = (await work.notes.order({ pinned: "desc", title: "asc" }).toArray()).map(
    (n: Note) => n.title,
  );
  out.push(`notes: ${titles.join(",")}`);
  out.push(`pinned: ${await Note.pinned().count()}`);
  const blank = new Notebook({ name: "" });
  out.push(`blank save: ${await blank.save()} ${blank.errors.fullMessages.join(";")}`);

  const counts = await Promise.all([
    serially(() => Notebook.count()),
    serially(() => Note.count()),
  ]);
  out.push(`serialized: ${counts.join(",")}`);
  try {
    await Promise.all([Notebook.count(), Note.count()]);
    out.push("unserialized: ok");
  } catch (e) {
    out.push(`unserialized: ${(e as Error).message}`);
  }

  await work.destroy();
  out.push(`after destroy: ${await Note.count()}`);
  return out;
}

(globalThis as { __headlessRun?: typeof run }).__headlessRun = run;
