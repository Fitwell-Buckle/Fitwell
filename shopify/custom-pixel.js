/**
 * Fitwell · PostHog Shopify Custom Pixel (checkout)
 *
 * Install: Shopify admin → Settings → Customer events → Add custom pixel,
 * name "posthog", paste, Save, Connect.
 *
 * Paired with shopify/theme-posthog-snippet.html on the storefront.
 *
 * Phase 0 spike (2026-06-03) confirmed default cookie sharing works:
 * Shopify hosts this pixel iframe at www.fitwellbuckle.co/web-pixels@.../sandbox/...
 * — same origin as the storefront — so posthog-js cookies on .fitwellbuckle.co
 * are shared. posthog.identify(email) merges the pre-purchase anonymous
 * person onto the email-keyed person via posthog-js's standard
 * $anon_distinct_id mechanism. No identity bridge needed.
 * See specs/research/posthog-shopify-stitching.md.
 *
 * Defensive throughout: sandbox accessors (analytics, init, browser) can be
 * undefined on some surfaces; a pixel must never throw.
 */
(function () {
  var PROJECT_TOKEN = 'phc_xhdBzfsf47Vy5MU9spMMtaJWtBuAJFkGxg2DcRiGN7Aq';
  var API_HOST = 'https://us.i.posthog.com';

  // Sandbox-safe posthog-js stub loader.
  !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once unregister identify setPersonProperties alias reset get_distinct_id".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);

  posthog.init(PROJECT_TOKEN, {
    api_host: API_HOST,
    person_profiles: 'identified_only',
    autocapture: false,
    capture_pageview: false,
    disable_session_recording: true
  });

  analytics.subscribe('checkout_completed', function (event) {
    try {
      var c = event.data && event.data.checkout ? event.data.checkout : {};
      var email = c.email || (c.billingAddress && c.billingAddress.email) || null;
      var total = c.totalPrice && c.totalPrice.amount;
      var currency = c.currencyCode || (c.totalPrice && c.totalPrice.currencyCode);

      if (email) posthog.identify(email);

      posthog.capture('purchase_completed', {
        order_id: c.order && c.order.id,
        checkout_token: c.token,
        order_value: total != null ? Number(total) : null,
        currency: currency
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

  analytics.subscribe('product_added_to_cart', function (event) {
    try {
      var cl = event.data && event.data.cartLine ? event.data.cartLine : {};
      var pv = cl.merchandise ? cl.merchandise : {};
      var price = pv.price && pv.price.amount;
      posthog.capture('product_added_to_cart', {
        product_id: pv.product && pv.product.id,
        product_title: pv.product && pv.product.title,
        variant_id: pv.id,
        variant_title: pv.title,
        sku: pv.sku,
        quantity: cl.quantity,
        price: price != null ? Number(price) : null,
        currency: pv.price && pv.price.currencyCode
      });
    } catch (e) {}
  });

  // Storefront $pageview from the theme snippet covers generic product page
  // visits by URL. The Shopify-standard product_viewed event additionally
  // carries structured product data (variant, sku, price) which the URL
  // alone doesn't expose — useful for SKU-level funnel breakdowns.
  analytics.subscribe('product_viewed', function (event) {
    try {
      var pv = event.data && event.data.productVariant ? event.data.productVariant : {};
      var price = pv.price && pv.price.amount;
      posthog.capture('product_viewed', {
        product_id: pv.product && pv.product.id,
        product_title: pv.product && pv.product.title,
        product_type: pv.product && pv.product.type,
        variant_id: pv.id,
        variant_title: pv.title,
        sku: pv.sku,
        price: price != null ? Number(price) : null,
        currency: pv.price && pv.price.currencyCode
      });
    } catch (e) {}
  });
})();
