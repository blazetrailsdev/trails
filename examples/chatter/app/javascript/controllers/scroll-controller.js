import { Controller } from "@hotwired/stimulus";

// Keeps the message list pinned to the bottom while new messages stream in,
// unless the reader has scrolled up.
export default class extends Controller {
  connect() {
    this.scrollToBottom();
    this.observer = new MutationObserver(() => {
      if (this.pinned) this.scrollToBottom();
    });
    this.observer.observe(this.element, { childList: true, subtree: true });
    this.element.addEventListener("scroll", () => {
      this.pinned =
        this.element.scrollHeight - this.element.scrollTop - this.element.clientHeight < 80;
    });
    this.element.addEventListener("load", () => this.pinned && this.scrollToBottom(), true);
  }

  disconnect() {
    this.observer?.disconnect();
  }

  scrollToBottom() {
    this.element.scrollTop = this.element.scrollHeight;
    this.pinned = true;
  }
}
