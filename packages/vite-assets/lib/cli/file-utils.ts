import { ArgumentError, File, FileUtils as RbFileUtils, Pathname } from "@blazetrails/ruby-compat";

type Path = Pathname | string;
type Finder = (content: string[], path: Path, target: string) => number;

export const FileUtils = {
  /** @missingRailsArgs join — PERMANENT */
  async write(path: Path, ...content: (string | string[])[]): Promise<void> {
    await FileUtils.mkdirP(path);
    await File.writeAsync(path.toString(), content.flat().join(""));
  },

  async cp(source: Path, destination: Path): Promise<void> {
    await FileUtils.mkdirP(destination);
    if (!(await File.isExistAsync(destination.toString()))) {
      await RbFileUtils.cpAsync(source.toString(), destination.toString());
    }
  },

  append(path: Path, contents: string): Promise<void> {
    return FileUtils.appendUnlessPresent(path, contents, { pattern: contents });
  },

  async appendUnlessPresent(
    path: Path,
    contents: string,
    { pattern }: { pattern: string },
  ): Promise<void> {
    const content = await FileUtils.readLines(path);
    if (content.some((line) => line.includes(pattern))) return;

    if (!content.at(-1)?.endsWith("\n")) content.push("\n");
    content.push(`${contents}\n`);

    await FileUtils.write(path, content);
  },

  async replaceFirstLine(path: Path, target: string, replacement: string): Promise<void> {
    const content = await FileUtils.readLines(path);
    content[FileUtils.index(content, path, target)] = `${replacement}\n`;

    await FileUtils.write(path, content);
  },

  injectLineBefore(path: Path, target: string, contents: string): Promise<void> {
    return FileUtils._injectLineBefore(path, target, contents, FileUtils.index);
  },

  injectLineAfter(path: Path, target: string, contents: string): Promise<void> {
    return FileUtils._injectLineAfter(path, target, contents, FileUtils.index);
  },

  injectLineAfterLast(path: Path, target: string, contents: string): Promise<void> {
    return FileUtils._injectLineAfter(path, target, contents, FileUtils.rindex);
  },

  /** @internal */
  async mkdirP(path: Path): Promise<void> {
    await new Pathname(path).dirname().mkpath();
  },

  /** @internal */
  async readLines(path: Path): Promise<string[]> {
    return (await File.isExistAsync(path.toString()))
      ? await File.readlinesAsync(path.toString())
      : [];
  },

  /** @internal */
  index(content: string[], path: Path, target: string): number {
    const i = content.findIndex((line) => line.includes(target));
    if (i === -1) throw new ArgumentError(`Cannot find \`${target}' inside \`${path}'.`);
    return i;
  },

  /** @internal */
  rindex(content: string[], path: Path, target: string): number {
    let i = content.length - 1;
    while (i >= 0 && !content[i].includes(target)) i--;
    if (i === -1) throw new ArgumentError(`Cannot find \`${target}' inside \`${path}'.`);
    return i;
  },

  /** @internal */
  async _injectLineBefore(
    path: Path,
    target: string,
    contents: string,
    finder: Finder,
  ): Promise<void> {
    const content = await FileUtils.readLines(path);
    if (content.join("").includes(contents)) return;

    const i = finder(content, path, target);

    content.splice(i, 0, `${contents}\n`);
    await FileUtils.write(path, content);
  },

  /** @internal */
  async _injectLineAfter(
    path: Path,
    target: string,
    contents: string,
    finder: Finder,
  ): Promise<void> {
    const content = await FileUtils.readLines(path);
    if (content.join("").includes(contents)) return;

    const i = finder(content, path, target);

    content.splice(i + 1, 0, `${contents}\n`);
    await FileUtils.write(path, content);
  },
};
