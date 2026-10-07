import { $, api, clear, el, fillCompany, formatBytes } from "./common.js";

const config = await fillCompany();
const files = [];
const input = $("#file-input");
const dropzone = $("#dropzone");
const list = $("#file-list");
const status = $("#form-status");

$("#max-files").textContent = config.limits.maxFiles;
$("#max-mb").textContent = config.limits.maxFileMb;

if (config.engine === "demo") {
  $("#engine-note").append(
    el("div", { class: "alert alert-warn" }, "Demoläge: tjänsten kör utan AI-nyckel och använder en enkel nyckelordsanalys. Resultatet blir mindre komplett än den riktiga AI-analysen."),
  );
}

function render() {
  clear(list);
  files.forEach((file, index) => {
    list.append(
      el(
        "li",
        {},
        el("span", { "aria-hidden": "true" }, "📄"),
        el("span", { class: "name", title: file.name }, file.name),
        el("span", { class: "muted small" }, formatBytes(file.size)),
        el("button", { type: "button", class: "btn btn-ghost btn-sm", "aria-label": `Ta bort ${file.name}`, onclick: () => { files.splice(index, 1); render(); } }, "Ta bort"),
      ),
    );
  });
}

function addFiles(fileList) {
  const allowed = config.extensions;
  for (const file of fileList) {
    const ext = (/\.[a-z0-9]+$/i.exec(file.name)?.[0] ?? "").toLowerCase();
    if (!allowed.includes(ext)) {
      showError(`"${file.name}" har ett filformat som inte stöds.`);
      continue;
    }
    if (file.size > config.limits.maxFileMb * 1024 * 1024) {
      showError(`"${file.name}" är större än ${config.limits.maxFileMb} MB.`);
      continue;
    }
    if (files.length >= config.limits.maxFiles) {
      showError(`Max ${config.limits.maxFiles} filer.`);
      break;
    }
    if (!files.some((f) => f.name === file.name && f.size === file.size)) files.push(file);
  }
  render();
}

function showError(message) {
  status.className = "alert alert-error";
  status.textContent = message;
}

dropzone.addEventListener("click", () => input.click());
dropzone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    input.click();
  }
});
input.addEventListener("change", () => {
  addFiles(input.files);
  input.value = "";
});
for (const type of ["dragenter", "dragover"]) {
  dropzone.addEventListener(type, (e) => {
    e.preventDefault();
    dropzone.classList.add("drag");
  });
}
for (const type of ["dragleave", "drop"]) {
  dropzone.addEventListener(type, (e) => {
    e.preventDefault();
    dropzone.classList.remove("drag");
  });
}
dropzone.addEventListener("drop", (e) => addFiles(e.dataTransfer.files));

$("#analysis-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  status.className = "";
  status.textContent = "";
  if (!files.length) return showError("Lägg till minst ett dokument.");
  if (!$("#accept").checked) return showError("Godkänn villkoren för att fortsätta.");

  const form = new FormData(event.target);
  form.delete("files");
  for (const file of files) form.append("files", file, file.name);

  const button = $("#submit");
  button.disabled = true;
  button.textContent = "Laddar upp och läser dokumenten …";
  try {
    const result = await api("/api/analyses", { method: "POST", form });
    window.location.href = result.url;
  } catch (error) {
    showError(error.message);
    button.disabled = false;
    button.textContent = "Starta gratis analys";
  }
});
