import { rbObjAsString, rbObjRespondTo } from "@blazetrails/ruby-compat";
import { HTML5 } from "./namespaces.js";

HTML5.readAndEncode = function readAndEncode(string: unknown, encoding: string | null): string {
  if (rbObjRespondTo(string, "read")) {
    const io = string as { read(options?: { encoding: string }): string };
    return encoding == null ? io.read() : io.read({ encoding });
  } else {
    return rbObjAsString(string);
  }
};
