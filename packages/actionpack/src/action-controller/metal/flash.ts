/**
 * ActionController::Flash
 *
 * Flash message integration for controllers. Provides add_flash_types
 * and integrates flash with redirect_to.
 * @see https://api.rubyonrails.org/classes/ActionController/Flash.html
 */

export class FlashTypeRegistry {
  private _types: Set<string> = new Set(["alert", "notice"]);

  addFlashTypes(...types: string[]): void {
    for (const type of types) {
      this._types.add(type);
    }
  }

  get types(): ReadonlySet<string> {
    return new Set(this._types);
  }

  has(type: string): boolean {
    return this._types.has(type);
  }

  extractFlashFromOptions(
    flash: Record<string, unknown>,
    options: Record<string, unknown>,
  ): Record<string, unknown> {
    const remaining = { ...options };
    for (const type of this._types) {
      if (type in remaining) {
        flash[type] = remaining[type];
        delete remaining[type];
      }
    }
    if (remaining.flash && typeof remaining.flash === "object" && !Array.isArray(remaining.flash)) {
      Object.assign(flash, remaining.flash as Record<string, unknown>);
      delete remaining.flash;
    }
    return remaining;
  }
}
