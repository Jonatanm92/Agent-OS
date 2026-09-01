/*
 * ars-intake.js — progressive enhancement for the intake form.
 *
 * The form works without this file. `required`, `type="email"` and
 * `type="url"` are native constraint validation, so the browser blocks an
 * incomplete submit — including both acknowledgement checkboxes — on its own.
 *
 * This script only:
 *   1. replaces the browser's transient error bubbles with persistent inline
 *      messages a screen reader announces;
 *   2. scrolls to and focuses the first failing control, because suppressing
 *      the bubble also suppresses the browser's own scroll-and-focus;
 *   3. marks an unticked acknowledgement block visually as well as by message.
 *
 * No dependencies, no build step.
 */
(function () {
  'use strict';

  var form = document.getElementById('ars-intake-form');
  if (!form) return;

  // Absent when the script did not run. Makes a "the errors look different"
  // support report diagnosable in one glance.
  form.setAttribute('data-ars-enhanced', 'true');

  var summary = form.querySelector('[data-ars-form-error]');
  var pendingFocus = null;

  function errorNodeFor(field) {
    return field.id ? form.querySelector('[data-ars-error-for="' + field.id + '"]') : null;
  }

  function showError(field) {
    field.setAttribute('aria-invalid', 'true');
    var node = errorNodeFor(field);
    if (node) node.classList.add('is-shown');
    var ack = field.closest('[data-ars-ack]');
    if (ack) ack.setAttribute('data-invalid', 'true');
  }

  function clearError(field) {
    field.removeAttribute('aria-invalid');
    var node = errorNodeFor(field);
    if (node) node.classList.remove('is-shown');
    var ack = field.closest('[data-ars-ack]');
    if (ack) ack.removeAttribute('data-invalid');
  }

  // Reads validity WITHOUT firing `invalid` events — checkValidity() would fire
  // them and re-enter the handler below on every keystroke.
  function anyInvalid() {
    return Array.prototype.some.call(
      form.querySelectorAll('input, select, textarea'),
      function (el) { return el.willValidate && !el.validity.valid; }
    );
  }

  // When a form fails validation the browser blocks submission and fires
  // `invalid` on each failing control — `submit` never fires at all. So
  // everything shown on a failed attempt hangs off `invalid`, not off submit.
  // `invalid` does not bubble, hence the capture phase.
  form.addEventListener(
    'invalid',
    function (event) {
      event.preventDefault();
      showError(event.target);
      if (summary) summary.classList.add('is-shown');

      // `invalid` fires once per failing control in document order, as one
      // synchronous burst. Keep the first and act after the burst settles.
      if (!pendingFocus) {
        pendingFocus = event.target;
        setTimeout(function () {
          var el = pendingFocus;
          pendingFocus = null;
          if (!el) return;
          el.focus({ preventScroll: true });
          el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }, 0);
      }
    },
    true
  );

  ['input', 'change'].forEach(function (type) {
    form.addEventListener(type, function (event) {
      var field = event.target;
      if (!field.willValidate) return;
      if (field.validity.valid) clearError(field);
      if (summary && !anyInvalid()) summary.classList.remove('is-shown');
    });
  });
})();
