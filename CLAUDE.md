# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start Vite dev server (port 3000)
npm run build     # TypeScript check + production build
npm run lint      # ESLint

# Flask backend (ODS historical import)
python app.py     # Starts on localhost:5000
```

No test suite exists. Build (`npm run build`) is the primary way to catch type errors.

## Environment Variables

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_ODS_API_URL=     # optional, defaults to http://localhost:5000/ods/upload
```

## Architecture

### Stack
React 19 + TypeScript + Vite SPA. Backend is fully Supabase (Postgres, Auth, Realtime, Edge Functions). Uses `HashRouter` — all routes are `/#/path`.

### Two separate backends
1. **Supabase** — auth, database, realtime subscriptions, edge function `send-report-email`
2. **Flask** (`app.py`) — ODS/spreadsheet file parsing for historical data import. Entirely optional; the frontend degrades gracefully if it's offline.

### Role system
Two roles: `analista` and `supervisor`. Roles are stored in `user_profiles.role`. The first user to sign up is automatically promoted to `supervisor`. All route guards and feature toggles derive from `useUser().isSupervisor`.

Provider tree: `ThemeProvider → ToastProvider → UserProvider → AppShell`. `UserProvider` requires an authenticated `userId` so it lives inside the session check in `App`.

### Inspection data model (critical)
All inspection payload data (defects, process metrics, operator lists, approval rule) is stored as a **JSON blob in `inspections.observations`**. There are no dedicated columns for defect counts. The schema is versioned: `{ schema_version: 2, ... }`.

`qualityService.parsePayload()` (in `services/qualityService.ts`) deserializes this. When reading a record, always check `observations.startsWith('{')` before treating it as JSON — older records may contain plain text.

Key payload fields: `process_type`, `process_area` (`'producao_inicial'` | `'produto_acabado'`), `all_operator_ids[]`, `all_analyst_ids[]`, `defects: Record<string, number>`, `production_metrics`, `approval_rule`.

### Two production sectors
| View | Route | `process_area` | Defect set |
|---|---|---|---|
| `InspectionView` | `/inspections` | `producao_inicial` | OFFSET / UV / HOT_STAMPING tabs |
| `FinishingAnalysisView` | `/finishing-analysis` | `produto_acabado` | 26 finishing defects |

Machines and operators are filtered by their `area` column (`'producao_inicial'`, `'produto_acabado'`, `'ambos'`). Analysts are filtered by `tipo` (`'impressao'`, `'acabamento'`, `'ambos'`).

### Edit workflow
Analistas can edit their own inspections within **30 minutes** of creation (constant `EDIT_WINDOW_MINUTES = 30` in `RecordsView`). After that, they submit an `edit_request` (with `proposed_changes: jsonb`) which a supervisor approves or rejects via `SupervisorView`.

### Local storage keys
| Key | Value |
|---|---|
| `kg_theme` | `'light'` \| `'dark'` |
| `kg_sidebar_collapsed` | `'true'` \| `'false'` |
| `kg_initial_process_approval_rule` | JSON `ApprovalRule` |

The approval rule (percent vs quantity thresholds for RESTRICTED/REJECTED) is per-browser and only editable by supervisors.

### Unread count & realtime
`AppShell` subscribes to `shift_logs` and `shift_log_reads` via Supabase Realtime channels to drive the unread badge on the chat button and sidebar. The badge recalculates on every INSERT to either table.

### Shared components
`components/DefectCounter.tsx` — used by both `InspectionView` (variant `'amber'`) and `FinishingAnalysisView` (variant `'rose'`).

`components/ConfirmModal.tsx` — generic confirmation dialog used across views.

### PDF generation
`services/reportService.ts` exports three methods:
- `generateFinishingPDF` — finishing analysis laudo
- `generateInspectionPDF` — initial process inspection report
- `generateSummaryReportPDF` — aggregate report (can return a `Blob` for email attachment)

Color palette constants (`COLOR_PRIMARY`, `COLOR_ACCENT`, `COLOR_TEAL`, `COLOR_HEADER_BG`, `COLOR_INDIGO`) are defined at the top of the file.

### Database migrations
Migrations live in `supabase/migrations/` and must be run manually in the Supabase SQL Editor — there is no CLI migration runner configured. All tables use RLS. The general pattern is: analysts/analistas can read everything and write their own records; supervisors have full access.
