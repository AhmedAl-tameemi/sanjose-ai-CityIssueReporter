# City Issue Reporter

An accessible resident-facing web app for reporting community issues and receiving a clear confirmation number and next-step guidance.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/city-issue-reporter/src/pages/ReportPage.tsx` — resident reporting flow with browser-saved draft state.
- `artifacts/city-issue-reporter/src/pages/ConfirmationPage.tsx` — submitted report summary and next-step confirmation.
- `artifacts/city-issue-reporter/src/types/report.ts` — report fields and supported issue/frequency options.
- `artifacts/city-issue-reporter/src/index.css` — app theme and responsive UI styles.

## Architecture decisions

- The first prototype is frontend-only and stores the draft/latest report in browser storage so the resident journey can be evaluated without a staff system.
- Reports use a short human-readable confirmation number that residents can save and use for later follow-up.
- The form is split into three steps with required-field validation and keyboard-friendly focus movement.

## Product

- Residents can report unsafe driving, speeding, potholes, illegal dumping, streetlight problems, or another community issue.
- Residents can provide a location, date, approximate time, description, frequency, and optional contact details.
- After submission, the app confirms receipt, summarizes the report, explains review/routing, and gives the resident a next step without promising a resolution or date.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
