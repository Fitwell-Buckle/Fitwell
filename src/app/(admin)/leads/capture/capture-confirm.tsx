"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Building2, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LeadForm, type LeadFormInitial } from "../lead-form";

interface CompanyMatch {
  id: string;
  name: string;
  matchedEmails: string[];
}

interface LeadMatch {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  companyId: string | null;
  stage: string;
  status: string;
}

interface MatchResult {
  matchedCompany: CompanyMatch | null;
  matchedLead: LeadMatch | null;
  matchedDomain: string | null;
}

function leadDisplay(l: LeadMatch): string {
  const name = [l.firstName, l.lastName].filter(Boolean).join(" ").trim();
  return name || l.email || "Existing lead";
}

// Wraps <LeadForm> with email-domain match + lead-dedup prompts. Runs the
// match lookup as soon as the confirm step opens (when there's an email).
// Shows up to two banners depending on what matched:
//   - Company match     → "lead will link to <Company>" + auto-fills companyId
//   - Existing lead     → "attach card to <Person>" (when there's a card)
//                         or "open existing lead" (no card)
export function CaptureConfirm({
  initial,
  confidence,
  onStartOver,
  onSavedNext,
}: {
  initial: LeadFormInitial;
  confidence?: Record<string, number | undefined>;
  onStartOver: () => void;
  // Called after a successful save — loops back to the camera for the next card.
  onSavedNext: () => void;
}) {
  const router = useRouter();
  const [match, setMatch] = useState<MatchResult | null>(null);
  const [matchLoading, setMatchLoading] = useState(false);
  const [dismissDedup, setDismissDedup] = useState(false);
  const [attachBusy, setAttachBusy] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);

  const email = initial.email ?? "";

  useEffect(() => {
    if (!email) {
      setMatch(null);
      return;
    }
    let alive = true;
    setMatchLoading(true);
    fetch(`/api/leads/match?email=${encodeURIComponent(email)}`)
      .then((r) => r.json())
      .then((body) => {
        if (alive) setMatch(body.data ?? null);
      })
      .catch(() => {
        if (alive) setMatch(null);
      })
      .finally(() => {
        if (alive) setMatchLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [email]);

  async function attachToExisting() {
    if (!match?.matchedLead || !initial.cardImageUrl) return;
    setAttachBusy(true);
    setAttachError(null);
    try {
      const res = await fetch(`/api/leads/${match.matchedLead.id}/cards`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ blobUrl: initial.cardImageUrl }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAttachError(body?.error ?? `Attach failed (${res.status})`);
        setAttachBusy(false);
        return;
      }
      router.push(`/leads/${match.matchedLead.id}`);
      router.refresh();
    } catch (err) {
      setAttachError(err instanceof Error ? err.message : "Attach failed");
      setAttachBusy(false);
    }
  }

  // Inject the matched company into the form's initial so it carries on save.
  const formInitial: LeadFormInitial = {
    ...initial,
    companyId: match?.matchedCompany?.id ?? initial.companyId ?? null,
  };

  const showLeadBanner =
    match?.matchedLead && match.matchedCompany && !dismissDedup;

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-500">
          {matchLoading
            ? "Checking for matches…"
            : "Review the extracted fields before saving."}
        </p>
        <Button variant="ghost" size="sm" onClick={onStartOver}>
          Start over
        </Button>
      </div>

      {match?.matchedCompany && (
        <Card className="mt-3 border-sky-200 bg-sky-50">
          <CardContent>
            <div className="flex items-start gap-3">
              <Building2 className="mt-0.5 h-5 w-5 text-sky-700" />
              <div className="flex-1 text-sm">
                <p className="font-medium text-sky-900">
                  Email domain matches{" "}
                  <Link
                    href={`/customers/companies`}
                    className="underline decoration-sky-400"
                  >
                    {match.matchedCompany.name}
                  </Link>
                </p>
                <p className="mt-0.5 text-xs text-sky-800">
                  The new lead will be linked to this company on save (matched
                  on {match.matchedCompany.matchedEmails[0]}).
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {showLeadBanner && match?.matchedLead && (
        <Card className="mt-3 border-amber-200 bg-amber-50">
          <CardContent>
            <div className="flex items-start gap-3">
              <UserCheck className="mt-0.5 h-5 w-5 text-amber-700" />
              <div className="flex-1">
                <p className="text-sm font-medium text-amber-900">
                  An active lead for{" "}
                  <strong>{leadDisplay(match.matchedLead)}</strong> already
                  exists in {match.matchedCompany?.name}.
                </p>
                <p className="mt-0.5 text-xs text-amber-800">
                  {initial.cardImageUrl
                    ? "Attach this card to their existing record instead of creating a duplicate?"
                    : "You probably already captured this person."}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {initial.cardImageUrl && (
                    <Button
                      size="sm"
                      onClick={attachToExisting}
                      disabled={attachBusy}
                    >
                      {attachBusy
                        ? "Attaching…"
                        : `Attach card to ${leadDisplay(match.matchedLead)}`}
                    </Button>
                  )}
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/leads/${match.matchedLead.id}`}>
                      Open existing lead
                    </Link>
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDismissDedup(true)}
                  >
                    Create new anyway
                  </Button>
                </div>
                {attachError && (
                  <p className="mt-2 text-xs text-red-600" role="alert">
                    {attachError}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="mt-3">
        <LeadForm
          initial={formInitial}
          confidence={confidence}
          rapid
          submitLabel="Save & capture another"
          onSuccess={() => {
            toast.success("Saved");
            onSavedNext();
          }}
        />
      </div>
    </div>
  );
}
