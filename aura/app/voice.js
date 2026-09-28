/* Aura — voice capture.
 *
 * Voice is an input method, not a separate feature: whatever is said lands
 * as text in the same capture pipeline (parse → review → confirm).
 *
 * Providers, in order:
 *  1. The browser's speech recognition, where it exists and is allowed.
 *  2. The phone keyboard's own microphone (Gboard, iOS) — always works in any
 *     text field, and Aura understands dictated text the same way.
 * Nothing pretends to listen when it cannot. A new provider (for example a
 * speech service) plugs in here by implementing start() below.
 */
(function (root) {
  const A = root.Aura || (root.Aura = {});

  function Ctor() { return root.SpeechRecognition || root.webkitSpeechRecognition || null; }

  /** Only where it can really work: the API exists and the page may use the microphone.
   *  Inside a claude.ai Artifact the frame refuses the microphone, so this is false there
   *  and the interface points to the keyboard's microphone instead. */
  function supported() {
    if (!Ctor()) return false;
    const doc = root.document;
    const policy = doc && (doc.permissionsPolicy || doc.featurePolicy);
    if (policy && typeof policy.allowsFeature === 'function' && !policy.allowsFeature('microphone')) return false;
    if (A.platform && A.platform.hasRuntime() && root.self !== root.top) return false;
    return true;
  }

  /**
   * Start listening. Returns a controller with stop(), or null if unsupported.
   * handlers: onPartial(text), onFinal(text), onError(code), onEnd()
   */
  function start(lang, handlers) {
    const C = Ctor();
    if (!C) return null;
    const h = handlers || {};
    let rec;
    try {
      rec = new C();
    } catch (e) {
      if (h.onError) h.onError('unavailable');
      return null;
    }
    rec.lang = lang === 'sv' ? 'sv-SE' : 'en-GB';
    rec.interimResults = true;
    rec.continuous = true;
    let finalText = '';
    rec.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const r = event.results[i];
        if (r.isFinal) finalText = `${finalText} ${r[0].transcript}`.trim();
        else interim += r[0].transcript;
      }
      if (h.onPartial) h.onPartial(`${finalText} ${interim}`.trim());
    };
    rec.onerror = (event) => {
      const code = event && event.error === 'not-allowed' ? 'denied'
        : event && event.error === 'no-speech' ? 'silence'
          : event && event.error === 'aborted' ? 'aborted' : 'unavailable';
      if (h.onError) h.onError(code);
    };
    rec.onend = () => {
      if (finalText && h.onFinal) h.onFinal(finalText);
      if (h.onEnd) h.onEnd();
    };
    try { rec.start(); } catch (e) { if (h.onError) h.onError('unavailable'); return null; }
    return { stop() { try { rec.stop(); } catch (e) { /* already stopped */ } } };
  }

  A.voice = { supported, start };
})(typeof globalThis !== 'undefined' ? globalThis : this);
