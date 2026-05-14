const APP_NAME_RE = /^[a-zA-Z0-9-]+$/;

let _app: string | undefined;

export function setApp(name: string): void {
  if (!APP_NAME_RE.test(name)) {
    throw new Error(`GlobalID app name must match /^[a-zA-Z0-9-]+$/, got: ${JSON.stringify(name)}`);
  }
  _app = name;
}

export function getApp(): string | undefined {
  return _app;
}
