/**
 * ActionController::ParameterEncoding
 *
 * Specify binary encoding for parameters for a given action.
 * @see https://api.rubyonrails.org/classes/ActionController/ParameterEncoding.html
 */

export class ParameterEncodingRegistry {
  private _encodings = new Map<string, Map<string, string>>();

  skipParameterEncoding(action: string): void {
    const actionEncodings = new Map<string, string>();
    actionEncodings.set("*", "binary");
    this._encodings.set(action, actionEncodings);
  }

  paramEncoding(action: string, param: string, encoding: string): void {
    if (!this._encodings.has(action)) {
      this._encodings.set(action, new Map());
    }
    this._encodings.get(action)!.set(param, encoding);
  }

  actionEncodingTemplate(action: string): Map<string, string> | undefined {
    return this._encodings.get(action);
  }

  isSkipped(action: string): boolean {
    const encodings = this._encodings.get(action);
    return encodings?.has("*") ?? false;
  }

  setupParamEncode(): void {
    this._encodings = new Map<string, Map<string, string>>();
  }
}
