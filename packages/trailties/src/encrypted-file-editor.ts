// Shared edit/show for `credentials`/`encrypted`. Ports Editor helper.
// Divergences: no .gitignore append, no validate! (needs EncryptedConfiguration),
// editor split is whitespace not Shellwords, no parent-dir mkdir (follow-up).
import {
  EncryptedFile,
  MissingContentError,
  MissingKeyError,
} from "@blazetrails/activesupport/encrypted-file";
import { getFsAsync } from "@blazetrails/activesupport/fs-adapter";
import { getChildProcessAsync } from "@blazetrails/activesupport/child-process-adapter";
import { env, stdout, setExitCode } from "@blazetrails/activesupport/process-adapter";

const pickEditor = (): string | null => env.VISUAL || env.EDITOR || null;

function displayEditorHint(invocation: string): void {
  stdout.write(
    `No $VISUAL or $EDITOR to open file in. Assign one like this:\n\n  VISUAL="code --wait" ${invocation}\n\nFor editors that fork and exit immediately, it's important to pass a wait flag;\notherwise, the file will be saved immediately with no chance to edit.\n`,
  );
}

// Direct fs check: `file.isKey()` memoizes a miss and would hide the
// freshly-written key from `file.change()` later in the same edit pass.
async function ensureKeyFile(file: EncryptedFile): Promise<void> {
  const fs = await getFsAsync();
  if (await fs.exists!(file.keyPath)) return;
  await fs.writeFile!(file.keyPath, `${EncryptedFile.generateKey()}\n`, { mode: 0o600 });
}

export async function editEncryptedFile(file: EncryptedFile, invocation: string): Promise<void> {
  await ensureKeyFile(file);
  const editor = pickEditor();
  if (editor === null) return displayEditorHint(invocation);
  const [cmd, ...args] = editor.split(/\s+/).filter((p) => p.length > 0);
  if (!cmd) return displayEditorHint(invocation);
  const cp = await getChildProcessAsync();
  try {
    await file.change(async (tmpPath) => {
      stdout.write(`Editing ${file.contentPath}...\n`);
      const r = cp.spawnSync(cmd, [...args, tmpPath]);
      if (r.error) throw r.error;
      if (r.status !== 0) throw new Error(`Editor exited with status ${r.status ?? "<signal>"}`);
    });
    stdout.write("File encrypted and saved.\n");
  } catch (e) {
    if (e instanceof MissingKeyError) stdout.write(`${e.message}\n`);
    else stdout.write(`Couldn't decrypt ${file.contentPath}. Perhaps you passed the wrong key?\n`);
    setExitCode(1);
  }
}

export async function showEncryptedFile(file: EncryptedFile, missing: string): Promise<void> {
  try {
    const contents = await file.read();
    stdout.write(`${contents.length > 0 ? contents : missing}\n`);
  } catch (e) {
    const known = e instanceof MissingKeyError || e instanceof MissingContentError;
    stdout.write(
      known
        ? `${missing}\n`
        : `Couldn't decrypt ${file.contentPath}. Perhaps you passed the wrong key?\n`,
    );
    setExitCode(1);
  }
}
