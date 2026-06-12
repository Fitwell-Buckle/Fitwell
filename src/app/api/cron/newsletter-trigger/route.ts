import { NextRequest, NextResponse } from "next/server";
import { verifyCronOrAdmin } from "@/lib/cron-auth";

// The newsletter engine lives in GitHub Actions (heavy deps, BrightData
// proxy, multi-minute run). GitHub's own `schedule:` cron is unreliable —
// it batches scheduled workflows and can run them hours late (observed
// 3h+). A workflow_dispatch, by contrast, starts within seconds. So we let
// a reliable clock (Vercel Cron, minute-accurate on Pro) fire this route,
// which dispatches the workflow on time. The GitHub `schedule:` cron stays
// as an automatic fallback and no-ops if this path already sent the brief.
const REPO = process.env.NEWSLETTER_DISPATCH_REPO ?? "Fitwell-Buckle/Fitwell";
const WORKFLOW = "newsletter-daily.yml";

export async function GET(req: NextRequest) {
  if (!(await verifyCronOrAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = process.env.GH_DISPATCH_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "GH_DISPATCH_TOKEN not configured" },
      { status: 500 },
    );
  }

  let res: Response;
  try {
    res = await fetch(
      `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "fitwell-newsletter-cron",
        },
        // scheduled=true → the workflow uses the production "-auto" slug
        // (human dispatches omit it and get a unique per-run slug instead).
        body: JSON.stringify({
          ref: "main",
          inputs: { mode: "send", scheduled: "true" },
        }),
      },
    );
  } catch (e) {
    return NextResponse.json(
      { error: `GitHub dispatch request failed: ${e instanceof Error ? e.message : e}` },
      { status: 502 },
    );
  }

  // GitHub returns 204 No Content on a successful dispatch.
  if (res.status !== 204) {
    const detail = await res.text().catch(() => "");
    return NextResponse.json(
      { error: `GitHub dispatch failed (${res.status})`, detail },
      { status: 502 },
    );
  }

  return NextResponse.json({
    data: {
      dispatched: true,
      repo: REPO,
      workflow: WORKFLOW,
      at: new Date().toISOString(),
    },
  });
}
