import {
  File,
  FileUtils,
  LoadError,
  RUBY_PLATFORM,
  getChildProcessAsync,
  warn,
} from "@blazetrails/ruby-compat";
import { TopLevel } from "@blazetrails/activesupport";
import { current } from "@blazetrails/activesupport/core-ext/date-time/calculations";
import { toI } from "@blazetrails/activesupport/core-ext/date-time/conversions";

export class InvalidResponse extends Error {}

export interface PageDumpHelperHost {
  response: { isRedirection: boolean; body: string };
  methodName: string;
}

/** @noRailsEquivalent PERMANENT */
export const Launchy = {
  /** @noRailsEquivalent PERMANENT */
  async open(path: string): Promise<void> {
    const cp = await getChildProcessAsync().catch(() => {
      throw new LoadError("cannot load such file -- launchy");
    });

    const platform = RUBY_PLATFORM();
    const result =
      platform === "darwin"
        ? cp.spawnSync("open", [path])
        : platform === "mingw-ucrt"
          ? cp.spawnSync("cmd", ["/c", "start", path])
          : cp.spawnSync("xdg-open", [path]);
    if (result.error) throw result.error;
  },
};

export async function saveAndOpenPage(
  this: PageDumpHelperHost,
  path: string = htmlDumpDefaultPath.call(this),
): Promise<string> {
  const sPath = await savePage.call(this, path);
  await openFile.call(this, sPath);
  return sPath;
}

/** @internal */
export async function savePage(
  this: PageDumpHelperHost,
  path: string = htmlDumpDefaultPath.call(this),
): Promise<string> {
  if (this.response.isRedirection) throw new InvalidResponse("Response is a redirection!");
  FileUtils.mkdirP(File.dirname(path));
  File.write(path, this.response.body);
  return path;
}

/** @internal */
export async function openFile(this: PageDumpHelperHost, path: string): Promise<void> {
  try {
    await Launchy.open(path);
  } catch (error) {
    if (!(error instanceof LoadError)) throw error;
    warn(`File saved to ${path}.\nPlease install the launchy gem to open the file automatically.`);
  }
}

/** @internal */
export function htmlDumpDefaultPath(this: PageDumpHelperHost): string {
  return File.join(
    TopLevel.Trails!.root()!,
    "tmp/html_dump",
    `${this.methodName}_${toI(current())}.html`,
  );
}
