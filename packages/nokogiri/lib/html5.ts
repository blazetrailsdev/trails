import { rbObjAsString, rbObjRespondTo } from "@blazetrails/ruby-compat";

/** @internal */
export function readAndEncode(string: unknown, encoding: string | null): string {
  if (rbObjRespondTo(string, "read")) {
    const io = string as { read(options?: { encoding: string }): string | null };
    return (encoding == null ? io.read() : io.read({ encoding })) ?? "";
  } else {
    return rbObjAsString(string);
  }
}
