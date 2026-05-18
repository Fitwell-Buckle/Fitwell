import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = {
  title: "Docs | Fitwell Admin",
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

export default async function DocsPage() {
  const session = await auth();
  if (!session) redirect("/auth/login");

  return (
    <div>
      <PageHeader title="Developer Onboarding" />

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
              Ask Greg for the remaining values (Shopify credentials,
              Google OAuth, etc.) — or copy them from the Vercel dashboard
              if you have access
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

        <Section title="Useful Commands">
          <ul className="list-disc">
            <li>
              <code>npm run dev</code> — start the dev server (port 30100)
            </li>
            <li>
              <code>npm run check</code> — typecheck + run tests
            </li>
            <li>
              <code>npm run shopify sync</code> — pull latest Shopify data
            </li>
            <li>
              <code>npm run shopify orders</code> — list recent orders
            </li>
            <li>
              <code>npm run shopify customers</code> — list customers
            </li>
            <li>
              <code>npm run shopify sync-status</code> — check sync health
            </li>
            <li>
              <code>npm run vc</code> — Vercel CLI (uses the Fitwell
              account)
            </li>
          </ul>
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
