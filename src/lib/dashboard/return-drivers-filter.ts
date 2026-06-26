import { sql, type SQL } from "drizzle-orm";
import { order } from "@/lib/schema";
import { STORE_TZ } from "@/lib/timezone";
import {
  type RdDim,
  FAMILY,
  COLOR,
  SOURCE,
  TOD,
  LAT,
  BASKET,
  NO_SIZE,
} from "./return-drivers-labels";

/**
 * Builds a WHERE condition (correlated to the base `order` table) that scopes
 * the whole dashboard to a clicked Return Drivers segment. Returns undefined for
 * an unrecognized dim/value so an unknown param is a safe no-op (shows
 * everything) rather than an empty dashboard.
 *
 * Mirrors the metric definitions in return-drivers.ts; both sides share the
 * labels in return-drivers-labels.ts so a row's value always matches here.
 */

// utm fields for the clicked order's customer (null for guests).
const utmSource = sql`(SELECT c.utm_source FROM customer c WHERE c.id = ${order.customerId})`;
const utmMedium = sql`(SELECT c.utm_medium FROM customer c WHERE c.id = ${order.customerId})`;
const ref = sql`${order.referringSite}`;

// "Came from" channel for an order — same priority as the metric's CASE.
const cameFrom = sql`CASE
  WHEN ${utmSource} ILIKE '%instagram%' OR ${utmSource} = 'ig' OR ${ref} ILIKE '%instagram%' THEN ${SOURCE.instagram}
  WHEN ${utmSource} ILIKE '%klaviyo%' OR ${utmMedium} ILIKE '%email%' OR ${utmSource} ILIKE '%email%' THEN ${SOURCE.email}
  WHEN ${utmSource} = 'fb' OR ${utmSource} ILIKE '%meta%' OR ${utmSource} ILIKE '%facebook%' OR ${ref} ILIKE '%facebook%' THEN ${SOURCE.facebook}
  WHEN ${utmSource} ILIKE '%google%' OR ${ref} ILIKE '%google%' THEN ${SOURCE.google}
  WHEN ${ref} ILIKE '%youtube%' THEN ${SOURCE.youtube}
  WHEN (${utmSource} IS NULL OR ${utmSource} = '') AND NULLIF(${ref}, '') IS NULL THEN ${SOURCE.direct}
  ELSE ${SOURCE.other} END`;

const hr = sql`EXTRACT(HOUR FROM (${order.processedAt} AT TIME ZONE ${STORE_TZ}))`;
// First-refund latency in days for the clicked order (null if never refunded).
const latDays = sql`(SELECT EXTRACT(DAY FROM (MIN(rl.refunded_at) - ${order.processedAt}))
  FROM order_refund_line rl WHERE rl.order_id = ${order.id} AND rl.refunded_at IS NOT NULL)`;
// # distinct products on the order.
const lineCount = sql`(SELECT COUNT(*) FROM order_line_item oli WHERE oli.order_id = ${order.id})`;

// EXISTS a line item whose normalized attribute equals the clicked value.
function lineItemExists(expr: SQL, value: string): SQL {
  return sql`EXISTS (SELECT 1 FROM order_line_item oli WHERE oli.order_id = ${order.id} AND ${expr} = ${value})`;
}

const familyCase = sql`CASE
  WHEN oli.title ILIKE '%M4%' THEN ${FAMILY.m4}
  WHEN oli.title ILIKE '%tang%' THEN ${FAMILY.tang}
  WHEN oli.title ILIKE '%M1%' OR oli.title ILIKE '%model one%' THEN ${FAMILY.m1}
  ELSE ${FAMILY.other} END`;
const colorCase = sql`CASE
  WHEN oli.variant_title ILIKE '%rose gold%' THEN ${COLOR.rose}
  WHEN oli.variant_title ILIKE '%yellow gold%' OR oli.variant_title ILIKE '%/ gold%' THEN ${COLOR.yellow}
  WHEN oli.variant_title ILIKE '%black%' THEN ${COLOR.black}
  ELSE ${COLOR.silver} END`;
const sizeExpr = sql`COALESCE(substring(oli.variant_title from '[0-9]+ ?mm'), ${NO_SIZE})`;

export function returnDriverFilter(dim: RdDim, value: string): SQL | undefined {
  switch (dim) {
    case "country":
      return sql`${order.shippingCountryCode} = ${value}`;
    case "dow":
      return sql`TO_CHAR(${order.processedAt} AT TIME ZONE ${STORE_TZ}, 'ID-Dy') = ${value}`;
    case "source":
      return sql`${cameFrom} = ${value}`;
    case "family":
      return lineItemExists(familyCase, value);
    case "color":
      return lineItemExists(colorCase, value);
    case "size":
      return lineItemExists(sizeExpr, value);
    case "basket":
      if (value === BASKET.one) return sql`${lineCount} = 1`;
      if (value === BASKET.two) return sql`${lineCount} = 2`;
      if (value === BASKET.three) return sql`${lineCount} = 3`;
      if (value === BASKET.four) return sql`${lineCount} >= 4`;
      return undefined;
    case "tod":
      if (value === TOD.morning) return sql`${hr} BETWEEN 5 AND 11`;
      if (value === TOD.afternoon) return sql`${hr} BETWEEN 12 AND 16`;
      if (value === TOD.evening) return sql`${hr} BETWEEN 17 AND 21`;
      if (value === TOD.late) return sql`(${hr} >= 22 OR ${hr} <= 4)`;
      return undefined;
    case "latency":
      if (value === LAT.d7) return sql`${latDays} <= 7`;
      if (value === LAT.d14) return sql`${latDays} BETWEEN 8 AND 14`;
      if (value === LAT.d30) return sql`${latDays} BETWEEN 15 AND 30`;
      if (value === LAT.d60) return sql`${latDays} BETWEEN 31 AND 60`;
      if (value === LAT.d61) return sql`${latDays} > 60`;
      return undefined;
    default:
      return undefined;
  }
}
