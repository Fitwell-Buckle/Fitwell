import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = {
  title: "Getting Started | Fitwell Docs",
};

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="prose prose-sm prose-zinc max-w-none [&_code]:rounded [&_code]:bg-zinc-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-xs [&_code]:font-mono [&_h3]:mt-4 [&_h3]:text-sm [&_h3]:font-semibold [&_li]:my-0.5 [&_ol]:pl-4 [&_p]:text-sm [&_p]:leading-relaxed [&_p]:text-zinc-600 [&_ul]:pl-4">
          {children}
        </div>
      </CardContent>
    </Card>
  );
}

export default async function OnboardingPage() {
  const session = await auth();
  if (!session) redirect("/auth/login");

  return (
    <div>
      <PageHeader title="Getting Started" />

      <div className="mt-6 space-y-5">
        <Section title="What You Need">
          <ul className="list-disc">
            <li>
              A Mac with <strong>Terminal</strong> access
            </li>
            <li>
              <strong>Node.js 22+</strong> — download from{" "}
              <code>nodejs.org</code> if you don&apos;t have it. Check with{" "}
              <code>node --version</code> in Terminal.
            </li>
            <li>
              <strong>Git</strong> — already on most Macs. Check with{" "}
              <code>git --version</code>.
            </li>
            <li>
              <strong>GitHub access</strong> — you need to be added to the{" "}
              <code>Fitwell-Buckle</code> GitHub organization
            </li>
            <li>
              <strong>Google account</strong> — your{" "}
              <code>@fitwellbuckle.co</code> email for logging into the admin
              dashboard
            </li>
          </ul>
        </Section>

        <Section title="Editor Setup">
          <p>
            You can use either of these to browse and edit the code. Both
            understand the codebase and can make changes for you.
          </p>
          <ul className="list-disc">
            <li>
              <strong>Claude Code (CLI)</strong> — run{" "}
              <code>claude</code> in Terminal from the project folder.
              Works entirely in the command line.
            </li>
            <li>
              <strong>Claude Desktop (Code mode)</strong> — the Claude
              desktop app has a Code mode that connects to your local
              project. More visual.
            </li>
          </ul>
          <p>
            Both tools can read, edit, and run commands in the project.
            You don&apos;t need VS Code or any other traditional editor
            unless you want one.
          </p>
        </Section>

        <Section title="Clone the Repo">
          <p>Open Terminal and run:</p>
          <ol className="list-decimal">
            <li>
              <code>cd ~/repos</code> — go to your repos folder (create it
              with <code>mkdir ~/repos</code> if it doesn&apos;t exist)
            </li>
            <li>
              <code>
                git clone git@github.com:Fitwell-Buckle/Fitwell.git
              </code>
            </li>
            <li>
              <code>cd Fitwell</code>
            </li>
            <li>
              <code>npm install</code> — downloads all the project
              dependencies (takes ~30 seconds)
            </li>
          </ol>
        </Section>

        <Section title="Create Your Database Branch">
          <p>
            Each developer gets their own isolated copy of the database so
            your local changes don&apos;t affect production or anyone else.
          </p>
          <ol className="list-decimal">
            <li>
              Run this in Terminal (replace <code>yourname</code> with your
              first name):
              <br />
              <code>
                npx neonctl branches create --project-id
                quiet-cell-94455140 --org-id org-fancy-night-97982234
                --name yourname-dev --parent production
              </code>
            </li>
            <li>
              It will print a <strong>connection string</strong> starting
              with <code>postgresql://</code>. Copy it.
            </li>
          </ol>
        </Section>

        <Section title="Configure Environment">
          <ol className="list-decimal">
            <li>
              Copy the example config:{" "}
              <code>cp .env.example .env.local</code>
            </li>
            <li>
              Open <code>.env.local</code> in any text editor
            </li>
            <li>
              Set <code>DATABASE_URL</code> to the connection string from
              the previous step
            </li>
            <li>
              Pull the remaining values from Vercel:{" "}
              <code>npm run vc env pull .env.local --environment=development</code>
              . Then re-set <code>DATABASE_URL</code> to your dev branch
              from the previous step (the pull overwrites it with prod).
            </li>
          </ol>
        </Section>

        <Section title="Run It">
          <ol className="list-decimal">
            <li>
              <code>npm run dev</code> — starts the dev server
            </li>
            <li>
              Open <code>http://localhost:30100</code> in your browser
            </li>
            <li>Sign in with your <code>@fitwellbuckle.co</code> Google account</li>
          </ol>
          <p>
            That&apos;s it. You should see the admin dashboard with real
            data.
          </p>
        </Section>

        <Section title="Syncing Data">
          <p>
            Data flows into the dashboard automatically — Shopify sends
            webhooks on every order, and cron jobs pull from GA4 and Meta
            Ads on a schedule. You don&apos;t need to do anything for
            day-to-day use.
          </p>
          <p>
            If you want to manually pull fresh data (for example, after
            first setup or to test something), go to the{" "}
            <strong>Data Sync</strong> tab in the sidebar. Each data
            source has a <strong>Run</strong> button that triggers an
            immediate sync. You&apos;ll see a confirmation with the
            number of records pulled.
          </p>
          <p>
            The Data Sync page also shows the schedule for each
            automatic job, its current status (active, blocked, or
            deferred), and when data was last received.
          </p>
        </Section>

        <Section title="How the Codebase is Organized">
          <ul className="list-disc">
            <li>
              <code>src/app/(admin)/</code> — the dashboard pages you see
              in this app
            </li>
            <li>
              <code>src/app/api/</code> — backend API routes (webhooks,
              cron jobs)
            </li>
            <li>
              <code>src/lib/shopify/</code> — Shopify API client and sync
              logic
            </li>
            <li>
              <code>src/lib/analytics/</code> — GA4, Google Ads, Meta Ads
              extraction
            </li>
            <li>
              <code>src/components/</code> — reusable UI components and
              charts
            </li>
            <li>
              <code>specs/</code> — documentation, work plans, and
              priorities
            </li>
            <li>
              <code>scripts/</code> — CLI tools and one-time scripts
            </li>
          </ul>
        </Section>

        <Section title="Deploying Changes">
          <p>
            The app deploys automatically. When you push code to the{" "}
            <code>main</code> branch on GitHub, Vercel detects the
            change and builds a new version. This usually takes about
            40 seconds.
          </p>
          <p>
            You can check the deploy status at{" "}
            <code>vercel.com/fitwellbuckle/fitwell</code> or by
            running <code>npm run vc ls</code> in Terminal. The
            production site at <code>admin.fitwellbuckle.co</code>{" "}
            updates automatically once the build succeeds.
          </p>
          <p>
            Pull requests also get their own preview deployment — Vercel
            creates a temporary URL so you can test changes before
            merging to main.
          </p>
        </Section>

        <Section title="Database Changes">
          <p>
            If you or Claude make changes to the database structure
            (adding columns, new tables), those changes need to be
            applied as a <strong>migration</strong>. Claude handles
            this automatically in most cases, but here&apos;s what
            happens:
          </p>
          <ol className="list-decimal">
            <li>
              The schema is defined in{" "}
              <code>src/lib/schema.ts</code> — this is the source of
              truth for what the database looks like
            </li>
            <li>
              <code>npm run db:generate</code> creates a migration
              file describing the change (e.g., &quot;add column X to
              table Y&quot;)
            </li>
            <li>
              <code>npm run db:migrate</code> applies that change to
              your local database
            </li>
            <li>
              Before deploying, the same migration needs to be applied
              to production: <code>npm run db:migrate:prod</code>{" "}
              (uses your Vercel access to pull the prod env, then runs
              the migration against it). Do this <em>before</em> pushing
              — Vercel auto-deploys the moment your push lands.
            </li>
          </ol>
          <p>
            Each developer has their own database branch, so running
            migrations locally won&apos;t affect anyone else. The
            migration files in <code>drizzle/migrations/</code> get
            committed to git so they&apos;re shared across the team.
          </p>
        </Section>

        <Section title="Getting Help">
          <p>
            Open Claude Code in the project folder and ask it anything
            about the codebase. It reads <code>CLAUDE.md</code> and{" "}
            <code>AGENTS.md</code> automatically and knows how everything
            fits together.
          </p>
          <p>
            For team discussion, use the <strong>#ai-ops</strong> channel
            in Slack.
          </p>
        </Section>
      </div>
    </div>
  );
}
