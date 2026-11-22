import { Controller } from "@hotwired/stimulus";

// Enter sends, Shift+Enter adds a newline; the form resets after a successful submit.
export default class extends Controller {
  static targets = ["input", "files"];

  submitOnEnter(event) {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.isComposing &&
      event.target === this.inputTarget
    ) {
      event.preventDefault();
      this.element.requestSubmit();
    }
  }

  filesChanged(event) {
    const names = [...event.target.files].map((f) => f.name);
    this.filesTarget.textContent = names.join(", ");
  }

  reset(event) {
    if (event.detail.success) {
      this.element.reset();
      this.filesTarget.textContent = "";
      this.inputTarget.focus();
    }
  }
}
