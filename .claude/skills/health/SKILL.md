---
name: health
description: Check infrastructure health — DB, APIs, cron jobs, error rates
---

# Health Check

Check the following and report status:

1. **Database**: Can we connect to NeonDB?
2. **Shopify API**: Is the API token valid? Can we fetch a test order?
3. **Cron Jobs**: Are scheduled extractions running? Check last run timestamps.
4. **Sentry**: Any spike in errors in the last 24h?
5. **Vercel**: Is the deployment healthy?

## Output Format

```
URGENT: [critical issues requiring immediate attention]
WARN: [issues to investigate soon]
OK: [systems operating normally]
```
