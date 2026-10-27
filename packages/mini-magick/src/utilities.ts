import { stringSplit, fetch, File, Tempfile, env } from "@blazetrails/ruby-compat";
import { MiniMagick } from "./mini-magick.js";

export function which(cmd: string) {
  const exts = env.PATHEXT != null ? stringSplit(env.PATHEXT, ";") : [""];
  for (const path of stringSplit(fetch(env, "PATH"), File.PATH_SEPARATOR)) {
    for (const ext of exts) {
      const exe = File.join(path, `${cmd}${ext}`);
      if (File.isExecutable(exe)) {
        return exe;
      }
    }
  }
  return null;
}

export function tempfile(extension: string, block?: (tempfile: Tempfile) => unknown) {
  const tempfile = new Tempfile(["mini_magick", extension], MiniMagick.tmpdir, { binmode: true });
  if (block != null) {
    block(tempfile);
  }
  tempfile.close();
  return tempfile;
}

export const Utilities = {
  name: "MiniMagick::Utilities",
  which,
  tempfile,
};
