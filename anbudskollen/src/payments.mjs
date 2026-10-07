// Stripe Checkout through the REST API. Payment is confirmed by retrieving the
// Checkout Session server-side when the buyer returns (and whenever the report
// is opened again), so no webhook endpoint has to be configured.

export function createPayments({ stripe, pricing, company, fetchImpl = globalThis.fetch }) {
  const enabled = Boolean(stripe.secretKey);

  async function call(method, path, form) {
    const response = await fetchImpl(`${stripe.apiBase}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${stripe.secretKey}`,
        ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      },
      body: form ? new URLSearchParams(form).toString() : undefined,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(body?.error?.message ?? `Stripe svarade ${response.status}`);
      error.status = 502;
      throw error;
    }
    return body;
  }

  return {
    enabled,

    async createCheckout({ token, title, baseUrl }) {
      if (!enabled) throw Object.assign(new Error("Kortbetalning är inte aktiverad."), { status: 400 });
      const name = `${company.brand} – fullständig rapport`;
      const description = (title || "Analys av offentlig upphandling").slice(0, 250);
      const session = await call("POST", "/v1/checkout/sessions", {
        mode: "payment",
        "line_items[0][quantity]": "1",
        "line_items[0][price_data][currency]": "sek",
        "line_items[0][price_data][unit_amount]": String(pricing.amountSek * 100),
        "line_items[0][price_data][product_data][name]": name,
        "line_items[0][price_data][product_data][description]": description,
        success_url: `${baseUrl}/rapport.html?t=${encodeURIComponent(token)}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/rapport.html?t=${encodeURIComponent(token)}&avbruten=1`,
        client_reference_id: token,
        "metadata[access_token]": token,
        "payment_intent_data[metadata][access_token]": token,
        billing_address_collection: "required",
        "tax_id_collection[enabled]": "true",
        "invoice_creation[enabled]": "true",
        allow_promotion_codes: "true",
        locale: "sv",
      });
      return { id: session.id, url: session.url };
    },

    /** Returns payment details when the session is paid for this token, else null. */
    async verifySession(sessionId, token) {
      if (!enabled || !/^cs_[A-Za-z0-9_]+$/.test(sessionId ?? "")) return null;
      const session = await call("GET", `/v1/checkout/sessions/${encodeURIComponent(sessionId)}`);
      const sessionToken = session.metadata?.access_token ?? session.client_reference_id;
      if (sessionToken !== token) return null;
      if (session.payment_status !== "paid") return null;
      return {
        sessionId: session.id,
        amountTotal: session.amount_total,
        currency: session.currency,
        email: session.customer_details?.email ?? null,
        name: session.customer_details?.name ?? null,
      };
    },
  };
}
