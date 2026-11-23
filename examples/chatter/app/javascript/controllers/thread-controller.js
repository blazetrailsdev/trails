import { Controller } from "@hotwired/stimulus";

export default class extends Controller {
  close(event) {
    event.preventDefault();
    const frame = document.getElementById("thread");
    frame.removeAttribute("src");
    frame.innerHTML = "";
  }
}
