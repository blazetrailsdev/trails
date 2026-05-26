import { getFsAsync, getPath, getChildProcessAsync } from "@blazetrails/activesupport";

export class InvalidResponse extends Error {}

export interface PageDumpHelperHost {
  response: { isRedirection(): boolean; body: string };
  _testName?: string;
}

function projectRoot(): string {
  return (globalThis as any).process?.cwd?.() ?? ".";
}

export async function saveAndOpenPage(this: PageDumpHelperHost, path?: string): Promise<string> {
  const savedPath = await savePage.call(this, path);
  await openFile(savedPath);
  return savedPath;
}

/** @internal */
export async function savePage(this: PageDumpHelperHost, path?: string): Promise<string> {
  if (this.response.isRedirection()) {
    throw new InvalidResponse("Response is a redirection!");
  }
  const target = path ?? htmlDumpDefaultPath.call(this);
  const { dirname } = getPath();
  const fs = await getFsAsync();
  await fs.mkdir!(dirname(target), { recursive: true });
  await fs.writeFile!(target, this.response.body);
  return target;
}

/** @internal */
export async function openFile(path: string): Promise<void> {
  try {
    const cp = await getChildProcessAsync();

    const platform: string = (globalThis as any).process?.platform ?? "linux";
    if (platform === "darwin") {
      cp.spawnSync("open", [path]);
    } else if (platform === "win32") {
      cp.spawnSync("cmd", ["/c", "start", path]);
    } else {
      cp.spawnSync("xdg-open", [path]);
    }
  } catch {
    console.warn(`File saved to ${path}.\nPlease open it manually.`);
  }
}

/** @internal */
export function htmlDumpDefaultPath(this: PageDumpHelperHost): string {
  const name = this._testName ?? "test";
  const timestamp = Date.now();
  const { join } = getPath();
  return join(projectRoot(), "tmp/html_dump", `${name}_${timestamp}.html`);
}
