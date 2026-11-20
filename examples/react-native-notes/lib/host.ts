import path from "path-browserify";
import {
  fsAdapterConfig,
  registerFsAdapter,
  registerProcessAdapter,
  type FsAdapter,
  type PathAdapter,
  type ProcessAdapter,
} from "@blazetrails/ruby-compat";

function enoent(syscall: string) {
  return (path?: unknown): never => {
    const error = new Error(`ENOENT: no such file or directory, ${syscall} '${path}'`);
    throw Object.assign(error, { code: "ENOENT", errno: -2, syscall, path });
  };
}

const console_ = (log: (s: string) => void) => ({
  isTTY: false,
  write(chunk: string) {
    log(chunk.replace(/\n$/, ""));
    return true;
  },
});

const env: Record<string, string | undefined> = {};

const reactNativeProcess: ProcessAdapter = {
  envSnapshot: () => ({ ...env }),
  argvSnapshot: () => [],
  cwd: () => "/",
  chdir: enoent("chdir"),
  platform: () => "react-native",
  pid: () => 1,
  setEnv(key, value) {
    env[key] = value;
  },
  exit() {
    throw new Error("React Native apps cannot exit");
  },
  setExitCode() {},
  onSignal: () => () => {},
  stdout: console_((s) => console.log(s)),
  stderr: console_((s) => console.warn(s)),
  stdin: { isTTY: false, read: async () => null },
};

registerProcessAdapter(reactNativeProcess);

const FS_OPERATIONS =
  "readFileSync writeFileSync mkdirSync appendFileSync unlinkSync readdirSync rmSync rmdirSync renameSync fstatSync lstatSync chmodSync utimesSync chownSync readlinkSync symlinkSync realpathSync accessSync openSync openAsync closeSync copyFileSync mkdtempSync accessAsync lstat readFile writeFile unlink rm rename mkdtemp realpath rmdir readdir mkdir symlink link chmod chown lchown utimes readlink openHandle";

const CWD = new Set(["/", "."]);
const cwdStat = {
  isDirectory: () => true,
  isFile: () => false,
  isExecutable: () => true,
  size: 0,
  atime: new Date(0),
  mtime: new Date(0),
  mode: 0o40555,
  uid: 0,
  gid: 0,
};

function statSync(path: string) {
  if (CWD.has(path)) return cwdStat;
  return enoent("stat")(path);
}

const noFilesystem = {
  ...Object.fromEntries(FS_OPERATIONS.split(" ").map((name) => [name, enoent(name)])),
  statSync,
  stat: async (path: string) => statSync(path),
  existsSync: (path: string) => CWD.has(path),
  exists: async (path: string) => CWD.has(path),
  cwd: () => "/",
} as unknown as FsAdapter;

registerFsAdapter("react-native", noFilesystem, path as PathAdapter);
fsAdapterConfig.adapter = "react-native";
