import { MimeType } from "../mime-type.js";

MimeType.extend("text/plain", { extensions: ["txt", "asc"] });
MimeType.extend("application/illustrator", { parents: "application/pdf" });
MimeType.extend("image/vnd.adobe.photoshop", { magic: [[0, "8BPS"]], extensions: ["psd", "psb"] });
MimeType.extend("application/vnd.ms-excel", { parents: "application/x-ole-storage" });
MimeType.extend("application/vnd.ms-powerpoint", { parents: "application/x-ole-storage" });
MimeType.extend("application/vnd.openxmlformats-officedocument.wordprocessingml.document", {
  parents: "application/zip",
});
MimeType.extend("application/vnd.openxmlformats-officedocument.wordprocessingml.template", {
  parents: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
});
MimeType.extend("application/vnd.ms-word.document.macroenabled.12", {
  parents: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
});
MimeType.extend("application/vnd.ms-word.template.macroenabled.12", {
  parents: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
});
MimeType.extend("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", {
  parents: "application/zip",
});
MimeType.extend("application/vnd.openxmlformats-officedocument.spreadsheetml.template", {
  parents: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
});
MimeType.extend("application/vnd.ms-excel.sheet.macroenabled.12", {
  parents: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
});
MimeType.extend("application/vnd.ms-excel.template.macroenabled.12", {
  parents: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
});
MimeType.extend("application/vnd.ms-excel.addin.macroenabled.12", {
  parents: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
});
MimeType.extend("application/vnd.ms-excel.sheet.binary.macroenabled.12", {
  parents: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
});
MimeType.extend("application/vnd.openxmlformats-officedocument.presentationml.presentation", {
  parents: "application/zip",
});
MimeType.extend("application/vnd.openxmlformats-officedocument.presentationml.template", {
  parents: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
});
MimeType.extend("application/vnd.openxmlformats-officedocument.presentationml.slideshow", {
  parents: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
});
MimeType.extend("application/vnd.ms-powerpoint.addin.macroenabled.12", {
  parents: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
});
MimeType.extend("application/vnd.ms-powerpoint.presentation.macroenabled.12", {
  parents: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
});
MimeType.extend("application/vnd.ms-powerpoint.template.macroenabled.12", {
  parents: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
});
MimeType.extend("application/vnd.ms-powerpoint.slideshow.macroenabled.12", {
  parents: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
});
MimeType.extend("application/vnd.apple.pages", {
  extensions: ["pages"],
  parents: "application/zip",
});
MimeType.extend("application/vnd.apple.numbers", {
  extensions: ["numbers"],
  parents: "application/zip",
});
MimeType.extend("application/vnd.apple.keynote", {
  extensions: ["key"],
  parents: "application/zip",
});
MimeType.extend("audio/aac", { extensions: ["aac"], parents: "audio/x-aac" });
MimeType.extend("audio/ogg", {
  extensions: ["ogg", "oga"],
  magic: [[0, "OggS", [[29, "vorbis"]]]],
});
MimeType.extend("image/vnd.dwg", { magic: [[0, "AC10"]] });
MimeType.extend("application/x-x509-ca-cert", {
  magic: [[0, "-----BEGIN CERTIFICATE-----"]],
  extensions: ["pem"],
  parents: "application/x-x509-cert;format=pem",
});
MimeType.extend("image/avif", { magic: [[4, "ftypavif"]], extensions: ["avif"] });
MimeType.extend("image/heif", { magic: [[4, "ftypmif1"]], extensions: ["heif"] });
MimeType.extend("image/heic", { magic: [[4, "ftypheic"]], extensions: ["heic"] });
MimeType.extend("video/mp4", {
  magic: [
    [4, "ftypisom"],
    [4, "ftypM4V "],
  ],
  extensions: ["mp4", "m4v"],
});
MimeType.extend("audio/flac", {
  magic: [[0, "fLaC"]],
  extensions: ["flac"],
  parents: "audio/x-flac",
});
MimeType.extend("audio/x-wav", {
  magic: [[0, "RIFF", [[8, "WAVE"]]]],
  extensions: ["wav"],
  parents: "audio/vnd.wav",
});
MimeType.extend("audio/mpc", { magic: [[0, "MPCKSH"]], extensions: ["mpc"] });
MimeType.extend("font/ttf", {
  magic: [[0, "\u0000\u0001\u0000\u0000"]],
  extensions: ["ttf", "ttc"],
});
MimeType.extend("font/otf", { magic: [[0, "OTTO"]], extensions: ["otf"], parents: "font/ttf" });
MimeType.extend("application/vnd.adobe.flash.movie", {
  magic: [
    [0, "FWS"],
    [0, "CWS"],
  ],
  extensions: ["swf"],
});
MimeType.extend("application/sql", { extensions: ["sql"] });
MimeType.extend("text/vcard", {
  magic: [[0, "BEGIN:VCARD"]],
  extensions: ["vcf"],
  parents: "text/plain",
});
MimeType.extend("application/vnd.ms-access", {
  extensions: ["mdb", "mde", "accdb", "accde"],
  magic: [
    [0, "\u0000\u0001\u0000\u0000Standard Jet DB"],
    [0, "\u0000\u0001\u0000\u0000Standard ACE DB"],
  ],
  parents: "application/x-msaccess",
});
MimeType.extend("text/markdown", {
  extensions: ["md", "mdtext", "markdown", "mkd"],
  parents: "text/x-web-markdown",
});
