import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { ArrowDown, ArrowUp, ArrowUpDown, MapPin } from 'lucide-react';
import {
  getListCityAccidentsQueryKey,
  useListCityAccidents,
  type ListCityAccidentsParams,
} from '@workspace/api-client-react';
import { useLanguage } from '../i18n';
import AppNavigation from '../components/AppNavigation';
import AccidentViewSwitcher from '../components/AccidentViewSwitcher';
import LanguageControl from '../components/LanguageControl';
import '../incident-map.css';
import '../accidents.css';

const SEV: Record<string, string> = {
  fatal: 'Fatal', severe: 'Severe injury', injury: 'Injury', none: 'No injury recorded', unknown: 'Not specified',
};
const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', dateStyle: 'medium', timeStyle: 'short' });
const fmtDate = (iso: string | null) => (iso ? fmt.format(new Date(iso)) : 'Date not published');
const num = (n: number) => n.toLocaleString('en-US');

export default function AccidentsPage() {
  const { direction, language, t } = useLanguage();
  const [sort, setSort] = useState<'type' | 'date'>('type');
  const [order, setOrder] = useState<'asc' | 'desc'>('asc');
  const [accidentType, setAccidentType] = useState('');
  const [year, setYear] = useState('all');
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [known, setKnown] = useState<{ types: string[]; years: string[] }>({ types: [], years: [] });

  const params: ListCityAccidentsParams = {
    page, pageSize, sort, order, year, ...(accidentType ? { accidentType } : {}),
  };
  const query = useListCityAccidents(params, {
    query: {
      queryKey: getListCityAccidentsQueryKey(params),
      staleTime: 60000,
      retry: 1,
      refetchInterval: (q) => {
        const s = q.state.data?.syncStatus;
        return s === 'pending' || s === 'syncing' ? 3000 : s === 'error' ? 30000 : 60000;
      },
    },
  });
  const data = query.isError ? undefined : query.data;

  useEffect(() => {
    const prev = document.title;
    document.title = 'Accidents | TrafficSignal';
    return () => { document.title = prev; };
  }, []);
  useEffect(() => {
    if (data) setKnown((k) => ({
      types: data.accidentTypes.length ? data.accidentTypes : k.types,
      years: data.availableYears.length ? data.availableYears : k.years,
    }));
  }, [data]);

  const change = (fn: () => void) => { fn(); setPage(1); };
  const toggle = (col: 'type' | 'date') => change(() => {
    if (sort === col) setOrder(order === 'asc' ? 'desc' : 'asc');
    else { setSort(col); setOrder(col === 'type' ? 'asc' : 'desc'); }
  });
  const ariaSort = (col: 'type' | 'date') =>
    sort === col ? (order === 'asc' ? 'ascending' : 'descending') : 'none';
  const Icon = ({ col }: { col: 'type' | 'date' }) =>
    sort !== col ? <ArrowUpDown size={14} aria-hidden="true" /> : order === 'asc' ? <ArrowUp size={14} aria-hidden="true" /> : <ArrowDown size={14} aria-hidden="true" />;

  const incidents = data?.incidents ?? [];
  const syncing = data && (data.syncStatus === 'pending' || data.syncStatus === 'syncing');
  const filtered = accidentType !== '' || year !== 'all';
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const types = accidentType && !known.types.includes(accidentType) ? [...known.types, accidentType] : known.types;
  const years = year !== 'all' && !known.years.includes(year) ? [...known.years, year] : known.years;

  return (
    <div className="app-shell" dir={direction} lang={language}>
      <header className="site-header">
        <Link className="brand" href="/" data-testid="link-brand-accidents">
          <span className="brand-mark" aria-hidden="true"><MapPin /></span>
          <span className="brand-name">TrafficSignal</span>
        </Link>
        <div className="header-actions"><LanguageControl /></div>
      </header>
      <AppNavigation />
      <main className="page-wrap">
        <div className="im-page ac-page" lang="en" dir="ltr">
          <AccidentViewSwitcher />
          <span className="eyebrow" lang={language} dir={direction}>{t('accidentsNav')}</span>
          <h1>City traffic collisions</h1>
          <p className="im-lede">
            Official City of San José collision records saved in TrafficSignal's database. This is historical data, not live emergencies and not reports from residents. For emergencies, call 911.
          </p>

          <div className="ac-bar">
            <label>Sort by
              <select value={`${sort}:${order}`} onChange={(e) => { const [s, o] = e.target.value.split(':'); change(() => { setSort(s as 'type' | 'date'); setOrder(o as 'asc' | 'desc'); }); }} data-testid="select-accident-sort">
                <option value="type:asc">Accident type A–Z</option>
                <option value="type:desc">Accident type Z–A</option>
                <option value="date:desc">Date, newest first</option>
                <option value="date:asc">Date, oldest first</option>
              </select>
            </label>
            <label>Accident type
              <select value={accidentType} onChange={(e) => change(() => setAccidentType(e.target.value))} data-testid="select-accident-type">
                <option value="">All types</option>
                {types.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </label>
            <label>Year
              <select value={year} onChange={(e) => change(() => setYear(e.target.value))} data-testid="select-accident-year">
                <option value="all">All years</option>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </label>
            <label>Per page
              <select value={pageSize} onChange={(e) => change(() => setPageSize(Number(e.target.value)))} data-testid="select-accident-pagesize">
                {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          </div>

          {query.isError && (
            <div className="im-notice" role="alert" data-testid="error-accidents">
              Collision records could not be loaded.{' '}
              <button type="button" className="button button-secondary" onClick={() => query.refetch()} data-testid="button-retry-accidents">Retry</button>
            </div>
          )}
          {data?.syncStatus === 'error' && (
            <p className="im-notice" role="status" data-testid="notice-sync-error">
              The latest update from the City's data source failed. {data.lastSyncedAt ? `Previously saved records remain available, last updated ${fmtDate(data.lastSyncedAt)} (Pacific).` : 'No records have been imported yet.'} Updates will retry automatically.
            </p>
          )}
          {syncing && !data.lastSyncedAt && (
            <p className="im-notice" role="status" data-testid="notice-initial-import">
              Importing the City's collision records for the first time. This page will fill in automatically.
            </p>
          )}
          {syncing && data.lastSyncedAt && (
            <p className="im-notice" role="status" data-testid="notice-syncing">Checking the City's source for updates. Saved records are shown below.</p>
          )}

          {!data && !query.isError && (
            <div className="im-list" style={{ maxHeight: 'none' }} aria-busy="true" data-testid="loading-accidents">
              {Array.from({ length: 6 }, (_, i) => <div key={i} className="im-skel" />)}
            </div>
          )}

          {data && (
            <>
              <p className="ac-count" aria-live="polite" data-testid="text-accident-total">
                {num(data.total)} saved {filtered ? 'matching ' : ''}{data.total === 1 ? 'collision' : 'collisions'}
                {accidentType ? ` of type "${accidentType}"` : ''}{year !== 'all' ? ` in ${year}` : ''}
              </p>
              {data.total === 0 && !syncing && (
                <p className="im-empty" data-testid="empty-accidents">
                  {filtered ? 'No saved collisions match these filters. Try another type or year.' : 'No collision records are saved yet.'}
                </p>
              )}
              {incidents.length > 0 && (
                <>
                  <div className="ac-wrap">
                    <table className="ac-table" data-testid="table-accidents">
                      <caption className="sr-only-im">
                        Collisions sorted by {sort === 'type' ? 'accident type' : 'date'}, {order === 'asc' ? 'ascending' : 'descending'}. Page {data.page} of {pages}.
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col" aria-sort={ariaSort('date')}>
                            <button type="button" className="ac-th" onClick={() => toggle('date')} data-testid="button-sort-date">Date (Pacific) <Icon col="date" /></button>
                          </th>
                          <th scope="col">Location</th>
                          <th scope="col" aria-sort={ariaSort('type')}>
                            <button type="button" className="ac-th" onClick={() => toggle('type')} data-testid="button-sort-type">Accident type <Icon col="type" /></button>
                          </th>
                          <th scope="col">Severity</th>
                        </tr>
                      </thead>
                      <tbody>
                        {incidents.map((i) => (
                          <tr key={i.id} data-testid={`row-accident-${i.id}`}>
                            <td>{fmtDate(i.occurredAt)}</td>
                            <td>{i.location}</td>
                            <td>{i.collisionType}</td>
                            <td><span className="ac-sev">{SEV[i.severity] ?? i.severity}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <ul className="ac-cards" aria-label="Collisions">
                    {incidents.map((i) => (
                      <li key={i.id}>
                        <strong>{i.collisionType}</strong>
                        <span>{i.location}</span>
                        <small>{fmtDate(i.occurredAt)}</small>
                        <span><span className="ac-sev">{SEV[i.severity] ?? i.severity}</span></span>
                      </li>
                    ))}
                  </ul>
                  <nav className="ac-pager" aria-label="Pagination">
                    <span data-testid="text-accident-page">Page {num(data.page)} of {num(pages)}</span>
                    <div>
                      <button type="button" className="button button-secondary" disabled={data.page <= 1} onClick={() => setPage(page - 1)} data-testid="button-prev-page">Previous</button>
                      <button type="button" className="button button-secondary" disabled={data.page >= pages} onClick={() => setPage(page + 1)} data-testid="button-next-page">Next</button>
                    </div>
                  </nav>
                </>
              )}
              <p className="im-source" data-testid="text-accident-source">
                Source: <a href={data.sourceUrl} target="_blank" rel="noopener noreferrer">City of San José, Crash Locations Last Five Years</a>.{' '}
                {data.lastSyncedAt ? `Last synchronized ${fmtDate(data.lastSyncedAt)} (Pacific).` : 'Not yet synchronized.'}
                {data.skippedCount > 0 && ` ${num(data.skippedCount)} published records were skipped because they were incomplete or invalid, so they are not listed.`}
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
