# Dashboard and system audit

## 2026-10-05 simplification follow-up

- Removed lead Overview's Recent activity panel and the lead Edit dialog/functionality, including the
  backend profile-update endpoint. Dedicated Team activity remains unchanged.
- Add Lead has no Owner selector. The backend assigns both owner name and ID from the authenticated
  creator, ignoring supplied owner fields; admin and two employee identities are covered by tests.
- Removed personalized outreach controls and scoped cadence/message write paths. Future cadence starts
  and SMS copy use global definitions. Historical runs and existing schedules/data are preserved; a
  read-only aggregate check found no active scoped versions, drafts, unfinished scoped steps, or overrides.
- Global draft step names automatically track their actual day after changes or reordering, preserving the
  action wording. The backend applies the same rule on save and clone.
- Verification: 208 backend tests passed (three optional integration tests skipped), 15 frontend tests passed,
  lint/typecheck, wheel build, and both frontend production builds passed. Admin browser checks verified
  automatic step names without saving; employee checks verified navigation, removed controls, Activity,
  and mobile lead/form layouts. No console errors were observed. No records or provider actions were changed.
- No new migration or deployment is required for the local verification. Production still needs the
  frontend/backend code deployed together. Existing runtime/provider safeguards remain in place.

The audit below records the earlier 2026-10-02 state; its Edit/personalized-control checks are historical.

Date: 2026-10-02. Scope: `F:\rpt\rpt_frontend`, its companion backend, and confirmed disposable build
artifacts directly within `F:\rpt`. This is an application/runtime audit, not an operating-system,
whole-drive, penetration-test, or compliance certification.

## Outcome

The screenshot's outage was caused by the local API not running. The dashboard is now running at
`http://localhost:3000`, with the dashboard-only API at `http://127.0.0.1:8000`. Existing multi-user login,
admin permissions, lead ownership, and Team activity remain intact. No patient records, database schema,
migrations, runtime credentials, provider modes, or outreach settings were changed by this audit.

## Findings and corrections

| Priority | Finding | Correction |
| --- | --- | --- |
| High | Frontend could start without its API | Added `npm.cmd run start:local`, which starts/reuses both services and checks their URLs. |
| High | Upstream connection failures escaped the proxy as framework errors | Return a safe, uncached `503`; do not log URLs, credentials, payloads, or raw exceptions. |
| High | Expired sessions looked like service outages | Shared dashboard request helper redirects `401` responses to sign-in; it never retries writes. |
| High | Failed lead-detail reads could leave a permanent skeleton | Track record-specific failures, show recovery UI, and retain previously loaded records when available. |
| High | Legacy preview code could claim success after a failed write | Removed the obsolete fallback and its unused prop. |
| High | Python lockfile omitted already-declared assistant dependencies | Regenerated the lock and synchronized the environment; corrected the websockets conflict. |
| High | Frontend development dependency scan reported seven advisories | Updated compatible Cloudflare tooling and patch-level dependencies; full npm audit is clear. |
| Medium | Python test tooling had a known advisory | Updated pytest and its async plugin, then reran all tests. See the [PyPA advisory](https://raw.githubusercontent.com/pypa/advisory-database/main/vulns/pytest/PYSEC-2026-1845.yaml). |
| Medium | Inputs/buttons, section headings, and focus indicators varied | Aligned standard controls to 44 px, preserved explicit compact variants, and strengthened keyboard focus. |
| Medium | Dark-mode pipeline colors were flattened to blue | Restored distinct stage colors and corrected activity-icon theme selectors. |
| Medium | Light-mode green/amber status text had weak contrast | Darkened shared label colors; tested pale status backgrounds now exceed 5:1 contrast. |
| Medium | Mobile analytics chart overflowed its panel | Reduced narrow-screen bar gaps and allowed bars to shrink. |
| Medium | Owner filters contained invented legacy names | Use the configured password-free roster plus existing stored owners; missing ownership is Unassigned. |
| Medium | Collapsed navigation and lead search lacked useful accessible names | Added navigation/search labels, skip-to-content link, dropdown Home/End/Tab behavior, and selection focus return. |
| Low | Technical role labels and oversized error states felt inconsistent | Use Administrator/Team member wording and shared compact empty/error styling. |
| Low | Startup and refresh documentation was stale | Corrected route names, 20-second refresh interval, setup guidance, and verification commands. |

The existing brand and navigation structure were preserved. Activity remains the lead tab name, with
**Team activity** inside it, no category filters, and only staff-made actions. Automated outreach remains
in its existing dedicated tabs. No new UI library, authentication layer, worker, or infrastructure was added.

## Verification

- Backend: **204 passed, 3 skipped**, Ruff passed, wheel build passed, `uv lock --check` and `uv pip check`
  passed. One upstream Starlette deprecation warning remains; the former async-plugin warnings are gone.
- Frontend: **15 tests passed** across display, cadence, authentication, and dashboard request behavior.
  ESLint, route type generation, TypeScript, Vinext production build, and native Next.js production build pass.
- Checked all 40 files in both generated client builds: no configured passwords, dashboard API token, or
  session-signing secret is present in browser output.
- Dependency scans: `npm audit` reports **zero vulnerabilities**, including development dependencies.
  `pip-audit` reports **no known vulnerabilities** for published Python dependencies; the local `rpt-agent`
  application is not a PyPI package and is excluded from that advisory lookup.
- HTTP sign-in and authenticated snapshot reads pass for the configured administrator and all five employees.
  Every employee receives `403` for global cadence creation through the real proxy/backend path.
- An additional backend HTTP regression check verifies employee denial of template creation/update/deletion,
  lead deletion, global cadence creation, and permanent cadence deletion before a database transaction begins.
- Browser: admin/employee sign-in, employee restriction message, normal lead access, and absence of employee
  delete/administration controls checked. Existing tests verify separate staff attribution and password-free
  sessions, configuration rejection, cookie expiry/tampering, password changes, and removed accounts.
- Desktop, 390 px mobile, and 768 px tablet checks covered Home, lead list/board, appointments, review,
  analytics, administration, global cadences, and SMS templates. Light/dark stage colors remain distinct;
  standard desktop controls measure 44 px. Lead Overview, SMS, call history, cadence, appointments, and
  Activity were checked without sending messages, placing calls, changing cadences, or booking appointments.
- Mobile Add Lead/Edit dialogs fit their viewport. Cancel returns focus to the opener without saving.
  Navigation drawer open/close and dropdown keyboard navigation checked. Team activity has no category
  filters and its search has a descriptive accessible label.
- Failure/recovery: a stopped API produces an uncached proxy `503`. First-load failure shows a retry control
  without an endless skeleton. A later outage retains loaded data with an Offline/recovery notice. Automatic
  polling restores Connected and removes the notice after restart. A separate first-load outage/restart check
  confirms that clicking Retry connection restores Connected and replaces the error screen with live cards.
- The startup command was run repeatedly: it reuses healthy services and leaves them running. Browser viewport
  overrides were reset; the dashboard was left open in the administrator session.

## Cleanup

Moved these two untracked, confirmed stale Next build folders to the Windows Recycle Bin:

- `F:\rpt\.codex-stale-next`
- `F:\rpt\.codex-stale-next-2`

Total: **83,456,305 bytes (79.6 MiB)**. They can be restored from Recycle Bin or regenerated by a build.
An incomplete websockets uninstall metadata directory was archived in the system temporary directory before
repairing the active Python environment. No application data was removed.

Retained source repos, their Git history, environment files, migrations, fixtures, logs, configuration,
active `.venv`/`node_modules`, current verified production output, and required integration scripts. The
legacy workspace-root Git repository has pre-existing moved/deleted-file state; it was deliberately not
reset or deleted. Folders elsewhere on the drive were not classified as disposable or deleted.

## Remaining operational limits

- `/health` is healthy; `/ready` still rejects unverified Stride configuration for active practices. Do not
  bypass this safeguard or enable live booking/outreach until provider configuration is verified.
- Three integration tests need a separate test database/provider setup and remain skipped. Browser audit
  actions were read-only or cancelled; no real provider-side action was exercised.
- The project declares Node 22, while this workstation currently uses Node 26. The checks above passed here;
  deployment should continue using the declared runtime.
- Credential values previously pasted into chat should be rotated before production. This audit did not
  change passwords or deployment secrets, and no password was included in source, this report, or browser data.
- Deleting folders outside this workspace requires specific paths and a separate review of their contents.

## Local use

```powershell
cd F:\rpt\rpt_frontend
npm.cmd run start:local
```

Open `http://localhost:3000` and use your existing login. The launcher does not apply migrations or start
outreach/Sheet workers, and it does not enable booking. Changes are local and have not been deployed.
