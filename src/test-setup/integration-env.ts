// Integration test setup.
//
// Integration tests must NEVER hit the production database. They run only when
// TEST_DATABASE_URL is set (a dedicated Neon dev branch). When it is set, point
// the db singleton at it *before* any module imports `@/lib/db`. When it is
// unset, the integration suites self-skip (see *.integration.test.ts).
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
