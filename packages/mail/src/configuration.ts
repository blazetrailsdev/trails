export class Configuration {
  private static _instance: Configuration | null = null;

  private _encodeLanguage: string | null = null;

  static instance(): Configuration {
    return (Configuration._instance ||= new Configuration());
  }

  paramEncodeLanguage(value: string | null = null): string {
    return value != null ? (this._encodeLanguage = value) : (this._encodeLanguage ||= "en");
  }
}
