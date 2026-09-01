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
  ['/', 'home', 'Home'], ['/leads', 'leads', 'Leads'], ['/appointments', 'appointments', 'Appointments'],
  ['/review', 'review', 'Review Queue'], ['/analytics', 'analytics', 'Analytics'],
  ['/administration', 'administration', 'Administration'],
] as const;

// Inline so there is no icon dependency and both themes inherit currentColor.
const NAV_ICONS: Record<string, ReactNode> = {
  home: <path d="M3 10.2 12 3l9 7.2V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  leads: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20a6 6 0 0 1 12 0" /><path d="M16 11.2a3 3 0 0 0 0-6" /><path d="M17.5 20a5.5 5.5 0 0 0-2.2-4.4" /></>,
  appointments: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /><path d="m9.5 15 1.8 1.8 3.5-3.6" /></>,
  review: <><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.2M12 16.3v.2" /></>,
  analytics: <><path d="M4 20V4" /><path d="M4 20h16" /><rect x="7.5" y="12" width="3" height="5" rx="1" /><rect x="13" y="8" width="3" height="9" rx="1" /></>,
  administration: <><circle cx="12" cy="12" r="3" /><path d="M12 2.8v2.6M12 18.6v2.6M21.2 12h-2.6M5.4 12H2.8M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8M18.5 18.5l-1.8-1.8M7.3 7.3 5.5 5.5" /></>,
};

function PauseIcon() {
  return <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
    <rect x="6" y="4.5" width="4" height="15" rx="1.2" /><rect x="14" y="4.5" width="4" height="15" rx="1.2" />
  </svg>;
}
function PlayIcon() {
  return <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
    <path d="M7.5 4.8v14.4a1 1 0 0 0 1.53.85l11.2-7.2a1 1 0 0 0 0-1.7L9.03 3.95A1 1 0 0 0 7.5 4.8z" />
  </svg>;
}

function toUsE164(raw: string): string | null {
  // US-only client: staff type ten digits. Accept a pasted +1, a leading 1, and
  // any punctuation, but never silently truncate a genuine foreign number.
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+') && !trimmed.startsWith('+1')) return null;
  const local = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  return local.length === 10 ? `+1${local}` : null;
}

function NavIcon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
         strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {NAV_ICONS[name]}
    </svg>
  );
}

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
  const [reloadKey, setReloadKey] = useState(0);
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
  }, [reloadKey]);

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
  }, [leadId, router, reloadKey]);

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
      setReloadKey((value) => value + 1);
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
        <Link href="/" className="brand-mark" aria-label="Rausch Physical Therapy home"><span>R</span></Link>
        <button className="menu-button" type="button" onClick={toggleNavigation} aria-label="Toggle navigation menu"><span /><span /><span /></button>
        <nav aria-label="Primary navigation">{nav.map(([href, icon, label]) => <Link className={(href === '/' ? pathname === '/' : pathname.startsWith(href)) ? 'active' : ''} href={href} key={href} onClick={() => setMobileMenuOpen(false)}><b><NavIcon name={icon} /></b><span>{label}</span></Link>)}</nav>
      </aside>
      {mobileMenuOpen && <button className="nav-scrim" type="button" aria-label="Close navigation menu" onClick={() => setMobileMenuOpen(false)} />}
      <div className="workspace">
        <header className="topbar">
          <Link href="/" className="wordmark"><strong>OUTREACH</strong><small>OPERATIONS CRM</small></Link>
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
  if (requestedLeadId && !leadDetail) return <SkeletonLeadDetail />;
  if (path === '/') return <HomePage snapshot={snapshot} loading={loading} />;
  if (path === '/leads' && loading && !snapshot.leads.length) return <><PageTitle title="Lead Pipeline" subtitle="Loading the latest pipeline…" /><SkeletonBoard /></>;
  if (path === '/leads') return <LeadsPage key={`${view}-${query}-${stage}`} snapshot={snapshot} mode={view === 'list' ? 'list' : 'board'} initialQuery={query ?? ''} initialStage={stage as LeadStage | null} router={router} onAddLead={openAddLead} action={action} />;
  if (path === '/appointments') return <AppointmentsPage snapshot={snapshot} loading={loading} />;
  if (path === '/review') return <ReviewPage snapshot={snapshot} action={action} onResolved={onReviewResolved} loading={loading} />;
  if (path === '/analytics') return <AnalyticsPage snapshot={snapshot} />;
  if (path === '/administration') return <AdministrationPage snapshot={snapshot} />;
  if (path === '/administration/cadence') return <GlobalCadencePage snapshot={snapshot} action={action} />;
  if (path === '/administration/templates') return <TemplateStudio snapshot={snapshot} action={action} onPublished={onTemplatePublished} />;
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
  return <><PageTitle title="Outreach Operations" subtitle="Good morning. Here is today’s operational picture." />
    {loading && !snapshot.leads.length ? <SkeletonTiles /> : <StatusTiles counts={snapshot.counts} loading={loading} />}
    <div className="home-work"><Panel title="Today’s Work"><DataTable heads={['Lead', 'Status', 'Next step', 'Due', 'Action']}>{work.map((lead) => <tr key={lead.id}><td><Link href={`/leads/${lead.id}`}>{lead.full_name}</Link></td><td><StatusBadge stage={lead.stage} paused={lead.cadence_state === 'paused'} /></td><td>{lead.next_step ?? '—'}</td><td>{time(lead.next_scheduled_for)}</td><td><Link className="text-action" href={`/leads/${lead.id}`}>Open →</Link></td></tr>)}</DataTable><div className="panel-action"><Link className="primary" href={work[0] ? `/leads/${work[0].id}` : '/leads'}>Start next task</Link></div></Panel>
    </div>
    <Panel title="Next Appointments"><div className="appointment-strip">{snapshot.appointments.slice(0, 3).map((item, index) => <div key={String(item.id ?? index)}><strong>{time(String(item.start_utc ?? ''))}</strong><span>{String(item.full_name ?? 'Scheduled lead')}</span><small>{String(item.location ?? 'Practice')}</small></div>)}</div></Panel></>;
}

function Skeleton({ w = '100%', h = 14 }: { w?: string; h?: number }) {
  return <span className="skeleton" style={{ width: w, height: h }} aria-hidden="true" />;
}

function SkeletonBoard() {
  // Mirrors the real board so the layout does not jump when data lands.
  return <section className="pipeline" aria-busy="true" aria-label="Loading leads">
    {(['new','cadence','attention','booked','closed'] as LeadStage[]).map((stage,column)=>
      <article className={`pipeline-column ${stage}`} key={stage}>
        <header><StatusGlyph stage={stage} /><h2>{statusMeta[stage].label}</h2><small>–</small></header>
        <div className="lead-stack">{Array.from({length: column===1?3:1}).map((_,row)=>
          <div className="lead-card skeleton-card" key={row}>
            <Skeleton w="62%" h={17} /><Skeleton w="45%" /><Skeleton w="52%" h={24} /><Skeleton w="80%" />
          </div>)}</div>
      </article>)}
  </section>;
}

function SkeletonTiles() {
  return <section className="status-tiles" aria-busy="true">{Array.from({length:5}).map((_,index)=>
    <div className="skeleton-tile" key={index}><span className="skeleton skeleton-circle" /><div><Skeleton w="72px" /><Skeleton w="40px" h={26} /></div></div>)}</section>;
}

function MessageBody({ body }: { body: string }) {
  // The stored body carries real newlines and a booking URL. Rendering it as
  // plain text collapsed the layout and left the link unclickable, so URLs are
  // split out here and the whitespace is preserved by CSS.
  const parts = body.split(/(https?:\/\/[^\s]+)/g);
  return <p className="message-body">{parts.map((part, index) =>
    /^https?:\/\//.test(part)
      ? <a key={index} href={part} target="_blank" rel="noopener noreferrer">{part}</a>
      : <span key={index}>{part}</span>
  )}</p>;
}

function SkeletonLeadDetail() {
  // Mirrors LeadFrame: breadcrumb, header, tabs, then the two-column body, so
  // the page does not reflow when the record arrives.
  return <div aria-busy="true" aria-label="Loading lead">
    <div className="breadcrumbs"><Skeleton w="96px" /><Skeleton w="88px" /><Skeleton w="120px" /></div>
    <section className="lead-header">
      <span className="skeleton skeleton-avatar" />
      <div className="lead-identity"><Skeleton w="180px" h={26} /><Skeleton w="140px" /></div>
      <Skeleton w="104px" h={30} /><Skeleton w="126px" h={30} />
      <div className="record-actions"><Skeleton w="132px" h={40} /><Skeleton w="112px" h={40} /></div>
    </section>
    <nav className="record-tabs">{['Overview','Conversations','Cadence','Appointments','History'].map((tab)=>
      <span key={tab}><Skeleton w={`${tab.length * 8 + 12}px`} /></span>)}</nav>
    <div className="two-col wide-left">
      <div className="stack">
        <Panel title="Lead information"><SkeletonRows rows={3} /></Panel>
        <Panel title="Next action"><SkeletonRows rows={1} /></Panel>
      </div>
      <Panel title="Recent activity"><SkeletonRows rows={3} /></Panel>
    </div>
  </div>;
}

function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return <div className="skeleton-rows" aria-busy="true">{Array.from({length: rows}).map((_,index)=>
    <div className="skeleton-row" key={index}>
      <Skeleton w="104px" h={26} />
      <div className="skeleton-row-text"><Skeleton w="38%" h={15} /><Skeleton w="58%" /></div>
      <Skeleton w="88px" />
    </div>)}</div>;
}

function LeadsPage({ snapshot, mode, initialQuery, initialStage, router, onAddLead, action }: { snapshot: Snapshot; mode: 'board' | 'list'; initialQuery: string; initialStage: LeadStage | null; router: ReturnType<typeof useRouter>; onAddLead: () => void; action: DashboardAction }) {
  const [query, setQuery] = useState(initialQuery);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<LeadStage | null>(null);
  const [moving, setMoving] = useState(false);

  async function drop(stage: LeadStage) {
    const id = dragging;
    setOver(null);
    setDragging(null);
    if (!id || moving) return;
    const lead = snapshot.leads.find((item) => item.id === id);
    if (!lead || lead.stage === stage) return;
    // Restarting contacts a real patient from day zero, so it is confirmed first.
    if (stage === 'new' && !window.confirm(
      `Restart outreach for ${lead.full_name}?

The remaining schedule is discarded and a new cadence begins from today. They will be called and texted again from the first step.`
    )) return;
    setMoving(true);
    try { await action(`leads/${id}/stage`, 'POST', { stage }); } finally { setMoving(false); }
  }
  const [owner, setOwner] = useState('All Owners');
  const availableOwners = Array.from(new Set([...owners, ...snapshot.leads.map((lead) => lead.owner).filter(Boolean) as string[]]));
  const leads = snapshot.leads.filter((lead) =>
    lead.full_name.toLowerCase().includes(query.trim().toLowerCase()) &&
    (owner === 'All Owners' || (lead.owner ?? owners[0]) === owner) &&
    (!initialStage || lead.stage === initialStage)
  );
  return <><PageTitle title="Lead Pipeline" subtitle="Select a lead to open their workspace." tools={<><div className="segmented" aria-label="Lead view"><Link className={mode === 'list' ? 'selected' : ''} href="/leads?view=list"><span className="view-icon">☷</span>List</Link><Link className={mode === 'board' ? 'selected' : ''} href="/leads"><span className="view-icon">▦</span>Board</Link></div><label className="filter-control"><span className="sr-only">Filter by owner</span><select value={owner} onChange={(event) => setOwner(event.target.value)}><option>All Owners</option>{availableOwners.map((item) => <option key={item}>{item}</option>)}</select></label><label className="search-field"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search leads" /></label><button className="primary" type="button" onClick={onAddLead}>Add Lead</button></>} />
    {initialStage && <div className="active-filter">Showing {statusMeta[initialStage].label} leads <Link href="/leads">Clear filter</Link></div>}
    {!leads.length ? <Panel><Empty title="No matching leads" body="Try another owner, location, or search term." /></Panel> : mode === 'board' ? <section className="pipeline">{(['new','cadence','attention','booked','closed'] as LeadStage[]).map((stage) => <article className={`pipeline-column ${stage} ${over === stage ? 'drop-target' : ''}`} key={stage} onDragOver={(event) => { event.preventDefault(); setOver(stage); }} onDragLeave={() => setOver((current) => current === stage ? null : current)} onDrop={(event) => { event.preventDefault(); void drop(stage); }}><header><StatusGlyph stage={stage} /><h2>{statusMeta[stage].label}</h2><small>{leads.filter((lead) => lead.stage === stage).length}</small></header><div className="lead-stack">{leads.filter((lead) => lead.stage === stage).map((lead) => <LeadCard lead={lead} key={lead.id} onOpen={() => router.push(`/leads/${lead.id}`)} dragging={dragging === lead.id} onDragStart={() => setDragging(lead.id)} onDragEnd={() => { setDragging(null); setOver(null); }} />)}{over === stage && dragging && <p className="drop-hint">{stage === 'new' ? 'Drop to restart outreach from day zero' : `Move to ${statusMeta[stage].label}`}</p>}</div></article>)}</section> :
      <Panel><DataTable heads={['Lead', 'Status', 'Owner', 'Source', 'Next step', 'Last contact', '']} >{leads.map((lead) => <tr key={lead.id} className={`row-${lead.stage}`}><td><strong>{lead.full_name}</strong><small>{lead.display_id}</small></td><td><StatusBadge stage={lead.stage} paused={lead.cadence_state === 'paused'} /></td><td>{lead.owner ?? 'Unassigned'}</td><td>{lead.source}</td><td>{lead.next_step ?? 'No planned action'}</td><td>{relative(lead.last_contacted_at)}</td><td><Link className="row-link" href={`/leads/${lead.id}`} aria-label={`Open ${lead.full_name}`}>→</Link></td></tr>)}</DataTable></Panel>}</>;
}

function AppointmentsPage({ snapshot, loading }: { snapshot: Snapshot; loading: boolean }) {
  const [todayOnly, setTodayOnly] = useState(false);
  const lead = snapshot.leads.find((item) => item.stage !== 'booked');
  const todayAppointments = snapshot.appointments.filter((appointment) => isToday(String(appointment.start_utc ?? '')));
  const appointments = todayOnly ? todayAppointments : snapshot.appointments;
  return <><PageTitle title="Appointments" subtitle={`${appointments.length} ${todayOnly ? 'scheduled today' : 'scheduled records'} · live Stride availability with protected booking controls.`} tools={<><button className={todayOnly ? 'primary' : 'secondary'} type="button" aria-pressed={todayOnly} onClick={() => setTodayOnly((current) => !current)}>{todayOnly ? 'Show all' : 'Today'}</button>{lead ? <Link className="primary" href={`/leads/${lead.id}/appointments`}>Check availability</Link> : <button className="primary" disabled>Check availability</button>}</>} />
    <Alert tone="warning">Availability is live. New appointment writes remain gated until the Stride appointment type is verified.</Alert>
    <Panel title={todayOnly ? 'Today’s appointments' : 'Scheduled appointments'}>{appointments.length ? <div className="today-appointments">{appointments.map((appointment, index) => <article key={String(appointment.id ?? index)}><time>{date(String(appointment.start_utc ?? ''))}</time><div><strong>{String(appointment.full_name ?? 'Scheduled lead')}</strong><span>{String(appointment.type ?? 'Initial Evaluation')} · {String(appointment.location ?? 'Practice')}</span></div><StatusText status={String(appointment.state ?? 'Scheduled')} /></article>)}</div> : loading ? <SkeletonRows rows={3} /> : <Empty title={todayOnly ? 'No appointments today' : 'No scheduled appointments'} body="Only appointment records returned by the database appear here." />}</Panel></>;
}

function ReviewPage({ snapshot, action, onResolved, loading }: { snapshot: Snapshot; action: DashboardAction; onResolved: (id: string) => void; loading: boolean }) {
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
    {loading && !snapshot.leads.length ? <Panel title="Loading review queue"><SkeletonRows rows={4} /></Panel> : !leads.length ? <Panel><Empty title="Review queue is clear" body="There are no unresolved provider outcomes for this location." /></Panel> : <div className="two-col review-layout"><Panel title={`${leads.length} ${leads.length === 1 ? 'item needs' : 'items need'} attention`}>{leads.map((lead) => <button className={`review-item ${selected?.id === lead.id ? 'selected' : ''}`} key={lead.id} onClick={() => setSelectedId(lead.id)}><StatusBadge stage="attention" /><strong>{lead.full_name}</strong><span>{lead.review_reason}</span><small>{relative(lead.last_contacted_at)}</small></button>)}</Panel>
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
    const key = clinicDateKey(day);
    labels.push(key);
    buckets.set(key, 0);
  }
  for (const lead of snapshot.leads) {
    const key = clinicDateKey(String(lead.created_at ?? ''));
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  const points = labels.map((key) => ({
    label: new Date(`${key}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: CLINIC_TZ }),
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

function LeadFrame({ detail, tab, action, children }: { detail: LeadDetail; tab: string; action: DashboardAction; children: ReactNode }) {
  const lead = detail.lead;
  const id = String(lead.id);
  const stage = String(lead.stage ?? 'cadence') as LeadStage;
  const phone = String(lead.phone_e164 ?? lead.phone ?? 'No phone recorded');
  // Count only the current cadence run: a restarted lead keeps its earlier
  // events, and including them read as "12 of 16" on an eight-step cadence.
  const currentRun = splitCadenceRuns(detail.events).at(-1) ?? [];
  const progress = currentRun.filter((event) => event.status !== 'planned').length;
  const total = currentRun.length;
  const [busy,setBusy] = useState(false);
  const cadencePaused = lead.cadence_state === 'paused';
  const cadenceOver = stage === 'closed' || stage === 'booked';
  async function toggleCadence(){ setBusy(true); try { await action(`leads/${id}/cadence`,'POST',{action: cadencePaused ? 'resume':'pause'}); } finally {setBusy(false);} }
  return <><div className="breadcrumbs"><Link href="/leads">Lead Pipeline</Link><span>/</span><span>{String(lead.display_id)}</span><span>/</span><strong>{lead.full_name}</strong></div><section className="lead-header"><div className="lead-avatar">{initials(lead.full_name)}</div><div className="lead-identity"><h1>{lead.full_name}</h1><span>☎ {phone}</span></div><StatusBadge stage={stage} paused={cadencePaused} />{total > 0 && !cadenceOver && <span className="version">Standard v3 · {progress} of {total}</span>}<span className="location">⌖ {String(lead.location ?? 'Not assigned')}</span><div className="record-actions">{!cadenceOver && <button className="secondary icon-label" disabled={busy} onClick={toggleCadence} title={cadencePaused ? 'Resume cadence' : 'Pause cadence'}>{cadencePaused ? <PlayIcon /> : <PauseIcon />}{cadencePaused ? 'Resume cadence':'Pause cadence'}</button>}<Link className="primary" href={`/leads/${id}/conversations/sms`}>○ Send SMS</Link></div></section><nav className="record-tabs">{[['overview','Overview',`/leads/${id}`],['conversations','Conversations',`/leads/${id}/conversations/sms`],['cadence','Cadence',`/leads/${id}/cadence`],['appointments','Appointments',`/leads/${id}/appointments`],['history','History',`/leads/${id}/history`]].map(([key,label,href])=><Link className={tab===key?'active':''} href={href} key={key}>{label}</Link>)}</nav>{children}</>;
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
  return <><ConversationTabs id={String(detail.lead.id)} active="sms" /><div className="conversation-layout"><Panel title="SMS conversation"><div className="messages">{detail.messages.map((item)=><div className={`message ${item.direction}`} key={String(item.id)}><small>{item.direction === 'outbound' ? 'Practice Team':String(detail.lead.full_name)} · {time(String(item.occurred_at))}</small><MessageBody body={String(item.body)} /><span>{String(item.delivery_status)}</span></div>)}</div><form className="composer" onSubmit={submit}><textarea value={message} onChange={(event)=>setMessage(event.target.value)} maxLength={1600} placeholder="Write a patient-safe message…" /><div><span>{message.length}/1600</span><button className="primary" disabled={sending || !message.trim()}>{sending?'Sending…':'Send SMS'}</button></div></form></Panel><div className="stack"><Panel title="Conversation context"><dl className="detail-list"><div><dt>Status</dt><dd><StatusBadge stage={String(detail.lead.stage ?? 'cadence') as LeadStage} paused={detail.lead.cadence_state === 'paused'} /></dd></div><div><dt>Next step</dt><dd>{String(detail.lead.next_step ?? 'No planned event')}</dd></div><div><dt>Consent</dt><dd><StatusText status="Contact permitted" /></dd></div><div><dt>Last activity</dt><dd>{relative(String(detail.lead.last_contacted_at ?? ''))}</dd></div></dl></Panel><Panel title="Safety"><p className="muted">This conversation belongs only to {String(detail.lead.full_name)}. DNC and SMS opt-out rules are checked again by the server before sending.</p></Panel></div></div></>;
}

function CallsPage({ detail }: { detail: LeadDetail }) {
  const [selected,setSelected]=useState(detail.calls[0]);
  const turns=String(selected?.transcript_text ?? '').split('\n').filter(Boolean);
  return <><ConversationTabs id={String(detail.lead.id)} active="calls" /><div className="call-layout"><Panel title="Call sessions">{detail.calls.map((call)=><button className={`call-session ${selected?.id===call.id?'selected':''}`} onClick={()=>setSelected(call)} key={String(call.id)}><span>☎</span><div><strong>{date(String(call.dialed_at))} · {duration(Number(call.duration_seconds))}</strong><small>{String(call.answer_state ?? 'pending').replace('_',' ')}</small></div></button>)}</Panel><Panel title="Call transcript"><div className="transcript">{turns.length ? turns.map((turn,index)=>{const [speaker,...words]=turn.split(':');return <div key={index}><b>{initials(speaker)}</b><p><strong>{speaker}</strong>{words.join(':')}</p></div>}) : <Empty title="No text transcript" body="This call did not produce transcript text." />}</div>{Boolean(selected?.summary_text) && <Alert><strong>AI call summary</strong><br />{String(selected.summary_text)}</Alert>}</Panel><Panel title="Call context"><dl className="detail-list"><div><dt>Provider result</dt><dd><StatusText status={String(selected?.ended_reason ?? selected?.answer_state ?? 'Pending')} /></dd></div><div><dt>Record</dt><dd>Provider call session</dd></div><div><dt>Duration</dt><dd>{duration(Number(selected?.duration_seconds ?? 0))}</dd></div><div><dt>Next action</dt><dd>{String(detail.lead.next_step ?? 'No planned event')}</dd></div></dl><Alert tone="success">Text transcript only. No audio recording is stored or exposed.</Alert></Panel></div></>;
}

function splitCadenceRuns(events: Array<Record<string, unknown>>) {
  // A restart builds a fresh set of events in one go, so everything created in
  // the same instant belongs to the same run. Grouping on that is exact.
  //
  // The earlier approach watched for the day offset going backwards, which broke
  // as soon as two runs overlapped in time: sorted by schedule the days read
  // 0,0,0,0,1,1,3,3... and never stepped back, so both runs rendered as one list.
  const batches = new Map<string, Array<Record<string, unknown>>>();
  const order: string[] = [];
  for (const event of events) {
    const key = String(event.created_at ?? '');
    if (!batches.has(key)) { batches.set(key, []); order.push(key); }
    batches.get(key)!.push(event);
  }

  const runs: Array<Array<Record<string, unknown>>> = [];
  for (const key of order) {
    const batch = batches.get(key)!;
    // A callback is added on its own, outside any run. It belongs to whichever
    // run it interrupted, not to a run of its own.
    const isStandalone = batch.every((event) => event.cadence_step_id === null || event.cadence_step_id === undefined);
    if (isStandalone && runs.length) runs[runs.length - 1].push(...batch);
    else runs.push(batch);
  }
  if (!runs.length) return [];

  // Within a run, keep the order the schedule actually runs in.
  for (const run of runs) {
    run.sort((a, b) => String(a.scheduled_for ?? '').localeCompare(String(b.scheduled_for ?? '')));
  }
  // Oldest run first, so the newest is last and reads as "current".
  runs.sort((a, b) => String(a[0].created_at ?? '').localeCompare(String(b[0].created_at ?? '')));
  return runs;
}

function LeadCadencePage({ detail, action }: { detail: LeadDetail; action: DashboardAction }) {
  const runs = splitCadenceRuns(detail.events);
  const activeRun = runs[runs.length - 1] ?? [];
  const earlierRuns = runs.slice(0, -1);
  const [showEarlier, setShowEarlier] = useState(false);
  const currentIndex = activeRun.findIndex((event) => event.status === 'planned');
  return <div className="two-col wide-left"><Panel title={`${String(detail.lead.full_name)}’s cadence`}><p className="panel-subtitle">{runs.length > 1 ? `Current outreach · restart ${runs.length} of ${runs.length}` : 'Live database schedule · based on Standard v3'}</p>{earlierRuns.length > 0 && <div className="run-notice"><span>{earlierRuns.reduce((sum,run)=>sum+run.length,0)} step(s) from earlier outreach are kept for the record.</span><button className="text-action" type="button" onClick={()=>setShowEarlier((value)=>!value)}>{showEarlier ? 'Hide earlier outreach' : 'Show earlier outreach'}</button></div>}{showEarlier && earlierRuns.map((run,runIndex)=><div className="cadence-timeline earlier" key={`run-${runIndex}`}><p className="run-label">Earlier outreach {runIndex + 1}</p>{run.map((event)=><div className="completed" key={String(event.id)}><span>✓</span><b>{String(event.channel)==='call'?'☎':'●'}</b><strong>{event.day_offset === null || event.day_offset === undefined ? 'Callback requested' : `Day ${String(event.day_offset)} ${String(event.channel).toUpperCase()}`}</strong><small>{String(event.status)==='skipped'?'Not sent':'Completed'}</small></div>)}</div>)}<div className="cadence-timeline">{activeRun.map((event,index)=>{const status=String(event.status);const completed=status==='delivered';const skipped=status==='skipped';const pending=status==='attempted'||status==='in_flight';const issue=status==='failed'||status==='unknown';const current=index===currentIndex;const statusLabel=completed?'Completed':skipped?'Not sent · outreach ended':pending?'Awaiting provider result':issue?'Needs review':current?`Due ${date(String(event.scheduled_for))}`:'Upcoming';return <div className={`${completed?'completed':''} ${skipped?'skipped':''} ${current?'current':''} ${issue?'issue':''}`} key={String(event.id)}><span>{completed?'✓':skipped?'–':index+1}</span><b>{String(event.channel)==='call'?'☎':'●'}</b><strong>{event.day_offset === null || event.day_offset === undefined ? 'Callback requested' : `Day ${String(event.day_offset)} ${String(event.channel).toUpperCase()}`}</strong><small>{statusLabel}</small>{current && <button className="icon-button" onClick={()=>{const value=window.prompt('New ISO date/time',String(event.scheduled_for));if(value)action(`leads/${detail.lead.id}/outreach-events/${event.id}`,'PATCH',{scheduled_for:value});}}>Edit</button>}</div>})}</div></Panel><div className="stack"><Panel title="Patient-specific controls"><p className="panel-subtitle">Overrides affect {String(detail.lead.full_name)} only.</p><dl className="detail-list"><div><dt>Assigned cadence</dt><dd>Standard v3</dd></div><div><dt>Time zone</dt><dd>{String(detail.lead.timezone ?? 'Not recorded')}</dd></div><div><dt>Preferred location</dt><dd>{String(detail.lead.location ?? 'Not assigned')}</dd></div><div><dt>Next send window</dt><dd>Business hours</dd></div></dl><button className="secondary full">Create local override</button></Panel><Panel title="Contact rules"><Toggle label="Do not contact" enabled={String(detail.lead.status)==='do_not_contact'} /><Toggle label="Call opt-out" enabled={Boolean(detail.lead.call_opt_out)} /><p className="muted">Do not contact blocks calls and SMS and cannot be bypassed.</p></Panel></div></div>;
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
function LeadCard({ lead, onOpen, dragging = false, onDragStart, onDragEnd }: { lead: Lead; onOpen:()=>void; dragging?: boolean; onDragStart?: ()=>void; onDragEnd?: ()=>void }) { const meta=statusMeta[lead.stage]; return <button className={`lead-card ${dragging ? 'is-dragging' : ''}`} type="button" draggable={Boolean(onDragStart)} onDragStart={onDragStart} onDragEnd={onDragEnd} onClick={onOpen}><strong>{lead.full_name}</strong><span className="location">⌖ {lead.location ?? 'Not assigned'}</span><StatusBadge stage={lead.stage} paused={lead.cadence_state === 'paused'} />{lead.stage==='cadence'&&lead.cadence_state!=='paused'&&<span className="version">Standard v3 · {lead.cadence_progress ?? 0} of {lead.cadence_total ?? 0}</span>}<span className="next">{lead.stage === 'closed' || lead.stage === 'booked' ? 'Outcome' : 'Next'}: {lead.next_step ?? 'No planned action'}</span><span className="sr-only">{meta.label}</span></button>; }
function StatusTiles({ counts, loading = false }: { counts: Record<LeadStage,number>; loading?: boolean }) { return <section className="status-tiles" aria-busy={loading}>{(['new','cadence','attention','booked','closed'] as LeadStage[]).map((stage)=><Link className={stage} href={`/leads?stage=${stage}`} key={stage}><StatusGlyph stage={stage} size="large" /><div><small>{statusMeta[stage].label}</small><strong>{loading ? "—" : counts[stage]}</strong></div></Link>)}</section>; }
function StatusBadge({ stage, paused = false }: { stage: LeadStage; paused?: boolean }) {
  if (paused) return <span className="status-pill paused"><PauseIcon />Paused</span>;
  return <span className={`status-pill ${stage}`}><StatusGlyph stage={stage} size="compact" />{statusMeta[stage].label}</span>;
}
function StatusGlyph({ stage, size = 'normal' }: { stage: LeadStage; size?: 'compact' | 'normal' | 'large' }) { return <span className={`status-glyph ${stage} ${size}`} aria-hidden="true"><i /></span>; }
function StatusText({ status }: { status:string }) { const warning=/attention|gated|disabled|unknown/i.test(status); return <span className={`status-text ${warning?'warning':''}`}><i />{status}</span>; }
function PageTitle({ title, subtitle, tools }: { title:string; subtitle:string; tools?:ReactNode }) { return <header className="page-heading"><div><h1>{title}</h1><p>{subtitle}</p></div>{tools&&<div className="page-tools">{tools}</div>}</header>; }
function Panel({ title, children }: { title?:string; children:ReactNode }) { return <section className="panel">{title&&<h2>{title}</h2>}{children}</section>; }
function DataTable({ heads, children }: { heads:string[]; children:ReactNode }) { return <div className="table-scroll"><table><thead><tr>{heads.map((head,index)=><th key={`${head}-${index}`}>{head}</th>)}</tr></thead><tbody>{children}</tbody></table></div>; }
function Alert({ children, tone='info' }: { children:ReactNode; tone?:'info'|'warning'|'success' }) { return <div className={`alert ${tone}`}><b>{tone==='warning'?'!':tone==='success'?'✓':'i'}</b><div>{children}</div></div>; }
function Empty({ title, body }: { title:string; body:string }) { return <div className="empty"><h2>{title}</h2><p>{body}</p></div>; }
function Stat({ label,value,trend }: { label:string; value:string; trend?:string }) { return <div className="stat"><small>{label}</small><strong>{value}</strong>{trend&&<span>{trend}</span>}</div>; }
function Metric({ label,value,width,tone }: { label:string; value:string; width:string; tone?:string }) { return <div className={`metric ${tone??''}`}><div><span>{label}</span><strong>{value}</strong></div><i><b style={{width}} /></i></div>; }
function Toggle({ label,enabled }: { label:string; enabled:boolean }) { const [on,setOn]=useState(enabled); return <div className="toggle-row"><span>{label}</span><button className={on?'on':''} type="button" aria-label={`Turn ${label} ${on ? 'off' : 'on'}`} aria-pressed={on} onClick={()=>setOn(!on)}><i /></button><b>{on?'ON':'OFF'}</b></div>; }
function ActivityList({ detail, items }: { detail:LeadDetail; items?: Array<Record<string,unknown>> }) { const activity=items ?? (detail.history.length?detail.history:[{to_status:'created',reason:'Lead created',source:'System',changed_at:detail.lead.created_at}]); return activity.length ? <div className="activity-list">{activity.map((item,index)=><div key={index}><time>{date(String(item.changed_at))}</time><span>{index===0?'▦':index===1?'☎':index===2?'●':'○'}</span><p><strong>{humanize(String(item.to_status))}</strong><small>{String(item.reason ?? 'Status updated')}</small></p><b>{String(item.source ?? 'System')}</b></div>)}</div> : <Empty title="No matching activity" body="This lead has no activity in the selected category." />; }
function activityCategory(item: Record<string,unknown>) { const value=`${item.to_status ?? ''} ${item.reason ?? ''} ${item.source ?? ''}`.toLowerCase(); if(/appointment|booked|stride/.test(value))return'appointments';if(/sms|message|twilio/.test(value))return'messages';if(/call|callback|vapi/.test(value))return'calls';return'cadence'; }
function initials(name:string){return name.split(/\s+/).map((part)=>part[0]).join('').slice(0,2).toUpperCase();}
function humanize(value:string){return value.replaceAll('_',' ').replace(/\b\w/g,(letter)=>letter.toUpperCase());}
// Every time in this app is a clinic time. Rendering in the viewer's own zone
// made a 9:00 AM Pacific callback read as 9:30 PM to staff in India, so the
// practice timezone is pinned here and shown alongside the value.
const CLINIC_TZ = 'America/Los_Angeles';
const CLINIC_TZ_LABEL = 'PT';
function time(value:string|null|undefined){if(!value)return'—';const parsed=new Date(value);return Number.isNaN(parsed.valueOf())?'—':`${parsed.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZone:CLINIC_TZ})} ${CLINIC_TZ_LABEL}`;}
function date(value:string){const parsed=new Date(value);return Number.isNaN(parsed.valueOf())?'—':`${parsed.toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:CLINIC_TZ})} ${CLINIC_TZ_LABEL}`;}
function clinicDateKey(value:Date|string){const parsed=typeof value==='string'?new Date(value):value;return Number.isNaN(parsed.valueOf())?'':parsed.toLocaleDateString('en-CA',{timeZone:CLINIC_TZ});}
function isToday(value:string){const key=clinicDateKey(value);return key!==''&&key===clinicDateKey(new Date());}

function relative(value:string|null|undefined){return value?date(value):'Not contacted';}
function duration(seconds:number){return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;}


function exportLeadReport(snapshot: Snapshot) {
  const rows = [['Lead', 'Status', 'Owner', 'Location', 'Source'], ...snapshot.leads.map((lead) => [lead.full_name, statusMeta[lead.stage].label, lead.owner ?? owners[0], lead.location ?? '', lead.source])];
  const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"','""')}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'outreach-lead-report.csv';
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
  const [phoneError, setPhoneError] = useState('');
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
    const normalisedPhone = toUsE164(String(data.get('phone') ?? ''));
    if (!normalisedPhone) {
      setPhoneError('Enter a 10-digit US number, for example 949 555 0123.');
      return;
    }
    setPhoneError('');
    if (!firstName || !lastName || saving) return;
    setSaving(true);
    await onAdd({
      idempotency_key: idempotencyKey,
      first_name: firstName,
      last_name: lastName,
      phone: normalisedPhone,
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
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="add-lead-title"><header><div><h2 id="add-lead-title">Add lead</h2><p>Save a lead and schedule their outreach cadence.</p></div><button className="close-button" type="button" onClick={onClose} aria-label="Close add lead dialog">×</button></header><form onSubmit={submit}><div className="form-grid"><label>First name<input name="first_name" autoComplete="given-name" autoFocus required /></label><label>Last name<input name="last_name" autoComplete="family-name" required /></label><label>Phone<span className="phone-field"><i aria-hidden="true">+1</i><input name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="949 555 0123" maxLength={18} aria-invalid={Boolean(phoneError)} required /></span>{phoneError && <small className="field-error">{phoneError}</small>}</label><label>Email<input name="email" type="email" autoComplete="email" placeholder="name@example.com" /></label><label>Date of birth<input name="date_of_birth" type="date" autoComplete="bday" required /></label><label>Who referred this lead?<input name="referred_by" placeholder="Name or organization" /></label><label className="form-field-full">Lead type<select name="lead_type" defaultValue="Physical Therapy" required><option>Physical Therapy</option><option>Wellness</option></select></label><label>Location<select name="location" defaultValue={defaultLocation}>{locations.map((location) => <option key={location}>{location}</option>)}</select></label><label>Owner<select name="owner" defaultValue={owners[0]}>{owners.map((owner) => <option key={owner}>{owner}</option>)}</select></label></div><footer><button className="secondary" type="button" onClick={onClose} disabled={saving}>Cancel</button><button className="primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Add lead'}</button></footer></form></section></div>;
}
