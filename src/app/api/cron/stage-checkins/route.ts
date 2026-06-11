import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  adminNotification,
  productionPo,
  productionPoStageEstimate,
  productionStageCheckin,
  supplier,
  supplierContact,
} from "@/lib/schema";
import { verifyCronOrAdmin } from "@/lib/cron-auth";
import { sendEmail } from "@/lib/email/resend";
import { getStageLabels, getStageOrder } from "@/lib/production/stage-labels";
import { terminalStage } from "@/lib/production/stages";
import { supplierForStage } from "@/lib/production/stage-owners";
import { getStageEstimates } from "@/lib/production/cycle-time-data";
import { FALLBACK_STAGE_DAYS } from "@/lib/production/cycle-time";
import { formatPoNumber } from "@/lib/production/sub-po";
import { getProductionSettings } from "@/lib/production/production-settings";
import {
  elapsedPct,
  dueThresholds,
  shouldEscalate,
  type CheckinStatus,
} from "@/lib/production/stage-checkin";

const PORTAL_BASE =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://portal.fitwellbuckle.co";
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * Positive-control stage check-ins. Daily-ish, the cron walks every work-stage
 * instance (a master PO's stage that a supplier currently owns), computes how
 * far it is through its estimated duration, and at each configured threshold
 * (default 50/75/95%) prompts the owning supplier — platform notification +
 * email — to affirmatively confirm they're on track. A flagged delay, or an
 * overrun with no on-track confirmation, escalates to admins.
 */
export async function GET(req: NextRequest) {
  if (!(await verifyCronOrAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await getProductionSettings();
  if (!settings.stageCheckinEnabled) {
    return NextResponse.json({ ok: true, skipped: "disabled" });
  }
  const thresholds = settings.stageCheckinThresholds;
  const now = Date.now();
  const hasResend = !!process.env.RESEND_API_KEY;

  const [order, stageLabels, cycleTimes] = await Promise.all([
    getStageOrder(),
    getStageLabels(),
    getStageEstimates(),
  ]);
  const terminal = terminalStage(order);
  const opening = order[0];

  // Prefetch lookups so the per-PO loop stays query-free.
  const [pos, estimateRows, suppliers, contactRows, existingCheckins, subPos] =
    await Promise.all([
      db.query.productionPo.findMany({
        where: and(
          isNull(productionPo.parentPoId),
          ne(productionPo.status, "cancelled"),
        ),
        with: {
          stageAssignments: { columns: { stage: true, supplierId: true } },
          lineItems: {
            columns: { currentStage: true, shopifyReceivedAt: true },
            with: {
              stageEvents: {
                columns: { stage: true, enteredAt: true, exitedAt: true },
              },
            },
          },
        },
      }),
      db.select().from(productionPoStageEstimate),
      db
        .select({
          id: supplier.id,
          name: supplier.name,
          contactEmail: supplier.contactEmail,
        })
        .from(supplier),
      db
        .select({
          supplierId: supplierContact.supplierId,
          email: supplierContact.email,
        })
        .from(supplierContact),
      db.select().from(productionStageCheckin),
      db
        .select({
          parentPoId: productionPo.parentPoId,
          supplierId: productionPo.supplierId,
          poSuffix: productionPo.poSuffix,
        })
        .from(productionPo),
    ]);

  const estimateByPoStage = new Map(
    estimateRows.map((r) => [`${r.poId}:${r.stage}`, r.days] as const),
  );
  const supplierById = new Map(suppliers.map((s) => [s.id, s]));
  const contactsBySupplier = new Map<string, string[]>();
  for (const c of contactRows) {
    const arr = contactsBySupplier.get(c.supplierId) ?? [];
    arr.push(c.email);
    contactsBySupplier.set(c.supplierId, arr);
  }
  const suffixByMasterSupplier = new Map<string, string>();
  for (const s of subPos) {
    if (s.parentPoId && s.poSuffix) {
      suffixByMasterSupplier.set(`${s.parentPoId}:${s.supplierId}`, s.poSuffix);
    }
  }
  const checkinsByInstance = new Map<string, typeof existingCheckins>();
  for (const c of existingCheckins) {
    const key = `${c.poId}:${c.supplierId}:${c.stage}:${c.stageEnteredAt.toISOString()}`;
    const arr = checkinsByInstance.get(key) ?? [];
    arr.push(c);
    checkinsByInstance.set(key, arr);
  }

  let prompted = 0;
  let escalated = 0;

  for (const po of pos) {
    // Group this PO's unreceived lines by their current work stage.
    const byStage = new Map<string, { enteredAt: number }[]>();
    for (const li of po.lineItems) {
      if (li.shopifyReceivedAt) continue;
      const stage = li.currentStage;
      if (stage === terminal || stage === opening) continue; // not a work stage
      // The line's active event for its current stage (when it last entered).
      const active = li.stageEvents
        .filter((e) => e.stage === stage && e.exitedAt === null)
        .sort((a, b) => b.enteredAt.getTime() - a.enteredAt.getTime())[0];
      if (!active) continue;
      const arr = byStage.get(stage) ?? [];
      arr.push({ enteredAt: active.enteredAt.getTime() });
      byStage.set(stage, arr);
    }

    for (const [stage, lines] of byStage) {
      const ownerId =
        supplierForStage(order, po.stageAssignments, po.supplierId, stage) ??
        po.supplierId;
      const owner = supplierById.get(ownerId);
      if (!owner) continue;

      // Instance clock: earliest entry of the owner's lines at this stage.
      const enteredMs = Math.min(...lines.map((l) => l.enteredAt));
      const enteredAt = new Date(enteredMs);
      const estimateDays =
        estimateByPoStage.get(`${po.id}:${stage}`) ??
        cycleTimes[stage as keyof typeof cycleTimes] ??
        FALLBACK_STAGE_DAYS;
      const pct = elapsedPct(enteredMs, estimateDays, now);

      const instanceKey = `${po.id}:${ownerId}:${stage}:${enteredAt.toISOString()}`;
      const existing = checkinsByInstance.get(instanceKey) ?? [];
      const sentPcts = existing.map((r) => r.thresholdPct);
      const due = dueThresholds(pct, thresholds, sentPcts);

      // Escalation is judged on PRIOR-run state, so an instance is never
      // prompted and escalated in the same run — the supplier gets a cycle to
      // respond first.
      const priorStatuses = existing.map((r) => r.status as CheckinStatus);
      const priorCount = existing.length;
      const priorEscalated = existing.some((r) => r.escalatedAt !== null);

      const poDisplay = formatPoNumber(po.shopifyPoNumber, {
        suffix: suffixByMasterSupplier.get(`${po.id}:${ownerId}`) ?? undefined,
      });
      const stageLabel = stageLabels[stage] ?? stage;

      // ── Prompt the supplier for any newly-crossed thresholds ──
      if (due.length > 0) {
        for (const t of due) {
          await db
            .insert(productionStageCheckin)
            .values({
              poId: po.id,
              supplierId: ownerId,
              stage,
              stageEnteredAt: enteredAt,
              thresholdPct: t,
            })
            .onConflictDoNothing();
          existing.push({
            id: "",
            poId: po.id,
            supplierId: ownerId,
            stage,
            stageEnteredAt: enteredAt,
            thresholdPct: t,
            promptedAt: new Date(),
            respondedAt: null,
            status: "pending",
            note: null,
            escalatedAt: null,
            createdAt: new Date(),
          });
        }
        checkinsByInstance.set(instanceKey, existing);

        const remaining = Math.max(0, Math.round(100 - pct));
        const title = `Confirm you're on track: ${stageLabel} on PO ${poDisplay}`;
        const body = `Your ${stageLabel} work is ~${Math.round(pct)}% through its estimated time (about ${remaining}% to go). Open the PO to confirm you're on track or flag a delay.`;
        await db.insert(adminNotification).values({
          type: "stage_checkin_for_supplier",
          title,
          body,
          poId: po.id,
          supplierId: ownerId,
          href: `/supplier/po/${po.id}`,
        });
        prompted++;

        if (hasResend) {
          const recipients = Array.from(
            new Set(
              [owner.contactEmail, ...(contactsBySupplier.get(ownerId) ?? [])]
                .filter((e): e is string => !!e)
                .map((e) => e.toLowerCase()),
            ),
          );
          if (recipients.length > 0) {
            try {
              await sendEmail({
                to: recipients,
                subject: `On track? ${stageLabel} — PO ${poDisplay}`,
                html: `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#18181b">
                  <p style="font-size:15px;font-weight:600;margin:0">${title}</p>
                  <p style="font-size:13px;color:#52525b;margin:6px 0 12px">${body}</p>
                  <a href="${PORTAL_BASE}/supplier/po/${po.id}" style="display:inline-block;background:#18181b;color:#fff;font-size:13px;text-decoration:none;padding:8px 14px;border-radius:8px">Confirm on the portal →</a>
                </div>`,
              });
            } catch (err) {
              console.error(`Stage check-in email failed (${po.id}/${stage}):`, err);
            }
          }
        }
      }

      // ── Escalate to admins on a flagged delay or an unconfirmed overrun ──
      if (
        priorCount > 0 &&
        !priorEscalated &&
        shouldEscalate(priorStatuses, pct)
      ) {
        const flagged = priorStatuses.includes("at_risk");
        await db
          .update(productionStageCheckin)
          .set({ escalatedAt: new Date() })
          .where(
            and(
              eq(productionStageCheckin.poId, po.id),
              eq(productionStageCheckin.supplierId, ownerId),
              eq(productionStageCheckin.stage, stage),
              eq(productionStageCheckin.stageEnteredAt, enteredAt),
              isNull(productionStageCheckin.escalatedAt),
            ),
          );
        const title = `${owner.name} ${flagged ? "flagged a delay" : "hasn't confirmed on track"}: ${stageLabel} on PO ${poDisplay}`;
        const body = flagged
          ? `${owner.name} reported ${stageLabel} on PO ${poDisplay} is running behind.`
          : `${stageLabel} on PO ${poDisplay} is ~${Math.round(pct)}% through its estimate and ${owner.name} hasn't confirmed they're on track.`;
        await db.insert(adminNotification).values({
          type: "stage_checkin_overdue",
          title,
          body,
          poId: po.id,
          supplierId: ownerId,
          href: `/modules/production/po/${po.id}`,
        });
        if (hasResend && ADMIN_EMAILS.length > 0) {
          try {
            await sendEmail({
              to: ADMIN_EMAILS,
              subject: `Production at-risk: ${stageLabel} — PO ${poDisplay}`,
              html: `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#18181b">
                <p style="font-size:15px;font-weight:600;margin:0">${title}</p>
                <p style="font-size:13px;color:#52525b;margin:6px 0 12px">${body}</p>
                <a href="${PORTAL_BASE}/modules/production/po/${po.id}" style="display:inline-block;background:#18181b;color:#fff;font-size:13px;text-decoration:none;padding:8px 14px;border-radius:8px">Open PO →</a>
              </div>`,
            });
          } catch (err) {
            console.error(`Stage escalation email failed (${po.id}/${stage}):`, err);
          }
        }
        escalated++;
      }
    }
  }

  return NextResponse.json({
    ok: true,
    enabled: true,
    thresholds,
    prompted,
    escalated,
    resend: hasResend,
  });
}
