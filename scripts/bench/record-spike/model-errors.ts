import type { Base } from "./base.js";
import { fullMessage, generateMessage } from "./translation.js";
import type { ValidationError } from "./validations.js";

/**
 * A record's errors, as ActiveModel::Errors presents them. It holds the plain
 * entries `validate` returned and builds message text only when asked.
 */
export class Errors {
  private readonly base: Base;
  private entries: ValidationError[] = [];

  constructor(base: Base) {
    this.base = base;
  }

  add(attribute: string, type = ":invalid", options: Record<string, unknown> = {}): void {
    this.entries.push({ attribute, type, options });
  }

  replace(entries: ValidationError[]): void {
    this.entries = entries;
  }

  clear(): void {
    this.entries = [];
  }

  get count(): number {
    return this.entries.length;
  }

  get size(): number {
    return this.entries.length;
  }

  isEmpty(): boolean {
    return this.entries.length === 0;
  }

  get fullMessages(): string[] {
    const { name, i18n } = this.base._schema.klass;
    return this.entries.map((entry) => fullMessage(name, entry, i18n));
  }

  get messages(): Record<string, string[]> {
    const { name, i18n } = this.base._schema.klass;
    const messages: Record<string, string[]> = {};
    for (const entry of this.entries) {
      (messages[entry.attribute] ??= []).push(generateMessage(name, entry, i18n));
    }
    return messages;
  }

  messagesFor(attribute: string): string[] {
    return this.messages[attribute] ?? [];
  }

  get details(): Record<string, Array<Record<string, unknown>>> {
    const details: Record<string, Array<Record<string, unknown>>> = {};
    for (const { attribute, type, options } of this.entries) {
      (details[attribute] ??= []).push({ error: type, ...options });
    }
    return details;
  }
}
