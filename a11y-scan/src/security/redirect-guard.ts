/**
 * Validates a redirect chain BEFORE the browser is pointed at anything.
 *
 * Why this exists, stated plainly because an earlier version of the threat model
 * claimed a protection that did not work:
 *
 * Playwright's `context.route()` handler fires for the request the browser
 * initiates, but NOT for the hops of a redirect the network stack follows
 * internally. Fulfilling a 3xx from inside the handler does not re-enter it
 * either. So a target that answers 302 → http://169.254.169.254/ reaches the
 * cloud metadata endpoint with the route handler none the wiser. Verified
 * empirically, not assumed.
 *
 * The fix is to resolve the chain in Node first, checking every hop against the
 * same guard, and only then hand the browser a URL that is known to be
 * terminal and allowed.
 *
 * Residual risk: the server can answer the browser differently than it answered
 * us (the TOCTOU window already documented for DNS rebinding). This shrinks the
 * exposure to that window rather than eliminating it, and the route handler
 * still runs as a second line of defence.
 */
import { checkUrl, type GuardOptions } from './url-guard.js';
import { USER_AGENT } from '../config.js';

export interface RedirectResolution {
  allowed: boolean;
  /** The terminal URL, present when allowed. */
  finalUrl?: string;
  /** Why the chain was refused, present when not allowed. */
  reason?: string;
  /** Every URL in the chain, including the start, for the audit trail. */
  chain: string[];
  /** Set when the server declared a body larger than the cap. */
  oversized?: boolean;
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export interface RedirectGuardOptions extends GuardOptions {
  maxHops?: number;
  timeoutMs?: number;
  /** Declared response size above which the page is not worth loading. */
  maxResponseBytes?: number;
}

/**
 * Follows redirects manually, checking each hop.
 *
 * A network failure here is NOT treated as a block: the browser is better at
 * fetching pages than `fetch` is (TLS quirks, HTTP/2, servers that dislike
 * non-browser clients), and refusing a scan because a preflight HEAD-ish request
 * failed would produce false "not tested" results on perfectly good shops. In
 * that case the caller proceeds with the original URL, still protected by the
 * route handler and by the guard on the initial request.
 */
export async function resolveRedirects(
  startUrl: string,
  options: RedirectGuardOptions = {}
): Promise<RedirectResolution> {
  const maxHops = options.maxHops ?? 5;
  const timeoutMs = options.timeoutMs ?? 8000;
  const chain: string[] = [startUrl];

  let current = startUrl;

  for (let hop = 0; hop <= maxHops; hop++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    // HEAD first: it carries Location and usually content-length, and it does
    // not make the shop render a page it is about to render again for the
    // browser. The preflight otherwise doubles the load we place on a target.
    let response: Response;
    try {
      response = await fetch(current, {
        method: 'HEAD',
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'user-agent': USER_AGENT, accept: 'text/html,*/*' },
      });
      // Plenty of servers answer HEAD with 405 or 501, and some with a bare 404
      // for a URL that serves fine on GET. Retry those once.
      if (response.status === 405 || response.status === 501 || response.status === 403) {
        response.body?.cancel().catch(() => {});
        response = await fetch(current, {
          method: 'GET',
          redirect: 'manual',
          signal: controller.signal,
          headers: { 'user-agent': USER_AGENT, accept: 'text/html,*/*' },
        });
      }
    } catch {
      clearTimeout(timer);
      // Preflight could not reach it. Let the browser try; see the note above.
      return { allowed: true, finalUrl: current, chain };
    }
    clearTimeout(timer);

    // The body is never needed here, and reading it would download the page
    // twice. Cancelling releases the socket immediately.
    response.body?.cancel().catch(() => {});

    if (!REDIRECT_STATUSES.has(response.status)) {
      if (options.maxResponseBytes) {
        const declared = Number(response.headers.get('content-length'));
        if (Number.isFinite(declared) && declared > options.maxResponseBytes) {
          return {
            allowed: false,
            reason: `Response is ${Math.round(declared / 1024 / 1024)}MB, above the ${Math.round(
              options.maxResponseBytes / 1024 / 1024
            )}MB cap for a single page.`,
            chain,
            oversized: true,
          };
        }
      }
      return { allowed: true, finalUrl: current, chain };
    }

    const location = response.headers.get('location');
    if (!location) {
      // A redirect status with nowhere to go. Nothing more to validate.
      return { allowed: true, finalUrl: current, chain };
    }

    let next: string;
    try {
      next = new URL(location, current).toString();
    } catch {
      return { allowed: false, reason: `Redirect target is not a valid URL: ${location}`, chain };
    }

    const verdict = await checkUrl(next, options);
    if (!verdict.allowed) {
      return {
        allowed: false,
        reason: `Redirected to a target the safety guard refuses — ${verdict.detail}`,
        chain: [...chain, next],
      };
    }

    current = next;
    chain.push(next);
  }

  return {
    allowed: false,
    reason: `More than ${maxHops} redirects; refusing to follow further.`,
    chain,
  };
}
