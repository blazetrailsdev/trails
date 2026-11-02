import { ActionController } from "@blazetrails/actionpack";
import { Files } from "@blazetrails/rack";

type Host = InstanceType<typeof ActionController.Base>;

export const FileServer = {
  /** @internal */
  serveFile(
    this: Host,
    path: string,
    { contentType, disposition }: { contentType: string | null; disposition: string | null },
  ): ReturnType<Files["serving"]> {
    const result = new Files(null).serving(this.request, path);
    const [status, headers, body] = result;
    this.status = status;
    this.responseBody = body;

    for (const [name, value] of Object.entries(headers)) {
      this.response.headers.set(name, value);
    }

    if (status === 416) {
      for (const name of ["X-Cascade", "x-cascade"]) this.response.headers.delete(name);
    }
    this.response.headers.set(
      "Content-Type",
      contentType ?? ActionController.DataStreaming.DEFAULT_SEND_FILE_TYPE,
    );
    this.response.headers.set(
      "Content-Disposition",
      disposition ?? ActionController.DataStreaming.DEFAULT_SEND_FILE_DISPOSITION,
    );
    return result;
  },
};
