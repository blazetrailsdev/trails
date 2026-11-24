import { ActionDispatch, type Parameters } from "@blazetrails/actionpack";

export const UploadedFiles = {
  isUploadedFile(value: unknown): boolean {
    return value instanceof ActionDispatch.Http.UploadedFile;
  },

  uploadedFilesOnly(params: Parameters, ...names: string[]): Parameters {
    return params.reject(
      (name, value) => names.includes(name) && !UploadedFiles.isUploadedFile(value),
    );
  },
};
