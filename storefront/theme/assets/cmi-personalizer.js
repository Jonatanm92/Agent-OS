/*
 * cmi-personalizer.js — progressive enhancement for the personalization form.
 *
 * The form is fully functional without this file:
 *   - required / type="url" / type="date" are native constraint validation,
 *     so the browser blocks an incomplete submit on its own;
 *   - the "share link" field is visible and submittable by default;
 *   - the form is a normal POST to /cart/add.
 *
 * This script only:
 *   1. replaces the browser's default error bubbles with persistent inline
 *      messages that screen readers announce and that survive scrolling;
 *   2. shows/hides the photo-link field and makes it conditionally required;
 *   3. warns about a file over Shopify's hard 20MB line-item-property cap
 *      before the customer waits through a doomed upload;
 *   4. records a small engagement summary into a hidden property, so order
 *      data shows how long the form took and how many fields were filled.
 *
 * No dependencies, no build step.
 */
(function () {
  'use strict';

  var form = document.getElementById('cmi-personalization-form');
  if (!form) return;

  // Marks that this script ran. Absent means the form is operating in its
  // no-JavaScript mode (still fully functional) — useful when diagnosing a
  // report that "the errors look different".
  form.setAttribute('data-cmi-enhanced', 'true');

  // Shopify's own hard limit for a file uploaded as a line item property.
  var MAX_FILE_BYTES = 20 * 1024 * 1024;

  var summary = form.querySelector('[data-cmi-form-error]');
  var engagementInput = form.querySelector('[data-cmi-engagement]');
  var startedAt = null;
  var touched = Object.create(null);

  /* ---------------- inline error messages ---------------- */

  function errorNodeFor(field) {
    if (!field.id) return null;
    return form.querySelector('[data-cmi-error-for="' + field.id + '"]');
  }

  function showError(field, message) {
    var node = errorNodeFor(field);
    field.setAttribute('aria-invalid', 'true');
    if (!node) return;
    if (message) node.textContent = message;
    node.classList.add('is-shown');
  }

  function clearError(field) {
    var node = errorNodeFor(field);
    field.removeAttribute('aria-invalid');
    if (node) node.classList.remove('is-shown');
  }

  // `invalid` does not bubble, so it has to be captured.
  form.addEventListener(
    'invalid',
    function (event) {
      // Suppress the native bubble; the inline message replaces it.
      event.preventDefault();
      showError(event.target);
    },
    true
  );

  // Clear a field's error as soon as it becomes valid again.
  ['input', 'change'].forEach(function (type) {
    form.addEventListener(type, function (event) {
      var field = event.target;
      if (!field.willValidate) return;
      if (field.checkValidity()) clearError(field);
      markTouched(field);
    });
  });

  form.addEventListener('submit', function (event) {
    if (form.checkValidity()) {
      writeEngagement();
      // Let the browser perform the normal multipart POST to /cart/add.
      // A file upload cannot be sent through the Ajax cart API, so this
      // submit is intentionally never intercepted.
      return;
    }

    event.preventDefault();
    if (summary) {
      summary.classList.add('is-shown');
      summary.focus();
    }
    var firstBad = form.querySelector('input:invalid, select:invalid, textarea:invalid');
    if (firstBad) {
      showError(firstBad);
      firstBad.scrollIntoView({ block: 'center', behavior: 'smooth' });
      // Focus after the scroll settles so the viewport does not jump twice.
      setTimeout(function () { firstBad.focus({ preventScroll: true }); }, 250);
    }
  });

  /* ---------------- conditional photo-link field ---------------- */

  var photoModes = form.querySelectorAll('[data-cmi-photo-mode]');
  var linkReveal = form.querySelector('[data-cmi-reveal="link"]');
  var linkInput = linkReveal ? linkReveal.querySelector('input') : null;

  function syncPhotoMode() {
    if (!linkReveal || !linkInput) return;
    var wantsLink = form.querySelector('[data-cmi-photo-mode="link"]:checked') !== null;
    linkReveal.hidden = !wantsLink;
    linkInput.required = wantsLink;
    if (!wantsLink) {
      linkInput.value = '';
      clearError(linkInput);
    }
  }

  if (photoModes.length) {
    Array.prototype.forEach.call(photoModes, function (radio) {
      radio.addEventListener('change', syncPhotoMode);
    });
    syncPhotoMode();
  }

  /* ---------------- oversized file guard ---------------- */

  var ticket = document.getElementById('cmi-ticket');
  if (ticket) {
    ticket.addEventListener('change', function () {
      var file = ticket.files && ticket.files[0];
      if (file && file.size > MAX_FILE_BYTES) {
        // setCustomValidity keeps the native validity API as the source of
        // truth, so submit is blocked with or without our submit handler.
        ticket.setCustomValidity('File is larger than 20MB.');
        showError(ticket);
      } else {
        ticket.setCustomValidity('');
        clearError(ticket);
      }
    });
  }

  /* ---------------- engagement measurement ---------------- */

  function markTouched(field) {
    if (!field.name || field.name.indexOf('properties[') !== 0) return;
    if (field.name.indexOf('properties[_') === 0) return;
    if (startedAt === null) {
      startedAt = Date.now();
      // Emitted so that a free custom pixel (Settings > Customer events) can
      // record personalization-form starts without any paid analytics tool.
      // Nothing listens by default; this is a no-op until a pixel is added.
      try {
        if (window.Shopify && window.Shopify.analytics && window.Shopify.analytics.publish) {
          var section = form.closest('[data-cmi-tier]');
          window.Shopify.analytics.publish('cmi_personalization_start', {
            tier: section ? section.getAttribute('data-cmi-tier') : 'unknown'
          });
        }
      } catch (e) {
        /* analytics must never break the purchase path */
      }
    }
    touched[field.name] = true;
  }

  function writeEngagement() {
    if (!engagementInput) return;
    var seconds = startedAt ? Math.round((Date.now() - startedAt) / 1000) : 0;
    engagementInput.value = 'fields=' + Object.keys(touched).length + '; seconds=' + seconds;
  }
})();
