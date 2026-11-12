# Production roadmap

LendLoop runs as a local development stack today. These are the changes planned before it serves real neighborhoods.

## n8n

- Run it on ECS Fargate in queue mode, with RDS Postgres and Redis, instead of a single container with SQLite.
- Keep the editor on a private network behind SSO. Expose only the two webhook paths through a load balancer with TLS and rate limits.
- Keep `N8N_ENCRYPTION_KEY` in AWS Secrets Manager and use n8n external secrets for the HMAC credentials.
- Promote workflow changes through source control instead of editing production by hand.

## Secrets

- Add a key id to the signature header and accept two active keys per direction, so a secret can be rotated without downtime.
- Rotate on a schedule and on any staff change.

## Convex and Clerk

- Use a Convex production deployment and a Clerk production instance. Require MFA for admins.
- Replace the `make-admin` script with an audited admin invitation flow.
- Leave `LENDLOOP_ALLOW_DEMO` and `NOTIFICATION_BACKOFF_SCALE` unset. Demo functions refuse to run without the first one.

## Notifications

- Replace the mock with a real provider and pass the row's key as the provider's idempotency key. That closes the small window where a lost response causes a duplicate.
- Keep email addresses out of the automation layer. At send time, a server-side step looks up the address in Clerk by opaque user id, so n8n's execution history never stores it.
- Add notification preferences and unsubscribe.

## Reliability and observability

- Send errors to Sentry and metrics to Datadog.
- Alert on `failed` rows, on rows stuck in `pending`, and on a daily reminder run that did not happen. Today a missed run is only visible as an absence.
- Make redelivery bulk-capable for recovering from a long outage.
- Rate limit anonymous reads, request creation and the signed endpoints.

## Product and compliance

- Store a time zone per user and compute "overdue" against it, rather than against UTC.
- Define retention for loans, notifications, audit entries and n8n execution data, and add account deletion.
- Stream the audit log to append-only storage, so that an admin cannot alter it.
- In a regulated setting: sign data processing agreements (or BAAs for health data) with every vendor, keep regulated data out of the automation layer entirely, and have workflows carry only opaque ids.

## Delivery

- CI runs lint, typecheck, tests, a secret scan and a check that exported workflows contain no pinned data.
- Add a Content-Security-Policy tuned for Clerk and Convex.
