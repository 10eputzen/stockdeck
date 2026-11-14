# Security policy

## Reporting a vulnerability

Please do **not** open a public issue for security problems.

Report them privately through GitHub: on the repository page go to **Security → Report a vulnerability** ([private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)). Only the maintainers can see the report.

Please include what is affected (frontend, a migration or policy, an Edge Function), how to reproduce it and what an attacker could do. You will get a first answer within a week.

## Scope

Stockdeck is self-hosted, so every instance is run by its owner. Reports about this code are in scope, for example:

- Row Level Security gaps that let one user read or change another user's data
- the MCP server accepting a token or API key it should reject
- the sign-up hook letting accounts in that are not on the allowlist
- secrets reaching the browser bundle

Out of scope: the configuration of a particular instance, third-party services (Supabase, Finnhub, Google) and denial of service against a free-tier deployment.

## Supported versions

Only the latest release and `main` receive fixes.
