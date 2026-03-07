# StudioFlow360 - Detailed Phased Implementation Plan

> Derived from StudioFlow360 HLD v1.0 — MustardTree Group — March 2026
>
> **Deployment model:** Local development with Wrangler CLI. Direct deployment to Cloudflare (no GitHub CI). Code pushed to GitHub for version control only.

---

## Project Structure (Monorepo)

```
studioflow360/
├── apps/
│   ├── web/                    # React + Vite SPA (Cloudflare Pages)
│   └── api/                    # Hono Workers API (Cloudflare Workers)
├── workers/
│   ├── email-worker/           # Email ingestion Worker
│   └── queue-consumer/         # Queue consumer for AI parsing
├── packages/
│   └── shared/                 # Shared types, schemas, constants
├── migrations/                 # D1 schema migrations
├── scripts/                    # Deployment & utility scripts
├── wrangler.toml               # Root Wrangler config (or per-worker configs)
├── package.json                # Root package.json (pnpm workspaces)
├── tsconfig.json               # Root TypeScript config
└── IMPLEMENTATION-PLAN.md      # This file
```

## Deployment Workflow

```
Local Dev (Wrangler dev) → Deploy to Cloudflare (Wrangler deploy) → Push to GitHub
```

- **Local dev:** `wrangler dev` with local D1/KV/R2 (Miniflare)
- **Staging:** `wrangler deploy --env staging` (preview Workers + Pages preview)
- **Production:** `wrangler deploy --env production` + `wrangler pages deploy`
- **GitHub:** `git push origin main` after each successful deployment

---

## Phase 1: Foundation & Ingestion (2-3 weeks)

**Goal:** Set up the project scaffold, Cloudflare infrastructure, D1 database, email ingestion pipeline, and AI parsing for the first two platforms.

### 1.1 Project Scaffolding & Tooling

| # | Task | Details |
|---|------|---------|
| 1.1.1 | Initialize monorepo | `pnpm init`, configure `pnpm-workspace.yaml` with `apps/*`, `workers/*`, `packages/*` |
| 1.1.2 | TypeScript configuration | Root `tsconfig.json` with project references; per-package `tsconfig.json` extending root |
| 1.1.3 | Shared package setup | Create `packages/shared/` with shared types, Zod schemas, constants, status enums |
| 1.1.4 | Linting & formatting | ESLint + Prettier config at root; `.editorconfig` |
| 1.1.5 | Git configuration | `.gitignore` (node_modules, .wrangler, .dev.vars, dist), branch protection rules on GitHub |
| 1.1.6 | Wrangler configuration | Root or per-worker `wrangler.toml` files with dev/staging/production environments |
| 1.1.7 | Local dev scripts | `package.json` scripts for `dev`, `deploy:staging`, `deploy:production`, `db:migrate`, `db:seed` |

### 1.2 Cloudflare Resource Provisioning

| # | Task | Details |
|---|------|---------|
| 1.2.1 | Create D1 databases | `wrangler d1 create studioflow360-db` (production) + staging variant |
| 1.2.2 | Create KV namespaces | `wrangler kv namespace create EMAIL_DEDUP` (deduplication), `SESSION_STORE` (sessions), `RATE_LIMIT` |
| 1.2.3 | Create R2 bucket | `wrangler r2 bucket create studioflow360-emails` for raw email archive |
| 1.2.4 | Create Queue | `wrangler queues create booking-parse-queue` |
| 1.2.5 | Bind resources in wrangler.toml | D1 bindings, KV bindings, R2 bindings, Queue producer/consumer bindings, AI binding |

### 1.3 D1 Schema & Migrations

| # | Task | Details |
|---|------|---------|
| 1.3.1 | Migration: `rooms` table | `id TEXT PK`, `name TEXT`, `description TEXT`, `capacity INTEGER`, `hourly_rate REAL`, `color_hex TEXT`, `active INTEGER DEFAULT 1`, `created_at TEXT` |
| 1.3.2 | Migration: `staff_users` table | `id TEXT PK`, `access_email TEXT UNIQUE`, `display_name TEXT`, `role TEXT` (admin/manager/staff), `active INTEGER`, `created_at TEXT` |
| 1.3.3 | Migration: `bookings` table | Full schema per HLD: platform, platform_ref, status, room_id FK, guest fields, time fields, AI confidence, staff notes, assignment, approval tracking, platform_actioned flag, raw_email_r2_key, timestamps |
| 1.3.4 | Migration: `booking_events` table | `id TEXT PK`, `booking_id TEXT FK`, `event_type TEXT`, `actor_id TEXT FK`, `payload TEXT` (JSON), `created_at TEXT` |
| 1.3.5 | Migration: `platform_email_rules` table | `id TEXT PK`, `platform TEXT`, `sender_domain TEXT`, `subject_pattern TEXT`, `active INTEGER` |
| 1.3.6 | Seed data script | Insert default rooms (Studio A, Studio B, Podcast Suite), seed admin user, seed platform_email_rules for Giggster, Peerspace, Scouty, TagVenue |
| 1.3.7 | Run migrations locally | `wrangler d1 migrations apply studioflow360-db --local` and verify schema |

### 1.4 Shared Types & Schemas (packages/shared)

| # | Task | Details |
|---|------|---------|
| 1.4.1 | Booking status enum | `PENDING`, `NEEDS_REVIEW`, `APPROVED`, `REJECTED`, `PLATFORM_ACTIONED`, `CONFIRMED`, `CANCELLED` |
| 1.4.2 | Platform enum | `giggster`, `peerspace`, `scouty`, `tagvenue`, `direct` |
| 1.4.3 | BookingCandidate Zod schema | Matches AI extraction output: platform, platformRef, guestName, guestEmail, requestedDate, startTime, endTime, durationHours, roomHint, guestCount, totalPrice, currency, notes, confidence |
| 1.4.4 | API response envelope type | `{ success: boolean, data?: T, error?: { code: string, message: string } }` |
| 1.4.5 | Event type enum | `RECEIVED`, `PARSED`, `ASSIGNED`, `APPROVED`, `REJECTED`, `CONFIRMED`, `NOTE_ADDED`, `PLATFORM_ACTIONED` |
| 1.4.6 | DB row types | TypeScript interfaces matching each D1 table schema |

### 1.5 Email Worker (workers/email-worker)

| # | Task | Details |
|---|------|---------|
| 1.5.1 | Scaffold Email Worker | `wrangler init email-worker` with `email` handler entry point |
| 1.5.2 | Sender domain extraction | Parse `from` header to extract sender domain |
| 1.5.3 | Platform identification | Query `platform_email_rules` from D1 (or hardcoded lookup) to map sender domain to platform |
| 1.5.4 | Email deduplication | SHA-256 hash of `Message-ID` header; check/set in KV namespace `EMAIL_DEDUP` with 7-day TTL |
| 1.5.5 | R2 archival | Store raw MIME body in R2 with key pattern: `emails/{platform}/{YYYY-MM-DD}/{messageId}.eml` |
| 1.5.6 | Queue enqueue | Push structured job to `booking-parse-queue`: `{ r2Key, platform, senderDomain, receivedAt, messageId }` |
| 1.5.7 | Error handling | Catch-all try/catch; log failures; still archive to R2 even if queue enqueue fails |
| 1.5.8 | Local testing | Use Miniflare email mock or manual test script to simulate email delivery |

### 1.6 Queue Consumer Worker (workers/queue-consumer)

| # | Task | Details |
|---|------|---------|
| 1.6.1 | Scaffold Queue Consumer | Worker with `queue` handler consuming from `booking-parse-queue` |
| 1.6.2 | R2 fetch | Retrieve raw email body from R2 using the `r2Key` from the queue message |
| 1.6.3 | Email body extraction | Parse MIME to extract HTML/text body (use `postal-mime` or similar lightweight MIME parser) |
| 1.6.4 | AI parsing prompt | Craft structured extraction prompt for Workers AI: instruct LLM to return JSON matching `BookingCandidate` schema; include platform-specific hints |
| 1.6.5 | Workers AI call | Submit prompt + email body to Workers AI (`@cf/meta/llama-3.1-70b-instruct` or similar); parse JSON response |
| 1.6.6 | Confidence threshold | If `confidence < 0.6`, set status to `NEEDS_REVIEW`; otherwise `PENDING` |
| 1.6.7 | D1 insert | Insert parsed booking into `bookings` table with all extracted fields; generate UUID for `id` |
| 1.6.8 | Audit event | Insert `RECEIVED` + `PARSED` events into `booking_events` |
| 1.6.9 | Retry & dead-letter | Configure queue retry policy (3 retries, exponential backoff); log permanently failed messages |
| 1.6.10 | Giggster parser tuning | Collect sample Giggster emails; refine AI prompt for Giggster's HTML template format |
| 1.6.11 | Peerspace parser tuning | Collect sample Peerspace emails; refine AI prompt for Peerspace's HTML template format |

### 1.7 Direct Website Ingest Endpoint

| # | Task | Details |
|---|------|---------|
| 1.7.1 | Scaffold API Worker | `apps/api/` using Hono framework; configure `wrangler.toml` with all bindings |
| 1.7.2 | `POST /api/bookings/ingest` | Accept structured booking JSON from website form; validate with Zod schema |
| 1.7.3 | Turnstile validation | Verify Cloudflare Turnstile token server-side before processing |
| 1.7.4 | D1 insert | Write directly to `bookings` with `platform = 'direct'`, `status = 'PENDING'`, `ai_confidence = 1.0` |
| 1.7.5 | Audit event | Insert `RECEIVED` event into `booking_events` |

### Phase 1 Deliverables
- [ ] Monorepo with TypeScript, linting, shared package
- [ ] All Cloudflare resources provisioned (D1, KV, R2, Queue)
- [ ] D1 schema fully migrated with seed data
- [ ] Email Worker receiving, deduplicating, archiving, and enqueuing emails
- [ ] Queue Consumer parsing Giggster + Peerspace emails via Workers AI
- [ ] Direct website ingest endpoint operational
- [ ] Local dev environment working end-to-end with `wrangler dev`

---

## Phase 2: Core Dashboard & API (2-3 weeks)

**Goal:** Build the Workers REST API and React SPA with the Unified Inbox, Booking Detail view, and Cloudflare Access authentication.

### 2.1 Workers REST API (apps/api - Hono)

| # | Task | Details |
|---|------|---------|
| 2.1.1 | API middleware: CORS | Configure CORS for Pages domain origin |
| 2.1.2 | API middleware: Auth | Validate Cloudflare Access JWT on all `/api/*` routes (except `/api/bookings/ingest`); extract `email` and match to `staff_users`; attach user context |
| 2.1.3 | API middleware: Role guard | Higher-order middleware for admin/manager role checks on protected routes |
| 2.1.4 | API middleware: Error handler | Global error handler returning consistent JSON envelope `{ success: false, error: { code, message } }` |
| 2.1.5 | `GET /api/me` | Return authenticated staff profile from Access JWT + D1 staff_users lookup |
| 2.1.6 | `GET /api/bookings` | List bookings with query params: `status`, `platform`, `room_id`, `date_from`, `date_to`, `assigned_to`, `page`, `per_page`. Default sort: `created_at DESC` |
| 2.1.7 | `GET /api/bookings/:id` | Full booking detail including joined audit events from `booking_events` (ordered by `created_at ASC`) |
| 2.1.8 | `PATCH /api/bookings/:id/status` | Validate status transition against state machine; update `bookings.status`; set `approved_at`/`approved_by` if approving; insert `booking_events` record |
| 2.1.9 | `PATCH /api/bookings/:id/room` | Assign/reassign room; validate room exists and is active; insert `ASSIGNED` event |
| 2.1.10 | `POST /api/bookings/:id/notes` | Add staff note; insert `NOTE_ADDED` event with note text in payload |
| 2.1.11 | `GET /api/rooms` | List all active rooms |
| 2.1.12 | `POST /api/rooms` | Create room (admin only); Zod validation |
| 2.1.13 | `PATCH /api/rooms/:id` | Update room details (admin/manager) |
| 2.1.14 | `GET /api/staff` | List staff users (admin only) |
| 2.1.15 | Input validation | Zod schemas for all request bodies and query params; parameterised D1 queries throughout |
| 2.1.16 | Status state machine | Enforce valid transitions: PENDING→APPROVED/REJECTED, NEEDS_REVIEW→APPROVED/REJECTED, APPROVED→PLATFORM_ACTIONED/CANCELLED, PLATFORM_ACTIONED→CONFIRMED/CANCELLED, CONFIRMED→CANCELLED |

### 2.2 Frontend Scaffolding (apps/web)

| # | Task | Details |
|---|------|---------|
| 2.2.1 | Vite + React + TypeScript | `npm create vite@latest web -- --template react-ts` |
| 2.2.2 | Tailwind CSS setup | Install and configure Tailwind CSS for utility-first styling |
| 2.2.3 | React Router | Set up client-side routing: `/inbox`, `/bookings/:id`, `/calendar`, `/action-queue`, `/analytics`, `/settings` |
| 2.2.4 | API client layer | Typed fetch wrapper using shared types; handles auth headers (Cloudflare Access cookie is automatic), error parsing, pagination |
| 2.2.5 | Auth context | `useAuth` hook — call `GET /api/me` on load; store staff profile in React context; redirect to Access login if 401 |
| 2.2.6 | Layout shell | Sidebar navigation (Inbox, Calendar, Action Queue, Analytics, Settings), top bar with staff name/role, notification badge placeholder |
| 2.2.7 | Loading & error states | Reusable skeleton loaders, error boundary, toast notification system |
| 2.2.8 | Pages deployment config | `wrangler pages` or manual `wrangler pages deploy dist/` after `vite build` |

### 2.3 Unified Inbox View (/inbox)

| # | Task | Details |
|---|------|---------|
| 2.3.1 | Booking list component | Fetch `GET /api/bookings`; render as card list with: platform badge (colour-coded per platform), booking ref, guest name, date/time, status badge, assigned room |
| 2.3.2 | Platform badge colours | Scouty=blue, Giggster=purple, Peerspace=green, TagVenue=orange, Direct=gray |
| 2.3.3 | Status badges | PENDING=yellow, NEEDS_REVIEW=amber, APPROVED=blue, PLATFORM_ACTIONED=indigo, CONFIRMED=green, REJECTED=red, CANCELLED=gray |
| 2.3.4 | Filter bar | Dropdowns/chips for: platform, status, date range picker, assigned staff. Apply as query params to API call |
| 2.3.5 | Search | Text search across guest_name, platform_ref, notes (API-side LIKE query or client-side filter) |
| 2.3.6 | Pagination | Page-based pagination with page size selector (10/25/50) |
| 2.3.7 | NEEDS_REVIEW highlight | Amber background/border + warning icon for low-confidence bookings |
| 2.3.8 | Empty states | "No bookings found" with contextual message per active filter |
| 2.3.9 | Quick actions | Inline approve/reject buttons on each card for fast triage |

### 2.4 Booking Detail View (/bookings/:id)

| # | Task | Details |
|---|------|---------|
| 2.4.1 | Detail layout | Two-column: left = structured booking fields, right = raw email viewer |
| 2.4.2 | Booking fields display | All parsed fields in a structured card: guest info, date/time, room, price, platform ref, AI confidence score |
| 2.4.3 | Raw email iframe | Fetch raw email from R2 via API (`GET /api/bookings/:id/raw-email`); render in sandboxed `<iframe sandbox>` |
| 2.4.4 | Status controls | Action buttons based on current status and state machine: Approve, Reject, Mark Platform Actioned, Confirm, Cancel |
| 2.4.5 | Room assignment | Dropdown of active rooms; on select calls `PATCH /api/bookings/:id/room` |
| 2.4.6 | Staff assignment | Dropdown of active staff; calls `PATCH /api/bookings/:id` with `assigned_to` |
| 2.4.7 | Staff notes | Text input + submit button; calls `POST /api/bookings/:id/notes` |
| 2.4.8 | Audit timeline | Chronological list of all `booking_events` at bottom: event type, actor name, timestamp, payload details |
| 2.4.9 | Manual action banner | Prominent banner for APPROVED bookings: "Action Required: Accept/reject this booking on {platform}" |
| 2.4.10 | Add raw email API endpoint | `GET /api/bookings/:id/raw-email` — fetch from R2 and return email body for iframe rendering |

### 2.5 Cloudflare Access Integration

| # | Task | Details |
|---|------|---------|
| 2.5.1 | Access application | Create Cloudflare Access application for the Pages domain (e.g., `app.studioflow360.com`) |
| 2.5.2 | Access policy | Allow policy for staff email addresses or IdP group; configure Google Workspace / email OTP |
| 2.5.3 | JWT validation in Worker | Validate `CF_Authorization` cookie JWT; verify signature against Cloudflare JWKS endpoint; extract email claim |
| 2.5.4 | Staff user auto-provisioning | On first valid JWT login, if email not in `staff_users`, optionally create with `role = 'staff'` (or reject) |

### Phase 2 Deliverables
- [ ] Full REST API with all booking CRUD endpoints
- [ ] Auth middleware validating Cloudflare Access JWTs
- [ ] Role-based access control (admin, manager, staff)
- [ ] React SPA with sidebar navigation and auth flow
- [ ] Unified Inbox with filtering, search, and pagination
- [ ] Booking Detail with raw email viewer, status controls, room assignment, notes, audit trail
- [ ] Deployed to Cloudflare Pages (staging)

---

## Phase 3: Calendar, Conflicts & Action Queue (2 weeks)

**Goal:** Build the Room Calendar view with conflict detection, the Platform Action Queue, manual action tracking, and real-time updates via Durable Objects.

### 3.1 Calendar API & Conflict Detection

| # | Task | Details |
|---|------|---------|
| 3.1.1 | `GET /api/calendar` | Return bookings grouped by room and date; query params: `start_date`, `end_date`, `room_ids`; include status for visual styling |
| 3.1.2 | Conflict detection query | On room assignment (`PATCH /api/bookings/:id/room`), run overlap check: `SELECT id FROM bookings WHERE room_id = ? AND booking_date = ? AND status NOT IN ('REJECTED','CANCELLED') AND start_time < ?end AND end_time > ?start` |
| 3.1.3 | Hard vs soft conflicts | Return `409` with conflicting booking IDs for APPROVED/PLATFORM_ACTIONED/CONFIRMED conflicts; return `200` with warnings for PENDING/NEEDS_REVIEW overlaps |
| 3.1.4 | `PATCH /api/bookings/:id/platform-action` | Set `platform_actioned = 1`, `platform_actioned_at = NOW()`; change status to `PLATFORM_ACTIONED`; insert event |

### 3.2 Room Calendar View (/calendar)

| # | Task | Details |
|---|------|---------|
| 3.2.1 | Calendar layout | Week view (default) and month view toggle; rooms as horizontal swimlane rows |
| 3.2.2 | Booking blocks | Confirmed/platform-actioned bookings as solid colour blocks (room colour); pending/approved as outlined/hatched blocks |
| 3.2.3 | Conflict highlighting | Overlapping bookings shown in red with conflict icon |
| 3.2.4 | Click-to-detail | Clicking a booking block navigates to `/bookings/:id` |
| 3.2.5 | Drag-and-drop reassignment | For non-confirmed bookings: drag between room rows to reassign; calls `PATCH /api/bookings/:id/room` with conflict check |
| 3.2.6 | Date navigation | Previous/next week/month buttons; date picker to jump to specific date |
| 3.2.7 | Room filter toggles | Checkboxes to show/hide specific rooms |
| 3.2.8 | Print-to-PDF | Browser print stylesheet or `html2canvas` + `jsPDF` for calendar export |

### 3.3 Platform Action Queue (/action-queue)

| # | Task | Details |
|---|------|---------|
| 3.3.1 | Action queue API | `GET /api/bookings?status=APPROVED&platform_actioned=0` (or dedicated endpoint) — bookings awaiting manual platform action |
| 3.3.2 | Task list UI | Focused list view: platform name + icon, booking ref, guest name, date, "Mark as Actioned" checkbox |
| 3.3.3 | Platform link reminder | Display the platform name prominently so staff know where to log in |
| 3.3.4 | Mark as actioned | Checkbox calls `PATCH /api/bookings/:id/platform-action`; item moves out of list |
| 3.3.5 | Bulk action | "Mark all selected as actioned" for multiple bookings |

### 3.4 Reminder System

| # | Task | Details |
|---|------|---------|
| 3.4.1 | Stale approval detection | API query: bookings with `status = 'APPROVED'` and `approved_at` older than 2 hours and `platform_actioned = 0` |
| 3.4.2 | Visual alert indicator | Amber/red pulsing dot on stale bookings in inbox and action queue |
| 3.4.3 | Inbox badge count | Count of items needing action (PENDING + NEEDS_REVIEW + stale APPROVED) shown on sidebar nav |

### 3.5 Real-Time Updates (Durable Objects)

| # | Task | Details |
|---|------|---------|
| 3.5.1 | WebSocket Durable Object | Create `BookingHub` Durable Object class; accept WebSocket connections from authenticated staff |
| 3.5.2 | Connection auth | Validate Access JWT on WebSocket upgrade request |
| 3.5.3 | Broadcast on booking change | When Queue Consumer creates a booking or API Worker changes status, send message to Durable Object; DO broadcasts to all connected clients |
| 3.5.4 | Frontend WebSocket client | React hook `useBookingSocket` — connect on mount, reconnect on disconnect, parse incoming messages |
| 3.5.5 | Live inbox updates | On `new_booking` message: prepend to inbox list, increment badge count. On `status_change`: update booking in-place |
| 3.5.6 | Calendar live updates | On booking change, refresh calendar data for affected room/date |

### Phase 3 Deliverables
- [ ] Room Calendar with week/month views, swimlane layout, conflict highlighting
- [ ] Conflict detection blocking overlapping room assignments
- [ ] Platform Action Queue with mark-as-actioned workflow
- [ ] 2-hour stale approval reminders with visual alerts
- [ ] Real-time WebSocket updates across all staff browser sessions
- [ ] Drag-and-drop room reassignment on calendar

---

## Phase 4: AI Expansion & Analytics (1-2 weeks)

**Goal:** Extend AI parsing to cover all platforms, implement the NEEDS_REVIEW workflow, build the Analytics Dashboard, and create the Settings admin panel.

### 4.1 AI Parsing Expansion

| # | Task | Details |
|---|------|---------|
| 4.1.1 | Scouty email samples | Collect sample Scouty emails; analyse HTML structure (structured HTML, booking ref in subject) |
| 4.1.2 | Scouty AI prompt | Craft platform-specific extraction prompt; test against samples; tune for accuracy |
| 4.1.3 | TagVenue email samples | Collect sample TagVenue emails; analyse format (plain-text/minimal HTML, enquiry-style) |
| 4.1.4 | TagVenue AI prompt | Craft extraction prompt for TagVenue's less-structured format; lower expected confidence |
| 4.1.5 | Platform-specific prompt routing | Queue Consumer selects AI prompt based on `platform` field from queue message |
| 4.1.6 | AI Gateway integration | Route Workers AI calls through AI Gateway for logging, rate limiting, and observability |
| 4.1.7 | Parsing accuracy testing | Create test suite of sample emails per platform; validate extraction output against expected fields |

### 4.2 NEEDS_REVIEW Workflow

| # | Task | Details |
|---|------|---------|
| 4.2.1 | Low-confidence UI flow | NEEDS_REVIEW bookings show side-by-side: parsed fields (editable) vs raw email |
| 4.2.2 | Field correction | Allow staff to manually correct parsed fields before approving |
| 4.2.3 | Save corrections API | `PATCH /api/bookings/:id` — update individual booking fields; log `EDITED` event |
| 4.2.4 | Promote to PENDING | After staff corrects fields, status changes to PENDING (or directly to APPROVED) |

### 4.3 Analytics Dashboard (/analytics)

| # | Task | Details |
|---|------|---------|
| 4.3.1 | Analytics API endpoints | `GET /api/analytics/summary` — booking counts by status, platform distribution, approval rate. `GET /api/analytics/timeline` — booking volume over time (daily/weekly) |
| 4.3.2 | Summary metrics | D1 aggregate queries: total bookings, bookings by platform, bookings by status, average AI confidence |
| 4.3.3 | Approval rate calculation | Approved / (Approved + Rejected) over configurable date range |
| 4.3.4 | Average time to approval | `AVG(approved_at - created_at)` for approved bookings |
| 4.3.5 | Room utilisation heat map | Booking hours per room per day-of-week; D1 query grouped by room and day |
| 4.3.6 | Revenue pipeline | Sum of `total_price` grouped by status (pipeline view: pending → approved → confirmed) |
| 4.3.7 | Chart library | Integrate lightweight chart library (e.g., `recharts` or `chart.js`) for line charts, bar charts, heat maps |
| 4.3.8 | Date range selector | Date range filter applied to all analytics queries |
| 4.3.9 | Room filter | Filter analytics by specific room(s) |
| 4.3.10 | Analytics Engine integration | Optionally write booking events to Cloudflare Analytics Engine for long-term trend analysis beyond D1 |

### 4.4 Settings Panel (/settings)

| # | Task | Details |
|---|------|---------|
| 4.4.1 | Room management | CRUD interface for rooms: name, capacity, hourly rate, colour picker, active toggle |
| 4.4.2 | Staff management | List staff; admin can add/edit staff (email, display name, role); deactivate staff |
| 4.4.3 | Platform email rules | View/edit sender domain matching rules per platform; enable/disable rules |
| 4.4.4 | Email parsing test panel | Text area to paste a sample email; submit to parsing pipeline; display extracted `BookingCandidate` JSON for debugging |
| 4.4.5 | Access control | Settings page restricted to admin role via both Access policy and API role guard |

### Phase 4 Deliverables
- [ ] AI parsing working for all 4 platforms (Giggster, Peerspace, Scouty, TagVenue)
- [ ] NEEDS_REVIEW flow with side-by-side comparison and field correction
- [ ] Analytics Dashboard with charts: volume timeline, platform split, approval rate, room utilisation, revenue
- [ ] Settings panel for rooms, staff, platform rules, and email test panel
- [ ] AI Gateway integrated for observability

---

## Phase 5: Hardening & Launch (1 week)

**Goal:** Security hardening, performance testing, documentation, and production deployment.

### 5.1 Security Hardening

| # | Task | Details |
|---|------|---------|
| 5.1.1 | Rate limiting | Apply Cloudflare Rate Limiting on all API routes; stricter limits on `/api/bookings/ingest` |
| 5.1.2 | Input sanitisation audit | Review all API endpoints for Zod validation completeness; ensure parameterised D1 queries everywhere |
| 5.1.3 | XSS prevention | Ensure raw email iframe uses `sandbox` attribute with no `allow-scripts`; sanitise any user-generated content rendered in UI |
| 5.1.4 | R2 access audit | Verify R2 bucket has no public access; all access goes through authenticated API Worker |
| 5.1.5 | JWT validation hardening | Verify JWKS caching, token expiry checks, audience validation |
| 5.1.6 | Email spoofing defence | Verify Email Routing drops emails failing DMARC/SPF/DKIM; test with spoofed sender |
| 5.1.7 | KV TTL audit | Verify deduplication keys have appropriate TTL (7 days); session tokens have expiry |
| 5.1.8 | Secrets audit | Ensure no secrets in code; all sensitive values in Cloudflare Workers Secrets |

### 5.2 Performance & Reliability

| # | Task | Details |
|---|------|---------|
| 5.2.1 | D1 query optimisation | Add indexes on `bookings(status)`, `bookings(room_id, booking_date)`, `bookings(platform)`, `bookings(created_at)`, `booking_events(booking_id)` |
| 5.2.2 | Pagination verification | Ensure all list endpoints are paginated; no unbounded queries |
| 5.2.3 | Queue retry testing | Simulate AI parsing failures; verify retry policy and dead-letter behaviour |
| 5.2.4 | WebSocket reconnection | Test Durable Object WebSocket reconnection under network instability |
| 5.2.5 | Bundle size optimisation | Vite build analysis; code-split routes; lazy-load heavy components (calendar, charts) |
| 5.2.6 | Load testing | Simulate concurrent booking ingestion; verify D1 handles expected volume |

### 5.3 Documentation & Onboarding

| # | Task | Details |
|---|------|---------|
| 5.3.1 | Staff user guide | How to use the inbox, approve bookings, use the action queue, read the calendar |
| 5.3.2 | Admin setup guide | How to configure rooms, manage staff, set up email forwarding from platforms |
| 5.3.3 | Email forwarding instructions | Per-platform guide: how to BCC/forward booking emails to `bookings@yourstudio.com` |
| 5.3.4 | Developer README | Local setup, deployment commands, architecture overview, environment variables |
| 5.3.5 | Runbook | Common issues, how to reprocess a failed email, how to manually add a booking |

### 5.4 Production Deployment

| # | Task | Details |
|---|------|---------|
| 5.4.1 | Production D1 migration | `wrangler d1 migrations apply studioflow360-db --remote` |
| 5.4.2 | Production seed data | Insert production rooms, admin user(s), platform email rules |
| 5.4.3 | Deploy Workers | `wrangler deploy` for API Worker, Email Worker, Queue Consumer |
| 5.4.4 | Deploy Pages | `vite build && wrangler pages deploy dist/` |
| 5.4.5 | Cloudflare Email Routing | Configure production email routing for `bookings@yourstudio.com` → Email Worker |
| 5.4.6 | Cloudflare Access production | Set up Access application and policies for production domain |
| 5.4.7 | DNS configuration | Point custom domain to Cloudflare Pages; configure email MX/routing records |
| 5.4.8 | Smoke testing | End-to-end test: send test email → verify parsing → verify inbox → approve → action queue → confirm → calendar |
| 5.4.9 | Push to GitHub | Final `git push origin main` with all production-ready code |

### Phase 5 Deliverables
- [ ] All security controls implemented and audited
- [ ] D1 indexes optimised for query patterns
- [ ] Staff and admin documentation complete
- [ ] Production deployment live with email routing active
- [ ] End-to-end smoke test passing
- [ ] Code pushed to GitHub

---

## Deployment Commands Reference

```bash
# Local development
pnpm dev                                    # Start all workers + pages in dev mode

# Database migrations
wrangler d1 migrations apply DB --local     # Apply migrations locally
wrangler d1 migrations apply DB --remote    # Apply migrations to production

# Deploy Workers (from each worker directory)
wrangler deploy                             # Deploy to production
wrangler deploy --env staging               # Deploy to staging

# Deploy Pages (from apps/web/)
pnpm build && wrangler pages deploy dist/   # Build and deploy frontend

# Push to GitHub (after successful deployment)
git add . && git commit -m "description" && git push origin main
```

---

## Key Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Monorepo tool | pnpm workspaces | Lightweight, fast, no extra tooling needed |
| API framework | Hono | Edge-optimised, lightweight, excellent Cloudflare Workers support |
| Frontend framework | React + Vite | Fast builds, wide ecosystem, Cloudflare Pages native support |
| Styling | Tailwind CSS | Utility-first, rapid UI development, small bundle |
| Validation | Zod | Runtime + TypeScript type inference, works in Workers |
| MIME parsing | postal-mime | Lightweight, works in Workers runtime (no Node.js APIs) |
| Charts | Recharts | React-native, composable, lightweight |
| Calendar | Custom or @schedule-x | Swimlane layout not standard in most libraries; may need custom |
| State management | React Context + hooks | Sufficient for this app size; no Redux overhead needed |

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Workers AI parsing inaccuracy | Confidence scoring + NEEDS_REVIEW flow; staff always verify against raw email |
| D1 SQLite limitations (no FK enforcement) | Application-layer FK validation in API; comprehensive Zod schemas |
| Email format changes by platforms | Platform email rules are configurable; AI prompts can be updated without code deploy |
| Durable Objects cost at scale | WebSocket connections only for active staff sessions; auto-disconnect idle |
| Queue message loss | R2 archival before queue enqueue; reprocessing capability from R2 |
| Cloudflare service outage | R2 raw emails enable full reprocessing; D1 automatic backups |
