/**
 * Fitwell · PostHog Shopify Custom Pixel (CHECKOUT ONLY)
 *
 * Install: Shopify admin → Settings → Customer events → Add custom pixel,
 * name "posthog", paste this, Save, Connect.
 *
 * Why this exists separately from the theme snippet: Shopify's checkout
 * rejects the normal snippet and runs pixels in a sandbox. We bootstrap
 * posthog-js with the SAME distinct_id the theme mirrored into the
 * `fw_distinct_id` cookie, so the purchase stitches onto the pre-purchase
 * anonymous person instead of a fresh id (the gap the official guide leaves
 * open — see specs/work-plans/todo/posthog-integration.md, Phase 0/1/3).
 *
 * Defensive throughout: the sandbox `browser`/`init`/`analytics` accessors
 * can be unavailable; a pixel must never throw.
 */
(function () {
  var PROJECT_TOKEN = 'phc_xhdBzfsf47Vy5MU9spMMtaJWtBuAJFkGxg2DcRiGN7Aq';
  var API_HOST = 'https://us.i.posthog.com';

  function readBridgedId(cb) {
    try {
      // Sandboxed cookie jar — scoped to .fitwellbuckle.co by the theme.
      browser.cookie.get('fw_distinct_id').then(function (raw) {
        var v = '';
        if (raw) {
          var m = String(raw).match('(^|;)\\s*fw_distinct_id\\s*=\\s*([^;]+)');
          v = m ? decodeURIComponent(m.pop()) : String(raw);
        }
        cb(v || null);
      }).catch(function () { cb(null); });
    } catch (e) { cb(null); }
  }

  readBridgedId(function (bridgedId) {
    // Minimal posthog-js loader (sandbox-safe; no DOM dependency).
    !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once unregister identify setPersonProperties alias reset get_distinct_id".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);

    posthog.init(PROJECT_TOKEN, {
      api_host: API_HOST,
      person_profiles: 'identified_only',
      autocapture: false,
      capture_pageview: false,
      disable_session_recording: true,
      // The identity bridge: reuse the storefront's distinct_id.
      bootstrap: bridgedId ? { distinctID: bridgedId } : {}
    });

    analytics.subscribe('checkout_completed', function (event) {
      try {
        var c = event.data && event.data.checkout ? event.data.checkout : {};
        var email = (c.email) || (c.billingAddress && c.billingAddress.email) || null;
        var total = c.totalPrice && c.totalPrice.amount;
        var currency = c.currencyCode || (c.totalPrice && c.totalPrice.currencyCode);

        if (email) posthog.identify(email);

        posthog.capture('purchase_completed', {
          order_id: c.order && c.order.id,
          checkout_token: c.token,
          order_value: total != null ? Number(total) : null,
          currency: currency,
          line_items: (c.lineItems || []).map(function (li) {
            return {
              title: li.title,
              quantity: li.quantity,
              sku: li.variant && li.variant.sku
            };
          })
        });
        posthog.setPersonProperties(
          { last_order_at: new Date().toISOString() },
          { first_order_at: new Date().toISOString() }
        );
      } catch (e) { /* never throw inside the sandbox */ }
    });

    analytics.subscribe('checkout_started', function (event) {
      try {
        var c = event.data && event.data.checkout ? event.data.checkout : {};
        posthog.capture('checkout_started', {
          value: c.totalPrice && Number(c.totalPrice.amount),
          currency: c.currencyCode
        });
      } catch (e) {}
    });
  });
})();
