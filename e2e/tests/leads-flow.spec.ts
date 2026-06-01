import { expect, test } from "@playwright/test";

// First e2e spec in this repo. It exercises the work-plan v1 flow:
//   1. Visit /leads/new → create a lead manually
//   2. Visit /leads/[id] → change stage and persona, save
//   3. Convert the lead to an existing company (writes companyId,
//      sets status='converted')
//   4. Assert the lead appears on the /leads list with the new stage
//
// Auth: NextAuth sessions are cookie-backed. Until the team establishes a
// shared test-auth fixture, this spec self-skips when E2E_SESSION_COOKIE
// isn't provided. To run locally:
//   1. Sign in to http://localhost:30100 as an admin in your browser.
//   2. Copy the `authjs.session-token` cookie value (DevTools → Application).
//   3. Export E2E_SESSION_COOKIE=<that value>, then `npm run test:e2e`.
//
// CI: skipped until a fixture lands. Tracked in specs/work-plans/todo/
// crm-leads.md Phase 3 follow-ups.
const SESSION_COOKIE = process.env.E2E_SESSION_COOKIE;
const COMPANY_NAME =
  process.env.E2E_TEST_COMPANY_NAME ?? "E2E Conversion Target";

test.describe("leads flow", () => {
  test.skip(!SESSION_COOKIE, "needs E2E_SESSION_COOKIE — see file header");

  test.beforeEach(async ({ context, baseURL }) => {
    const url = new URL(baseURL ?? "http://localhost:30100");
    await context.addCookies([
      {
        name: "authjs.session-token",
        value: SESSION_COOKIE!,
        domain: url.hostname,
        path: "/",
        httpOnly: true,
        secure: url.protocol === "https:",
        sameSite: "Lax",
      },
    ]);
  });

  test("create a lead → change stage → convert to company", async ({
    page,
  }) => {
    const stamp = Date.now();
    const firstName = `E2E${stamp}`;
    const lastName = "Lead";

    // 1. Manual create
    await page.goto("/leads/new");
    await page.fill('input[id="firstName"]', firstName);
    await page.fill('input[id="lastName"]', lastName);
    await page.fill('input[id="email"]', `e2e-${stamp}@itest.local`);
    await page.fill('input[id="companyName"]', `Acme ${stamp}`);
    // Source default is already non-tradeshow; leave as-is.
    await page.click('button[type="submit"]:has-text("Save lead")');
    await page.waitForURL(/\/leads\/[a-f0-9-]+/);

    // 2. Change stage to "Sample" and persona to B1
    await page.selectOption('select:near(:text("Stage"))', "sample");
    await page.selectOption('select:near(:text("Persona"))', "B1");
    await page.click('button:has-text("Save overview")');
    await expect(page.getByText("Sample", { exact: true })).toBeVisible();

    // 3. Convert to company (requires a company with the seeded name to exist)
    await page.selectOption(
      'select:near(:text("Convert to company"))',
      { label: COMPANY_NAME },
    );
    await page.click('button:has-text("Convert"):not(:has-text("Convert to"))');
    await expect(page.getByText("converted", { exact: true })).toBeVisible();

    // 4. List view shows the new lead with the updated stage badge
    await page.goto("/leads?status=converted");
    await expect(
      page.getByRole("link", { name: `${firstName} ${lastName}` }),
    ).toBeVisible();
  });
});
