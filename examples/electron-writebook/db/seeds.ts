// Seeds the library with public-domain books fetched from Project Gutenberg, one page per
// chapter. A book that cannot be fetched is skipped, so an offline first run still boots.
import { StringIO } from "@blazetrails/ruby-compat";
import { Book } from "../app/models/book.ts";
import { Page } from "../app/models/page.ts";

const BOOKS = [
  { id: 11, title: "Alice's Adventures in Wonderland", author: "Lewis Carroll", theme: "blue" },
  { id: 1342, title: "Pride and Prejudice", author: "Jane Austen", theme: "magenta" },
  { id: 84, title: "Frankenstein", author: "Mary Wollstonecraft Shelley", theme: "green" },
] as const;

// gutenberg.org first, then its PGLAF mirror, which serves the same paths.
const MIRRORS = ["https://www.gutenberg.org/cache/epub", "https://gutenberg.pglaf.org/cache/epub"];
const HEADING = /^(CHAPTER|Chapter|LETTER|Letter) ([IVXLCDM\d]+)\b.*$/gm;
// An illustration caption, closed or left open where the next heading cuts it.
const ILLUSTRATION = /\[Illustration[^\]]*(?:\]|$)/g;

async function fetchBytes(path: string): Promise<Buffer> {
  const failures: string[] = [];
  for (const mirror of MIRRORS) {
    try {
      const response = await fetch(`${mirror}/${path}`, { signal: AbortSignal.timeout(30_000) });
      if (response.ok) return Buffer.from(await response.arrayBuffer());
      failures.push(`${mirror}: HTTP ${response.status}`);
    } catch (error) {
      failures.push(`${mirror}: ${(error as Error).message}`);
    }
  }
  throw new Error(`${path}: ${failures.join("; ")}`);
}

function bodyOf(text: string): string {
  const start = text.search(/^\*\*\* START OF .*\*\*\*$/m);
  const end = text.search(/^\*\*\* END OF .*\*\*\*$/m);
  const body = text.slice(start < 0 ? 0 : text.indexOf("\n", start) + 1, end < 0 ? undefined : end);
  return body.replace(/\r\n/g, "\n");
}

function chaptersOf(text: string): { title: string; body: string }[] {
  const headings = [...text.matchAll(HEADING)];
  const chapters = headings.map((match, i) => {
    const from = match.index + match[0].length;
    const to = headings[i + 1]?.index ?? text.length;
    let body = text.slice(from, to).replace(ILLUSTRATION, "").trim();
    const kind = match[1].toLowerCase() === "letter" ? "Letter" : "Chapter";
    let title = `${kind} ${match[2]}`;

    const [firstLine, ...rest] = body.split("\n");
    if (firstLine && firstLine.length < 80 && /^\w/.test(firstLine) && rest[0]?.trim() === "") {
      title = `${title}: ${firstLine.trim().replace(/\.$/, "").replace(/_/g, "")}`;
      body = rest.join("\n").trim();
    }
    return { title, body };
  });
  // A table of contents repeats each heading with no text under it.
  return chapters.filter((chapter) => chapter.body.length > 500);
}

async function seedBook({ id, title, author, theme }: (typeof BOOKS)[number]): Promise<void> {
  if (await Book.isExists({ title })) return;

  const text = bodyOf((await fetchBytes(`${id}/pg${id}.txt`)).toString("utf8"));
  const chapters = chaptersOf(text);
  if (chapters.length === 0) throw new Error(`${title}: no chapters found`);

  const book = (await Book.createBang({
    title,
    author,
    theme,
    published: true,
    everyone_access: true,
  })) as Book;

  try {
    await book.cover.attach({
      io: new StringIO(await fetchBytes(`${id}/pg${id}.cover.medium.jpg`)),
      filename: `${id}.jpg`,
      content_type: "image/jpeg",
    });
  } catch (error) {
    console.warn(`seeds: no cover for ${title}: ${(error as Error).message}`);
  }

  for (const chapter of chapters) {
    const page = new Page();
    await page.setBody(chapter.body);
    await book.press(page, { title: chapter.title });
  }
  console.log(`seeds: ${title}, ${chapters.length} chapters`);
}

for (const book of BOOKS) {
  try {
    await seedBook(book);
  } catch (error) {
    console.warn(`seeds: skipped ${book.title}: ${(error as Error).message}`);
  }
}
