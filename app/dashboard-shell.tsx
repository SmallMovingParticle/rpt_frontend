'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react';
import { emptySnapshot, Lead, LeadCreateInput, LeadDetail, LeadStage, Snapshot } from './dashboard-data';

const statusMeta: Record<LeadStage, { label: string }> = {
  new: { label: 'New' },
  cadence: { label: 'In Cadence' },
  attention: { label: 'Needs Attention' },
  booked: { label: 'Booked' },
  closed: { label: 'Closed' },
};

const locations = ['Dana Point', 'Laguna Niguel', 'Mission Viejo'];
const owners = ['Sarah Johnson', 'Michael Rodriguez'];
type DashboardAction = (path: string, method: string, body?: unknown) => Promise<boolean>;

const nav = [
  ['/', 'HM', 'Home'], ['/leads', 'LD', 'Leads'], ['/appointments', 'AP', 'Appointments'],
  ['/review', 'RQ', 'Review Queue'], ['/analytics', 'AN', 'Analytics'], ['/administration', 'AD', 'Administration'],
] as const;

export function DashboardShell({ displayName, localPreview = false }: { displayName: string; localPreview?: boolean }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot);
  const [detail, setDetail] = useState<LeadDetail | null>(null);
  const [live, setLive] = useState(false);
  const [notice, setNotice] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('All Locations');
  const [globalQuery, setGlobalQuery] = useState('');
  const [addingLead, setAddingLead] = useState(false);
  const leadId = pathname.match(/^\/leads\/([0-9a-f-]+)/i)?.[1];

  useEffect(() => {
    const controller = new AbortController();
    function refresh() {
      fetch('/api/dashboard/snapshot', { cache: 'no-store', signal: controller.signal })
        .then((response) => response.ok ? response.json() as Promise<Snapshot> : Promise.reject())
        .then((data) => { setSnapshot(data); setLive(true); })
        .catch(() => undefined);
    }
    refresh();
    const interval = window.setInterval(() => { if (!document.hidden) refresh(); }, 20000);
    const onVisible = () => { if (!document.hidden) refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { controller.abort(); window.clearInterval(interval); document.removeEventListener('visibilitychange', onVisible); };
  }, []);

  useEffect(() => {
    if (!leadId) return;
    const controller = new AbortController();
    function refresh() {
      fetch(`/api/dashboard/leads/${leadId}`, { cache: 'no-store', signal: controller.signal })
        .then((response) => {
          if (response.status === 404) { router.replace('/leads'); throw new Error('lead not found'); }
          return response.ok ? response.json() as Promise<LeadDetail> : Promise.reject();
        })
        .then((data) => setDetail(data))
        .catch(() => undefined);
    }
    refresh();
    const interval = window.setInterval(() => { if (!document.hidden) refresh(); }, 20000);
    const onVisible = () => { if (!document.hidden) refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { controller.abort(); window.clearInterval(interval); document.removeEventListener('visibilitychange', onVisible); };
  }, [leadId, router]);

  function showNotice(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 3000);
  }

  async function action(path: string, method: string, body?: unknown) {
    try {
      const response = await fetch(`/api/dashboard/${path}`, {
        method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
      });
      const data = await response.json().catch(() => ({})) as { detail?: string };
      if (!response.ok) {
        if (localPreview && !live) {
          showNotice('Saved in this local preview.');
          return true;
        }
        throw new Error(data.detail ?? 'The update could not be completed.');
      }
      showNotice('Saved successfully.');
      return true;
    } catch (error) {
      if (localPreview && !live) {
        showNotice('Saved in this local preview.');
        return true;
      }
      showNotice(error instanceof Error ? error.message : 'The update could not be completed.');
      return false;
    }
  }

  async function addLead(payload: LeadCreateInput) {
    try {
      const response = await fetch('/api/dashboard/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({})) as Lead & { detail?: string };
      if (!response.ok) throw new Error(data.detail ?? 'The lead could not be created.');
      const lead = data as Lead;
      setSnapshot((current) => {
        const exists = current.leads.some((item) => item.id === lead.id);
        return {
          ...current,
          leads: [lead, ...current.leads.filter((item) => item.id !== lead.id)],
          counts: exists ? current.counts : {
            ...current.counts,
            [lead.stage]: current.counts[lead.stage] + 1,
          },
        };
      });
      setDetail({ lead, events: [], messages: [], calls: [], appointments: [], history: [], message_overrides: [] });
      setAddingLead(false);
      showNotice(`${lead.full_name} was saved with ${lead.is_test ? 'the 1-minute test cadence' : 'the outreach cadence'}.`);
      return true;
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'The lead could not be created.');
      return false;
    }
  }

  function resolveLeadReview(id: string) {
    setSnapshot((current) => ({
      ...current,
      leads: current.leads.map((lead) => lead.id === id ? { ...lead, stage: 'cadence', needs_review: false, review_reason: null, next_step: 'Resume cadence' } : lead),
      counts: { ...current.counts, attention: Math.max(0, current.counts.attention - 1), cadence: current.counts.cadence + 1 },
      system: { ...current.system, review_queue: Math.max(0, (current.system.review_queue ?? 1) - 1) },
    }));
  }

  function publishTemplate(id: string, body: string) {
    setSnapshot((current) => ({
      ...current,
      templates: current.templates.map((template) => String(template.id) === id ? { ...template, body } : template),
    }));
  }

  const visibleSnapshot = useMemo(() => filterSnapshot(snapshot, selectedLocation), [snapshot, selectedLocation]);

  function searchDashboard(event: FormEvent) {
    event.preventDefault();
    const query = globalQuery.trim();
    if (query) router.push(`/leads?view=list&search=${encodeURIComponent(query)}`);
  }

  function toggleNavigation() {
    if (window.matchMedia('(max-width: 980px)').matches) setMobileMenuOpen((current) => !current);
    else setMenuOpen((current) => !current);
  }

  const activeLabel = nav.find(([href]) => href === '/' ? pathname === '/' : pathname.startsWith(href))?.[2] ?? 'Lead Workspace';
  return (
    <div className={`app-shell ${menuOpen ? '' : 'is-collapsed'} ${mobileMenuOpen ? 'mobile-menu-open' : ''}`}>
      <aside className="sidebar">
        <Link href="/" className="brand-mark" aria-label="Rausch Physical Therapy home"><span>R</span><i /></Link>
        <button className="menu-button" type="button" onClick={toggleNavigation} aria-label="Toggle navigation menu"><span /><span /><span /></button>
        <nav aria-label="Primary navigation">{nav.map(([href, icon, label]) => <Link className={(href === '/' ? pathname === '/' : pathname.startsWith(href)) ? 'active' : ''} href={href} key={href} onClick={() => setMobileMenuOpen(false)}><b>{icon}</b><span>{label}</span></Link>)}</nav>
      </aside>
      {mobileMenuOpen && <button className="nav-scrim" type="button" aria-label="Close navigation menu" onClick={() => setMobileMenuOpen(false)} />}
      <div className="workspace">
        <header className="topbar">
          <Link href="/" className="wordmark"><strong>RAUSCH</strong><small>PHYSICAL THERAPY &amp; WELLNESS</small></Link>
          <div className="product-name">{activeLabel}</div>
          <div className="top-actions">
            <label className="location-control"><span aria-hidden="true">⌖</span><select aria-label="Filter dashboard by location" value={selectedLocation} onChange={(event) => setSelectedLocation(event.target.value)}><option>All Locations</option>{locations.map((location) => <option key={location}>{location}</option>)}</select></label>
            <form className="global-search" role="search" onSubmit={searchDashboard}><span aria-hidden="true">⌕</span><input aria-label="Global search" value={globalQuery} onChange={(event) => setGlobalQuery(event.target.value)} placeholder="Search leads, tasks, or appointments" /></form>
            <span className={`connection ${live ? 'live' : ''}`}><i />{live ? 'Connected' : 'Preview'}</span><button className="avatar" type="button" title={displayName}>{initials(displayName)}</button>
          </div>
        </header>
        <main className="content">{renderPage(pathname, search.get('view'), search.get('search'), search.get('stage'), visibleSnapshot, !live, detail, router, action, () => setAddingLead(true), resolveLeadReview, publishTemplate)}</main>
      </div>
      {notice && <div className="toast" role="status">✓ {notice}</div>}
      {addingLead && <AddLeadDialog defaultLocation={selectedLocation === 'All Locations' ? locations[0] : selectedLocation} onAdd={addLead} onClose={() => setAddingLead(false)} />}
    </div>
  );
}

function renderPage(path: string, view: string | null, query: string | null, stage: string | null, snapshot: Snapshot, loading: boolean, detail: LeadDetail | null, router: ReturnType<typeof useRouter>, action: DashboardAction, openAddLead: () => void, onReviewResolved: (id: string) => void, onTemplatePublished: (id: string, body: string) => void) {
  const requestedLeadId = path.match(/^\/leads\/([0-9a-f-]+)/i)?.[1];
  // Narrowed to a non-null LeadDetail so the lead routes below typecheck; the
  // runtime behaviour is unchanged.
  const leadDetail = requestedLeadId && detail && String(detail.lead.id) === requestedLeadId ? detail : null;
  if (requestedLeadId && !leadDetail) return <Empty title="Loading lead" body="Retrieving the latest database record and cadence activity." />;
  if (path === '/') return <HomePage snapshot={snapshot} loading={loading} />;
  if (path === '/leads') return <LeadsPage key={`${view}-${query}-${stage}`} snapshot={snapshot} mode={view === 'list' ? 'list' : 'board'} initialQuery={query ?? ''} initialStage={stage as LeadStage | null} router={router} onAddLead={openAddLead} />;
  if (path === '/appointments') return <AppointmentsPage snapshot={snapshot} />;
  if (path === '/review') return <ReviewPage snapshot={snapshot} action={action} onResolved={onReviewResolved} />;
  if (path === '/analytics') return <AnalyticsPage snapshot={snapshot} />;
  if (path === '/administration') return <AdministrationPage snapshot={snapshot} />;
  if (path === '/administration/cadence') return <GlobalCadencePage snapshot={snapshot} action={action} />;
  if (path === '/administration/templates') return <TemplateStudio snapshot={snapshot} action={action} onPublished={onTemplatePublished} />;
  if (path === '/administration/providers') return <ProvidersPage snapshot={snapshot} />;
  if (/^\/leads\/[0-9a-f-]+\/conversations\/sms$/i.test(path)) return <LeadFrame detail={leadDetail!} tab="conversations" action={action}><SmsPage detail={leadDetail!} action={action} /></LeadFrame>;
  if (/^\/leads\/[0-9a-f-]+\/conversations\/calls$/i.test(path)) return <LeadFrame detail={leadDetail!} tab="conversations" action={action}><CallsPage detail={leadDetail!} /></LeadFrame>;
  if (/^\/leads\/[0-9a-f-]+\/cadence$/i.test(path)) return <LeadFrame detail={leadDetail!} tab="cadence" action={action}><LeadCadencePage detail={leadDetail!} action={action} /></LeadFrame>;
  if (/^\/leads\/[0-9a-f-]+\/appointments$/i.test(path)) return <LeadFrame detail={leadDetail!} tab="appointments" action={action}><LeadAppointmentsPage detail={leadDetail!} /></LeadFrame>;
  if (/^\/leads\/[0-9a-f-]+\/history$/i.test(path)) return <LeadFrame detail={leadDetail!} tab="history" action={action}><LeadHistoryPage detail={leadDetail!} /></LeadFrame>;
  if (/^\/leads\/[0-9a-f-]+$/i.test(path)) return <LeadFrame detail={leadDetail!} tab="overview" action={action}><LeadOverview detail={leadDetail!} /></LeadFrame>;
  return <Empty title="Page not found" body="Return to the lead pipeline to continue." />;
}

function HomePage({ snapshot, loading }: { snapshot: Snapshot; loading: boolean }) {
  // Today's Work is a to-do list, so finished leads do not belong in it.
  const work = snapshot.leads.filter((lead) => lead.stage !== 'closed' && lead.stage !== 'booked').slice(0, 5);
  return <><PageTitle title="Rausch Outreach" subtitle="Good morning. Here is today’s operational picture." />
    <StatusTiles counts={snapshot.counts} loading={loading} />
    <div className="two-col wide-left"><Panel title="Today’s Work"><DataTable heads={['Lead', 'Status', 'Next step', 'Due', 'Action']}>{work.map((lead) => <tr key={lead.id}><td><Link href={`/leads/${lead.id}`}>{lead.full_name}</Link></td><td><StatusBadge stage={lead.stage} /></td><td>{lead.next_step ?? '—'}</td><td>{time(lead.next_scheduled_for)}</td><td><Link className="text-action" href={`/leads/${lead.id}`}>Open →</Link></td></tr>)}</DataTable><div className="panel-action"><Link className="primary" href={work[0] ? `/leads/${work[0].id}` : '/leads'}>Start next task</Link></div></Panel>
      <Panel title="Provider Overview">{snapshot.providers.map((provider) => <div className="provider-row" key={String(provider.name)}><ProviderIcon name={String(provider.name)} /><div><strong>{String(provider.name)}</strong><span>{String(provider.use ?? provider.mode)}</span></div><StatusText status={String(provider.status)} /><b>{provider.balance ? String(provider.balance) : 'Not exposed'}</b></div>)}<Link className="text-action footer-link" href="/administration/providers">View provider usage →</Link></Panel></div>
    <Panel title="Next Appointments"><div className="appointment-strip">{snapshot.appointments.slice(0, 3).map((item, index) => <div key={String(item.id ?? index)}><strong>{time(String(item.start_utc ?? ''))}</strong><span>{String(item.full_name ?? 'Scheduled lead')}</span><small>{String(item.location ?? 'Rausch PT')}</small></div>)}</div></Panel></>;
}

function LeadsPage({ snapshot, mode, initialQuery, initialStage, router, onAddLead }: { snapshot: Snapshot; mode: 'board' | 'list'; initialQuery: string; initialStage: LeadStage | null; router: ReturnType<typeof useRouter>; onAddLead: () => void }) {
  const [query, setQuery] = useState(initialQuery);
  const [owner, setOwner] = useState('All Owners');
  const availableOwners = Array.from(new Set([...owners, ...snapshot.leads.map((lead) => lead.owner).filter(Boolean) as string[]]));
  const leads = snapshot.leads.filter((lead) =>
    lead.full_name.toLowerCase().includes(query.trim().toLowerCase()) &&
    (owner === 'All Owners' || (lead.owner ?? owners[0]) === owner) &&
    (!initialStage || lead.stage === initialStage)
  );
  return <><PageTitle title="Lead Pipeline" subtitle="Select a lead to open their workspace." tools={<><div className="segmented" aria-label="Lead view"><Link className={mode === 'list' ? 'selected' : ''} href="/leads?view=list"><span className="view-icon">☷</span>List</Link><Link className={mode === 'board' ? 'selected' : ''} href="/leads"><span className="view-icon">▦</span>Board</Link></div><label className="filter-control"><span className="sr-only">Filter by owner</span><select value={owner} onChange={(event) => setOwner(event.target.value)}><option>All Owners</option>{availableOwners.map((item) => <option key={item}>{item}</option>)}</select></label><label className="search-field"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search leads" /></label><button className="primary" type="button" onClick={onAddLead}>Add Lead</button></>} />
    {initialStage && <div className="active-filter">Showing {statusMeta[initialStage].label} leads <Link href="/leads">Clear filter</Link></div>}
    {!leads.length ? <Panel><Empty title="No matching leads" body="Try another owner, location, or search term." /></Panel> : mode === 'board' ? <section className="pipeline">{(['new','cadence','attention','booked','closed'] as LeadStage[]).map((stage) => <article className={`pipeline-column ${stage}`} key={stage}><header><StatusGlyph stage={stage} /><h2>{statusMeta[stage].label}</h2><small>{leads.filter((lead) => lead.stage === stage).length}</small></header><div className="lead-stack">{leads.filter((lead) => lead.stage === stage).map((lead) => <LeadCard lead={lead} key={lead.id} onOpen={() => router.push(`/leads/${lead.id}`)} />)}</div></article>)}</section> :
      <Panel><DataTable heads={['Lead', 'Status', 'Owner', 'Source', 'Next step', 'Last contact', '']} >{leads.map((lead) => <tr key={lead.id} className={`row-${lead.stage}`}><td><strong>{lead.full_name}</strong><small>{lead.display_id}</small></td><td><StatusBadge stage={lead.stage} /></td><td>{lead.owner ?? 'Unassigned'}</td><td>{lead.source}</td><td>{lead.next_step ?? 'No planned action'}</td><td>{relative(lead.last_contacted_at)}</td><td><Link className="row-link" href={`/leads/${lead.id}`} aria-label={`Open ${lead.full_name}`}>→</Link></td></tr>)}</DataTable></Panel>}</>;
}

function AppointmentsPage({ snapshot }: { snapshot: Snapshot }) {
  const [todayOnly, setTodayOnly] = useState(false);
  const lead = snapshot.leads.find((item) => item.stage !== 'booked');
  const todayAppointments = snapshot.appointments.filter((appointment) => isToday(String(appointment.start_utc ?? '')));
  const appointments = todayOnly ? todayAppointments : snapshot.appointments;
  return <><PageTitle title="Appointments" subtitle={`${appointments.length} ${todayOnly ? 'scheduled today' : 'scheduled records'} · live Stride availability with protected booking controls.`} tools={<><button className={todayOnly ? 'primary' : 'secondary'} type="button" aria-pressed={todayOnly} onClick={() => setTodayOnly((current) => !current)}>{todayOnly ? 'Show all' : 'Today'}</button>{lead ? <Link className="primary" href={`/leads/${lead.id}/appointments`}>Check availability</Link> : <button className="primary" disabled>Check availability</button>}</>} />
    <Alert tone="warning">Availability is live. New appointment writes remain gated until the Stride appointment type is verified.</Alert>
    <Panel title={todayOnly ? 'Today’s appointments' : 'Scheduled appointments'}>{appointments.length ? <div className="today-appointments">{appointments.map((appointment, index) => <article key={String(appointment.id ?? index)}><time>{date(String(appointment.start_utc ?? ''))}</time><div><strong>{String(appointment.full_name ?? 'Scheduled lead')}</strong><span>{String(appointment.type ?? 'Initial Evaluation')} · {String(appointment.location ?? 'Rausch PT')}</span></div><StatusText status={String(appointment.state ?? 'Scheduled')} /></article>)}</div> : <Empty title={todayOnly ? 'No appointments today' : 'No scheduled appointments'} body="Only appointment records returned by the database appear here." />}</Panel></>;
}

function ReviewPage({ snapshot, action, onResolved }: { snapshot: Snapshot; action: DashboardAction; onResolved: (id: string) => void }) {
  const leads = snapshot.leads.filter((lead) => lead.stage === 'attention');
  const [selectedId, setSelectedId] = useState(leads[0]?.id ?? '');
  const [resolving, setResolving] = useState(false);
  const selected = leads.find((lead) => lead.id === selectedId) ?? leads[0];
  function reviewNext() {
    if (!leads.length) return;
    const index = Math.max(0, leads.findIndex((lead) => lead.id === selected?.id));
    setSelectedId(leads[(index + 1) % leads.length].id);
  }
  async function resolveReview() {
    if (!selected || resolving) return;
    setResolving(true);
    try {
      if (await action(`review/${selected.id}/resolve`, 'POST', { resolution: 'Reviewed by dashboard operator' })) onResolved(selected.id);
    } finally { setResolving(false); }
  }
  return <><PageTitle title="Review Queue" subtitle="Resolve uncertain provider results without risking duplicate contact." tools={<button className="primary" type="button" disabled={!leads.length} onClick={reviewNext}>Review next</button>} />
    {!leads.length ? <Panel><Empty title="Review queue is clear" body="There are no unresolved provider outcomes for this location." /></Panel> : <div className="two-col review-layout"><Panel title={`${leads.length} ${leads.length === 1 ? 'item needs' : 'items need'} attention`}>{leads.map((lead) => <button className={`review-item ${selected?.id === lead.id ? 'selected' : ''}`} key={lead.id} onClick={() => setSelectedId(lead.id)}><StatusBadge stage="attention" /><strong>{lead.full_name}</strong><span>{lead.review_reason}</span><small>{relative(lead.last_contacted_at)}</small></button>)}</Panel>
      <Panel title={selected?.full_name ?? 'Review details'}>{selected && <><dl className="detail-list"><div><dt>Reason</dt><dd>{selected.review_reason}</dd></div><div><dt>Current status</dt><dd><StatusBadge stage="attention" /></dd></div><div><dt>Safe next step</dt><dd>Reconcile the provider result before any retry.</dd></div></dl><Alert tone="warning">Unknown create outcomes are never retried automatically.</Alert><button className="primary full" disabled={resolving} onClick={resolveReview}>{resolving ? 'Resolving…' : 'Resolve review'}</button></>}</Panel></div>}</>;
}

function leadMovementSeries(snapshot: Snapshot) {
  // Buckets leads by creation date over the trailing fortnight. Days with no
  // leads stay in the series as zero, so the shape of the chart is honest.
  const days = 14;
  const buckets = new Map<string, number>();
  const labels: string[] = [];
  const today = new Date();
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const day = new Date(today);
    day.setDate(today.getDate() - offset);
    const key = day.toISOString().slice(0, 10);
    labels.push(key);
    buckets.set(key, 0);
  }
  for (const lead of snapshot.leads) {
    const key = String(lead.created_at ?? '').slice(0, 10);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  const points = labels.map((key) => ({
    label: new Date(`${key}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    value: buckets.get(key) ?? 0,
  }));
  return { points, max: Math.max(...points.map((point) => point.value), 0) };
}

function AnalyticsPage({ snapshot }: { snapshot: Snapshot }) {
  const total = Object.values(snapshot.counts).reduce((sum, value) => sum + value, 0);
  // Every figure below comes from the snapshot. Where the backend has no data
  // yet it sends null, and we show a dash rather than inventing a number.
  const m = snapshot.metrics;
  const pct = (value: number | null | undefined) => (value === null || value === undefined ? '—' : `${value}%`);
  const num = (value: number | null | undefined) => (value === null || value === undefined ? '—' : value.toLocaleString());
  const movement = leadMovementSeries(snapshot);
  return <><PageTitle title="Analytics" subtitle="A concise view of pipeline movement and outreach outcomes." tools={<button className="primary" type="button" onClick={() => exportLeadReport(snapshot)}>Export report</button>} /><StatusTiles counts={snapshot.counts} />
    <div className="two-col"><Panel title="Leads created · last 14 days">{movement.max === 0 ? <Empty title="No leads yet" body="Leads created in the last fourteen days will appear here." /> : <><div className="bar-chart">{movement.points.map((point)=><i key={point.label} title={`${point.label}: ${point.value}`} style={{height:`${Math.round(point.value / movement.max * 100)}%`}}><span /></i>)}</div><div className="axis"><span>{movement.points[0]?.label}</span><span>{movement.points[movement.points.length-1]?.label}</span></div></>}</Panel><Panel title="Cadence outcomes"><Metric label="Calls reaching a person" value={pct(m?.calls_reached_rate)} width={`${m?.calls_reached_rate ?? 0}%`} /><Metric label="SMS confirmed delivered" value={pct(m?.messages_delivery_rate)} width={`${m?.messages_delivery_rate ?? 0}%`} /><Metric label="Booked" value={pct(m?.booked_rate)} width={`${m?.booked_rate ?? 0}%`} /><Metric label="Needs review" value={`${snapshot.counts.attention}`} width={`${m?.review_rate ?? 0}%`} tone="amber" /></Panel></div>
    <Panel title="Operational indicators"><div className="metric-grid"><Stat label="Total leads" value={String(total)} trend={`${snapshot.counts.closed} closed`} /><Stat label="SMS sent" value={num(m?.messages_sent)} trend={`${num(m?.messages_delivered)} confirmed delivered`} /><Stat label="SMS awaiting confirmation" value={num(m?.messages_pending)} trend={m?.messages_failed ? `${m.messages_failed} failed` : "none failed"} /><Stat label="Calls completed" value={num(m?.calls_completed)} trend={pct(m?.calls_completion_rate)} /><Stat label="Review rate" value={pct(m?.review_rate)} trend={`${snapshot.counts.attention} of ${total}`} /></div></Panel></>;
}

function AdministrationPage({ snapshot }: { snapshot: Snapshot }) {
  const cards = [
    ['/administration/cadence','CD','Global Cadence Studio','Edit the eight-step outreach sequence for future execution.'],
    ['/administration/templates','SM','SMS Template Studio','Manage global SMS copy and lead-specific overrides.'],
    ['/administration/providers','PH','Provider Usage & Health','Review Vapi, Twilio, Stride, and Keap connectivity.'],
    ['/appointments','BK','Booking Configuration','Review live availability and the fail-closed booking gate.'],
    ['/review','RV','Review & Reconciliation','Resolve unknown provider outcomes without blind retries.'],
    ['/analytics','AU','Audit & Reporting','Monitor activity, delivery, and operational results.'],
  ];
  return <><PageTitle title="Administration" subtitle="Global defaults are kept separate from patient-specific controls." /><div className="admin-grid">{cards.map(([href,icon,title,body]) => <Link className="admin-card" href={href} key={href}><b>{icon}</b><div><h2>{title}</h2><p>{body}</p></div><span>→</span></Link>)}</div><Alert>All configuration changes are server-side, authenticated, and recorded in the dashboard audit log. DNC rules cannot be bypassed.</Alert><div className="metric-grid"><Stat label="Cadence steps" value={String(snapshot.cadence.length)} /><Stat label="SMS templates" value={String(snapshot.templates.length)} /><Stat label="Review queue" value={String(snapshot.system.review_queue ?? 0)} /><Stat label="Provider queue" value={String(snapshot.system.provider_queue ?? 0)} /></div></>;
}

function GlobalCadencePage({ snapshot, action }: { snapshot: Snapshot; action: DashboardAction }) {
  return <><PageTitle title="Global Cadence Studio" subtitle="Audited outreach defaults for all new leads." /><Alert>Global edits apply to future cadence execution. Patient-specific schedules remain unchanged.</Alert>
    <div className="two-col wide-left"><Panel title="Standard v3"> <DataTable heads={['Step','Day','Action','Channel','Status','']}>{snapshot.cadence.map((item,index)=><tr key={String(item.id)}><td><span className="step-number">{index+1}</span></td><td>Day {String(item.day_offset)}</td><td><strong>{String(item.description)}</strong></td><td>{String(item.channel) === 'call' ? '☎ Vapi Call' : '● Twilio SMS'}</td><td><StatusText status={item.is_active ? 'Active' : 'Disabled'} /></td><td><button className="icon-button" onClick={() => { const description=window.prompt('Cadence step description',String(item.description)); if(description) action(`cadence-steps/${item.id}`,'PATCH',{description}); }}>Edit</button></td></tr>)}</DataTable></Panel><div className="stack"><Panel title="Version details"><dl className="detail-list"><div><dt>Status</dt><dd><StatusText status="Active" /></dd></div><div><dt>Version</dt><dd>Standard v3</dd></div><div><dt>Time zone</dt><dd>Pacific</dd></div><div><dt>Steps</dt><dd>{snapshot.cadence.length}</dd></div></dl></Panel><Panel title="Guardrails"><ul className="check-list"><li>✓ DNC enforced</li><li>✓ Call opt-out enforced</li><li>✓ Business-hour windows</li><li>✓ Audited changes</li></ul></Panel></div></div></>;
}

function TemplateStudio({ snapshot, action, onPublished }: { snapshot: Snapshot; action: DashboardAction; onPublished: (id: string, body: string) => void }) {
  const [selectedId, setSelectedId] = useState('2');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [publishing, setPublishing] = useState(false);
  const selected = snapshot.templates.find((item) => String(item.id) === selectedId) ?? snapshot.templates[0];
  const id = String(selected?.id ?? '');
  const original = String(selected?.body ?? '');
  const body = drafts[id] ?? original;
  const dirty = Object.hasOwn(drafts, id) && body !== original;
  function discard() { setDrafts((current) => { const next = { ...current }; delete next[id]; return next; }); }
  async function publish() {
    if (!selected || !dirty || publishing) return;
    setPublishing(true);
    try {
      if (await action(`message-templates/${selected.id}`,'PATCH',{body})) {
        onPublished(id, body);
        setDrafts((current) => { const next = { ...current }; delete next[id]; return next; });
      }
    } finally { setPublishing(false); }
  }
  return <><PageTitle title="SMS Template Studio" subtitle="Versioned global messages for new-lead outreach." tools={<><button className="secondary" type="button" disabled={!dirty || publishing} onClick={discard}>Discard changes</button><button className="primary" type="button" disabled={!dirty || publishing || !body.trim()} onClick={publish}>{publishing ? 'Publishing…' : 'Publish changes'}</button></>} /><Alert>Publishing updates global defaults. Patient-specific message overrides remain unchanged.</Alert>
    <div className="template-layout"><Panel title="Templates">{snapshot.templates.map((item) => <button className={`template-item ${selected?.id === item.id ? 'selected' : ''}`} key={String(item.id)} onClick={() => setSelectedId(String(item.id))}><span>●</span><strong>Day {String(item.day_offset)} SMS</strong><StatusText status="Enabled" /></button>)}</Panel><Panel title={selected ? `Day ${selected.day_offset} SMS` : 'SMS template'}><label className="field-label">Message body<textarea value={body} onChange={(event)=>setDrafts((current)=>({...current,[String(selected?.id)]:event.target.value}))} maxLength={1600} /></label><div className="editor-footer"><StatusText status={body.length ? 'Ready to publish' : 'Needs content'} /><span>{body.length} / 1600</span></div></Panel><div className="stack"><Panel title="Preview"><div className="phone-preview"><small>Template preview</small><p>{body.replace('{{first_name}}','Patient').replace('{{location}}','Preferred location')}</p></div></Panel><Panel title="Template settings"><dl className="detail-list"><div><dt>Channel</dt><dd>Twilio SMS</dd></div><div><dt>Send window</dt><dd>Business hours</dd></div><div><dt>Status</dt><dd><StatusText status="Enabled" /></dd></div></dl></Panel></div></div></>;
}

function ProvidersPage({ snapshot }: { snapshot: Snapshot }) {
  return <><PageTitle title="Provider Usage & Health" subtitle="Balances, connectivity, and operational safeguards." tools={<button className="secondary" type="button" onClick={() => window.location.reload()}>↻ Refresh</button>} /><div className="provider-grid">{snapshot.providers.map((provider)=><Panel key={String(provider.name)}><div className="provider-card"><ProviderIcon name={String(provider.name)} /><div><h2>{String(provider.name)}</h2><StatusText status={String(provider.status)} /></div></div><hr /><small>Balance</small><strong className="balance">{provider.balance ? String(provider.balance) : 'Provider API unavailable'}</strong><span>{String(provider.use ?? provider.mode)}</span></Panel>)}</div>
    <div className="two-col"><Panel title="Usage this billing period"><Metric label="Vapi voice minutes" value="342" width="36%" /><Metric label="Twilio SMS messages" value="1,248" width="76%" /><Metric label="Stride availability checks" value="186" width="44%" /><Metric label="Keap signed handoffs" value="74" width="27%" /></Panel><Panel title="System health"><dl className="health-list"><div><dt>Webhook queue</dt><dd>{snapshot.system.provider_queue}</dd><StatusText status={snapshot.system.provider_queue ? 'Needs attention':'Good'} /></div><div><dt>Worker</dt><dd>Running</dd><StatusText status="Healthy" /></div><div><dt>Review queue</dt><dd>{snapshot.system.review_queue}</dd><StatusText status={snapshot.system.review_queue ? 'Needs attention':'Good'} /></div><div><dt>Unknown events</dt><dd>{snapshot.system.unknown_events}</dd><StatusText status={snapshot.system.unknown_events ? 'Needs attention':'Good'} /></div></dl></Panel></div></>;
}

function LeadFrame({ detail, tab, action, children }: { detail: LeadDetail; tab: string; action: DashboardAction; children: ReactNode }) {
  const lead = detail.lead;
  const id = String(lead.id);
  const stage = String(lead.stage ?? 'cadence') as LeadStage;
  const phone = String(lead.phone_e164 ?? lead.phone ?? 'No phone recorded');
  const progress = Number(lead.cadence_progress ?? detail.events.filter((event) => event.status !== 'planned').length);
  const total = Number(lead.cadence_total ?? detail.events.length);
  const [busy,setBusy] = useState(false);
  const cadencePaused = lead.cadence_state === 'paused';
  const cadenceOver = stage === 'closed' || stage === 'booked';
  async function toggleCadence(){ setBusy(true); try { await action(`leads/${id}/cadence`,'POST',{action: cadencePaused ? 'resume':'pause'}); } finally {setBusy(false);} }
  return <><div className="breadcrumbs"><Link href="/leads">Lead Pipeline</Link><span>/</span><span>{String(lead.display_id)}</span><span>/</span><strong>{lead.full_name}</strong></div><section className="lead-header"><div className="lead-avatar">{initials(lead.full_name)}</div><div className="lead-identity"><h1>{lead.full_name}</h1><span>☎ {phone}</span></div><StatusBadge stage={stage} />{total > 0 && !cadenceOver && <span className="version">Standard v3 · {progress} of {total}</span>}<span className="location">⌖ {String(lead.location ?? 'Not assigned')}</span><div className="record-actions">{!cadenceOver && <button className="secondary" disabled={busy} onClick={toggleCadence}>Ⅱ {cadencePaused ? 'Resume cadence':'Pause cadence'}</button>}<Link className="primary" href={`/leads/${id}/conversations/sms`}>○ Send SMS</Link></div></section><nav className="record-tabs">{[['overview','Overview',`/leads/${id}`],['conversations','Conversations',`/leads/${id}/conversations/sms`],['cadence','Cadence',`/leads/${id}/cadence`],['appointments','Appointments',`/leads/${id}/appointments`],['history','History',`/leads/${id}/history`]].map(([key,label,href])=><Link className={tab===key?'active':''} href={href} key={key}>{label}</Link>)}</nav>{children}</>;
}

function LeadOverview({ detail }: { detail: LeadDetail }) {
  const lead=detail.lead;
  const stage = String(lead.stage ?? 'cadence') as LeadStage;
  // A finished lead has an outcome, not a pending action, and no schedule to open.
  const cadenceOver = stage === 'closed' || stage === 'booked';
  const pendingProvider = !cadenceOver && detail.events.some((event) => event.status === 'attempted' || event.status === 'in_flight');
  const nextAction = String(lead.next_step ?? (pendingProvider ? 'Awaiting provider result' : detail.events.length ? 'Cadence complete' : 'No cadence scheduled'));
  const nextCopy = cadenceOver ? 'Automated outreach has ended for this lead.' : pendingProvider ? 'A call was dispatched and is waiting for its provider result.' : lead.next_event_id ? 'Continue the scheduled outreach cadence.' : 'No planned outreach event remains.';
  return <div className="two-col wide-left"><div className="stack"><Panel title="Lead information"><dl className="info-grid"><div><dt>Lead ID</dt><dd>{String(lead.display_id)}</dd></div><div><dt>Source</dt><dd>{String(lead.source ?? lead.source_system ?? 'Unknown')}</dd></div><div><dt>Owner</dt><dd>{String(lead.owner ?? 'Unassigned')}</dd></div><div><dt>Created</dt><dd>{date(String(lead.created_at ?? ''))}</dd></div>{Boolean(lead.date_of_birth) && <div><dt>Date of birth</dt><dd>{String(lead.date_of_birth)}</dd></div>}{Boolean(lead.referred_by) && <div><dt>Referred by</dt><dd>{String(lead.referred_by)}</dd></div>}{Boolean(lead.lead_type) && <div><dt>Lead type</dt><dd>{String(lead.lead_type)}</dd></div>}<div><dt>Preferred location</dt><dd>{String(lead.location ?? 'Not assigned')}</dd></div><div><dt>Time zone</dt><dd>{String(lead.timezone ?? 'Not recorded')}</dd></div></dl></Panel><Panel title={cadenceOver ? "Outcome" : "Next action"}><div className="next-action"><span className="status-icon">☎</span><div><strong>{nextAction}</strong><p>{nextCopy}</p></div><Link className="secondary" href={`/leads/${lead.id}/cadence`}>View schedule</Link></div></Panel><Panel title="Notes"><p className="muted">No additional lead notes have been recorded.</p></Panel></div><Panel title="Recent activity"><ActivityList detail={detail} /><Link className="text-action footer-link" href={`/leads/${lead.id}/history`}>View full history →</Link></Panel></div>;
}

function SmsPage({ detail, action }: { detail: LeadDetail; action: DashboardAction }) {
  const [message,setMessage]=useState(''); const [sending,setSending]=useState(false);
  async function submit(event:FormEvent){event.preventDefault();if(!message.trim())return;setSending(true);try{await action(`leads/${detail.lead.id}/sms`,'POST',{body:message,idempotency_key:crypto.randomUUID()});setMessage('');}finally{setSending(false)}}
  return <><ConversationTabs id={String(detail.lead.id)} active="sms" /><div className="conversation-layout"><Panel title="SMS conversation"><div className="messages">{detail.messages.map((item)=><div className={`message ${item.direction}`} key={String(item.id)}><small>{item.direction === 'outbound' ? 'Rausch PT':String(detail.lead.full_name)} · {time(String(item.occurred_at))}</small><p>{String(item.body)}</p><span>{String(item.delivery_status)}</span></div>)}</div><form className="composer" onSubmit={submit}><textarea value={message} onChange={(event)=>setMessage(event.target.value)} maxLength={1600} placeholder="Write a patient-safe message…" /><div><span>{message.length}/1600</span><button className="primary" disabled={sending || !message.trim()}>{sending?'Sending…':'Send SMS'}</button></div></form></Panel><div className="stack"><Panel title="Conversation context"><dl className="detail-list"><div><dt>Status</dt><dd><StatusBadge stage={String(detail.lead.stage ?? 'cadence') as LeadStage} /></dd></div><div><dt>Next step</dt><dd>{String(detail.lead.next_step ?? 'No planned event')}</dd></div><div><dt>Consent</dt><dd><StatusText status="Contact permitted" /></dd></div><div><dt>Last activity</dt><dd>{relative(String(detail.lead.last_contacted_at ?? ''))}</dd></div></dl></Panel><Panel title="Safety"><p className="muted">This conversation belongs only to {String(detail.lead.full_name)}. DNC and SMS opt-out rules are checked again by the server before sending.</p></Panel></div></div></>;
}

function CallsPage({ detail }: { detail: LeadDetail }) {
  const [selected,setSelected]=useState(detail.calls[0]);
  const turns=String(selected?.transcript_text ?? '').split('\n').filter(Boolean);
  return <><ConversationTabs id={String(detail.lead.id)} active="calls" /><div className="call-layout"><Panel title="Call sessions">{detail.calls.map((call)=><button className={`call-session ${selected?.id===call.id?'selected':''}`} onClick={()=>setSelected(call)} key={String(call.id)}><span>☎</span><div><strong>{date(String(call.dialed_at))} · {duration(Number(call.duration_seconds))}</strong><small>{String(call.answer_state ?? 'pending').replace('_',' ')}</small></div></button>)}</Panel><Panel title="Call transcript"><div className="transcript">{turns.length ? turns.map((turn,index)=>{const [speaker,...words]=turn.split(':');return <div key={index}><b>{initials(speaker)}</b><p><strong>{speaker}</strong>{words.join(':')}</p></div>}) : <Empty title="No text transcript" body="This call did not produce transcript text." />}</div>{Boolean(selected?.summary_text) && <Alert><strong>AI call summary</strong><br />{String(selected.summary_text)}</Alert>}</Panel><Panel title="Call context"><dl className="detail-list"><div><dt>Provider result</dt><dd><StatusText status={String(selected?.ended_reason ?? selected?.answer_state ?? 'Pending')} /></dd></div><div><dt>Record</dt><dd>Provider call session</dd></div><div><dt>Duration</dt><dd>{duration(Number(selected?.duration_seconds ?? 0))}</dd></div><div><dt>Next action</dt><dd>{String(detail.lead.next_step ?? 'No planned event')}</dd></div></dl><Alert tone="success">Text transcript only. No audio recording is stored or exposed.</Alert></Panel></div></>;
}

function LeadCadencePage({ detail, action }: { detail: LeadDetail; action: DashboardAction }) {
  const currentIndex = detail.events.findIndex((event) => event.status === 'planned');
  return <div className="two-col wide-left"><Panel title={`${String(detail.lead.full_name)}’s cadence`}><p className="panel-subtitle">Live database schedule · based on Standard v3</p><div className="cadence-timeline">{detail.events.map((event,index)=>{const status=String(event.status);const completed=status==='delivered';const skipped=status==='skipped';const pending=status==='attempted'||status==='in_flight';const issue=status==='failed'||status==='unknown';const current=index===currentIndex;const statusLabel=completed?'Completed':skipped?'Not sent · outreach ended':pending?'Awaiting provider result':issue?'Needs review':current?`Due ${date(String(event.scheduled_for))}`:'Upcoming';return <div className={`${completed?'completed':''} ${skipped?'skipped':''} ${current?'current':''} ${issue?'issue':''}`} key={String(event.id)}><span>{completed?'✓':skipped?'–':index+1}</span><b>{String(event.channel)==='call'?'☎':'●'}</b><strong>Day {String(event.day_offset)} {String(event.channel).toUpperCase()}</strong><small>{statusLabel}</small>{current && <button className="icon-button" onClick={()=>{const value=window.prompt('New ISO date/time',String(event.scheduled_for));if(value)action(`leads/${detail.lead.id}/outreach-events/${event.id}`,'PATCH',{scheduled_for:value});}}>Edit</button>}</div>})}</div></Panel><div className="stack"><Panel title="Patient-specific controls"><p className="panel-subtitle">Overrides affect {String(detail.lead.full_name)} only.</p><dl className="detail-list"><div><dt>Assigned cadence</dt><dd>Standard v3</dd></div><div><dt>Time zone</dt><dd>{String(detail.lead.timezone ?? 'Not recorded')}</dd></div><div><dt>Preferred location</dt><dd>{String(detail.lead.location ?? 'Not assigned')}</dd></div><div><dt>Next send window</dt><dd>Business hours</dd></div></dl><button className="secondary full">Create local override</button></Panel><Panel title="Contact rules"><Toggle label="Do not contact" enabled={String(detail.lead.status)==='do_not_contact'} /><Toggle label="Call opt-out" enabled={Boolean(detail.lead.call_opt_out)} /><p className="muted">Do not contact blocks calls and SMS and cannot be bypassed.</p></Panel></div></div>;
}

function LeadAppointmentsPage({ detail }: { detail: LeadDetail }) {
  return <div className="two-col wide-left"><Panel title="Appointment"><div className="empty-appointment"><span>▦</span><h2>{detail.appointments.length ? 'Appointment scheduled':'No appointment booked'}</h2><p>Live availability can be reviewed before confirming with {String(detail.lead.full_name)}.</p></div><Alert tone="warning">Availability is live · booking is gated until the Stride appointment type is verified.</Alert><button className="primary">Check availability</button></Panel><div className="stack"><Panel title="Appointment preferences"><dl className="detail-list"><div><dt>Preferred location</dt><dd>{String(detail.lead.location ?? 'Not assigned')}</dd></div><div><dt>Time zone</dt><dd>{String(detail.lead.timezone ?? 'Not recorded')}</dd></div><div><dt>Appointment type</dt><dd>Initial Evaluation</dd></div></dl></Panel><Panel title="Booking history"><p className="muted">{detail.appointments.length ? `${detail.appointments.length} appointment record(s)` : 'No prior appointments'}</p></Panel></div></div>;
}

function LeadHistoryPage({ detail }: { detail: LeadDetail }) {
  const filters = [['all','All activity'],['cadence','Cadence'],['messages','Messages'],['calls','Calls'],['appointments','Appointments']] as const;
  const [filter,setFilter] = useState<(typeof filters)[number][0]>('all');
  const items = filter === 'all' ? undefined : detail.history.filter((item) => activityCategory(item) === filter);
  return <div className="two-col wide-left"><Panel title="Activity history"><div className="filter-chips">{filters.map(([key,label]) => <button className={filter === key ? 'selected' : ''} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)} key={key}>{label}</button>)}</div><ActivityList detail={detail} items={items} /><Alert>Conversation content remains in this lead’s Conversations tab.</Alert></Panel><Panel title="Record controls"><dl className="detail-list"><div><dt>Owner</dt><dd>{String(detail.lead.owner ?? 'Unassigned')}</dd></div><div><dt>Created</dt><dd>{date(String(detail.lead.created_at ?? ''))}</dd></div><div><dt>Source</dt><dd>{String(detail.lead.source ?? detail.lead.source_system ?? 'Unknown')}</dd></div><div><dt>Last updated</dt><dd>{relative(String(detail.lead.updated_at ?? ''))}</dd></div></dl></Panel></div>;
}

function ConversationTabs({ id, active }: { id:string; active:'sms'|'calls' }) { return <nav className="conversation-tabs"><Link className={active==='sms'?'active':''} href={`/leads/${id}/conversations/sms`}>● SMS</Link><Link className={active==='calls'?'active':''} href={`/leads/${id}/conversations/calls`}>▤ Call transcripts</Link></nav>; }
function LeadCard({ lead, onOpen }: { lead: Lead; onOpen:()=>void }) { const meta=statusMeta[lead.stage]; return <button className="lead-card" type="button" onClick={onOpen}><strong>{lead.full_name}</strong><span className="location">⌖ {lead.location ?? 'Not assigned'}</span><StatusBadge stage={lead.stage} />{lead.stage==='cadence'&&<span className="version">Standard v3 · {lead.cadence_progress ?? 0} of {lead.cadence_total ?? 0}</span>}<span className="next">{lead.stage === 'closed' || lead.stage === 'booked' ? 'Outcome' : 'Next'}: {lead.next_step ?? 'No planned action'}</span><span className="sr-only">{meta.label}</span></button>; }
function StatusTiles({ counts, loading = false }: { counts: Record<LeadStage,number>; loading?: boolean }) { return <section className="status-tiles" aria-busy={loading}>{(['new','cadence','attention','booked','closed'] as LeadStage[]).map((stage)=><Link className={stage} href={`/leads?stage=${stage}`} key={stage}><StatusGlyph stage={stage} size="large" /><div><small>{statusMeta[stage].label}</small><strong>{loading ? "—" : counts[stage]}</strong></div></Link>)}</section>; }
function StatusBadge({ stage }: { stage: LeadStage }) { return <span className={`status-pill ${stage}`}><StatusGlyph stage={stage} size="compact" />{statusMeta[stage].label}</span>; }
function StatusGlyph({ stage, size = 'normal' }: { stage: LeadStage; size?: 'compact' | 'normal' | 'large' }) { return <span className={`status-glyph ${stage} ${size}`} aria-hidden="true"><i /></span>; }
function StatusText({ status }: { status:string }) { const warning=/attention|gated|disabled|unknown/i.test(status); return <span className={`status-text ${warning?'warning':''}`}><i />{status}</span>; }
function ProviderIcon({ name }: { name:string }) { return <span className={`provider-icon ${name.toLowerCase()}`}>{name==='Twilio'?'●':name==='Keap'?'k':name==='Stride'?'S':'☎'}</span>; }
function PageTitle({ title, subtitle, tools }: { title:string; subtitle:string; tools?:ReactNode }) { return <header className="page-heading"><div><h1>{title}</h1><p>{subtitle}</p></div>{tools&&<div className="page-tools">{tools}</div>}</header>; }
function Panel({ title, children }: { title?:string; children:ReactNode }) { return <section className="panel">{title&&<h2>{title}</h2>}{children}</section>; }
function DataTable({ heads, children }: { heads:string[]; children:ReactNode }) { return <div className="table-scroll"><table><thead><tr>{heads.map((head,index)=><th key={`${head}-${index}`}>{head}</th>)}</tr></thead><tbody>{children}</tbody></table></div>; }
function Alert({ children, tone='info' }: { children:ReactNode; tone?:'info'|'warning'|'success' }) { return <div className={`alert ${tone}`}><b>{tone==='warning'?'!':tone==='success'?'✓':'i'}</b><div>{children}</div></div>; }
function Empty({ title, body }: { title:string; body:string }) { return <div className="empty"><span>○</span><h2>{title}</h2><p>{body}</p></div>; }
function Stat({ label,value,trend }: { label:string; value:string; trend?:string }) { return <div className="stat"><small>{label}</small><strong>{value}</strong>{trend&&<span>{trend}</span>}</div>; }
function Metric({ label,value,width,tone }: { label:string; value:string; width:string; tone?:string }) { return <div className={`metric ${tone??''}`}><div><span>{label}</span><strong>{value}</strong></div><i><b style={{width}} /></i></div>; }
function Toggle({ label,enabled }: { label:string; enabled:boolean }) { const [on,setOn]=useState(enabled); return <div className="toggle-row"><span>{label}</span><button className={on?'on':''} type="button" aria-label={`Turn ${label} ${on ? 'off' : 'on'}`} aria-pressed={on} onClick={()=>setOn(!on)}><i /></button><b>{on?'ON':'OFF'}</b></div>; }
function ActivityList({ detail, items }: { detail:LeadDetail; items?: Array<Record<string,unknown>> }) { const activity=items ?? (detail.history.length?detail.history:[{to_status:'created',reason:'Lead created',source:'System',changed_at:detail.lead.created_at}]); return activity.length ? <div className="activity-list">{activity.map((item,index)=><div key={index}><time>{date(String(item.changed_at))}</time><span>{index===0?'▦':index===1?'☎':index===2?'●':'○'}</span><p><strong>{humanize(String(item.to_status))}</strong><small>{String(item.reason ?? 'Status updated')}</small></p><b>{String(item.source ?? 'System')}</b></div>)}</div> : <Empty title="No matching activity" body="This lead has no activity in the selected category." />; }
function activityCategory(item: Record<string,unknown>) { const value=`${item.to_status ?? ''} ${item.reason ?? ''} ${item.source ?? ''}`.toLowerCase(); if(/appointment|booked|stride/.test(value))return'appointments';if(/sms|message|twilio/.test(value))return'messages';if(/call|callback|vapi/.test(value))return'calls';return'cadence'; }
function initials(name:string){return name.split(/\s+/).map((part)=>part[0]).join('').slice(0,2).toUpperCase();}
function humanize(value:string){return value.replaceAll('_',' ').replace(/\b\w/g,(letter)=>letter.toUpperCase());}
function time(value:string|null|undefined){if(!value)return'—';const parsed=new Date(value);return Number.isNaN(parsed.valueOf())?'—':parsed.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});}
function date(value:string){const parsed=new Date(value);return Number.isNaN(parsed.valueOf())?'—':parsed.toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});}
function relative(value:string|null|undefined){return value?date(value):'Not contacted';}
function duration(seconds:number){return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;}
function isToday(value:string){const parsed=new Date(value);return !Number.isNaN(parsed.valueOf())&&parsed.toDateString()===new Date().toDateString();}

function exportLeadReport(snapshot: Snapshot) {
  const rows = [['Lead', 'Status', 'Owner', 'Location', 'Source'], ...snapshot.leads.map((lead) => [lead.full_name, statusMeta[lead.stage].label, lead.owner ?? owners[0], lead.location ?? '', lead.source])];
  const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"','""')}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'rausch-lead-report.csv';
  link.click();
  URL.revokeObjectURL(url);
}

function filterSnapshot(snapshot: Snapshot, location: string): Snapshot {
  if (location === 'All Locations') return snapshot;
  const leads = snapshot.leads.filter((lead) => lead.location === location);
  const counts = { new: 0, cadence: 0, attention: 0, booked: 0, closed: 0 } satisfies Record<LeadStage, number>;
  leads.forEach((lead) => { counts[lead.stage] += 1; });
  return {
    ...snapshot,
    leads,
    counts,
    appointments: snapshot.appointments.filter((appointment) => String(appointment.location ?? '') === location),
    system: { ...snapshot.system, review_queue: counts.attention },
  };
}

function AddLeadDialog({ defaultLocation, onAdd, onClose }: { defaultLocation: string; onAdd: (lead: LeadCreateInput) => Promise<boolean>; onClose: () => void }) {
  const [saving, setSaving] = useState(false);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) { if (event.key === 'Escape') onClose(); }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const firstName = String(data.get('first_name') ?? '').trim();
    const lastName = String(data.get('last_name') ?? '').trim();
    const contactConsent = data.get('contact_consent') === 'on';
    if (!firstName || !lastName || !contactConsent || saving) return;
    setSaving(true);
    await onAdd({
      idempotency_key: idempotencyKey,
      first_name: firstName,
      last_name: lastName,
      phone: String(data.get('phone') ?? '').trim(),
      email: String(data.get('email') ?? '').trim() || null,
      date_of_birth: String(data.get('date_of_birth') ?? ''),
      referred_by: String(data.get('referred_by') ?? '').trim() || null,
      lead_type: String(data.get('lead_type') ?? 'Physical Therapy') as LeadCreateInput['lead_type'],
      location: String(data.get('location') ?? defaultLocation),
      owner: String(data.get('owner') ?? owners[0]),
      contact_consent: true,
    });
    setSaving(false);
  }
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="add-lead-title"><header><div><h2 id="add-lead-title">Add lead</h2><p>Save a lead and schedule their outreach cadence.</p></div><button className="close-button" type="button" onClick={onClose} aria-label="Close add lead dialog">×</button></header><form onSubmit={submit}><div className="form-grid"><label>First name<input name="first_name" autoComplete="given-name" autoFocus required /></label><label>Last name<input name="last_name" autoComplete="family-name" required /></label><label>Phone<input name="phone" type="tel" autoComplete="tel" placeholder="(949) 555-0123" required /></label><label>Email<input name="email" type="email" autoComplete="email" placeholder="name@example.com" /></label><label>Date of birth<input name="date_of_birth" type="date" autoComplete="bday" required /></label><label>Who referred this lead?<input name="referred_by" placeholder="Name or organization" /></label><label className="form-field-full">Lead type<select name="lead_type" defaultValue="Physical Therapy" required><option>Physical Therapy</option><option>Wellness</option></select></label><label>Location<select name="location" defaultValue={defaultLocation}>{locations.map((location) => <option key={location}>{location}</option>)}</select></label><label>Owner<select name="owner" defaultValue={owners[0]}>{owners.map((owner) => <option key={owner}>{owner}</option>)}</select></label><label className="consent-field form-field-full"><input name="contact_consent" type="checkbox" required /><span>I confirm this lead has consented to outreach by phone and SMS.</span></label></div><footer><button className="secondary" type="button" onClick={onClose} disabled={saving}>Cancel</button><button className="primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Add lead'}</button></footer></form></section></div>;
}
