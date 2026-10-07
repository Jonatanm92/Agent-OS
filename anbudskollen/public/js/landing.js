import { $, api, fillCompany } from "./common.js";

fillCompany();

const form = $("#contact-form");
form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const status = $("#contact-status");
  const data = Object.fromEntries(new FormData(form).entries());
  const button = form.querySelector("button");
  button.disabled = true;
  try {
    await api("/api/contact", { method: "POST", body: data });
    form.reset();
    status.className = "alert alert-ok";
    status.textContent = "Tack! Vi hör av oss inom en arbetsdag.";
  } catch (error) {
    status.className = "alert alert-error";
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
