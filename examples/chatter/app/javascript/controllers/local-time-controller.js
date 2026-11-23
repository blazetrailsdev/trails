import { Controller } from "@hotwired/stimulus";

// Server renders UTC; show the reader's local time.
export default class extends Controller {
  connect() {
    const date = new Date(this.element.getAttribute("datetime"));
    this.element.textContent = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    this.element.title = date.toLocaleString();
  }
}
