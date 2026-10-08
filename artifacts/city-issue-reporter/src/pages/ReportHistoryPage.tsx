import { useEffect, useMemo, useState } from 'react';
import { Link, useSearch } from 'wouter';
import { Globe, Lock, MapPin, Printer, RotateCcw } from 'lucide-react';
import {
  getListTrafficReportsQueryKey,
  useListTrafficReports,
} from '@workspace/api-client-react';
import type { ListTrafficReportsParams, TrafficReport } from '@workspace/api-client-react';
import { frequencyTranslationKeys, issueTranslationKeys, useLanguage } from '../i18n';
import { historyText, type HistoryKey } from '../historyI18n';
import '../history.css';
import AppNavigation from '../components/AppNavigation';
import LanguageControl from '../components/LanguageControl';
import EvidencePlayer from '../components/EvidencePlayer';
import CityOfficialReport from '../components/CityOfficialReport';

function errorMessage(err: unknown): string {
  const e = err as { data?: { error?: string }; message?: string } | null;
  return e?.data?.error || e?.message || 'Request failed. Please try again.';
}

function HistoryEvidenceItem({ report, evidence, index, label, fail, staffView }: {
  report: TrafficReport;
  evidence: TrafficReport['evidence'][number];
  index: number;
  label: string;
  fail: string;
  staffView: boolean;
}) {
  const [broken, setBroken] = useState(false);
  return (
    <div className="history-photo-item" data-testid={`history-evidence-${index}`}>
      {broken ? (
        <p className="history-text" role="alert">{fail}</p>
      ) : (
        <EvidencePlayer
          src={`/api/${staffView ? 'staff/' : ''}reports/${encodeURIComponent(report.id)}/evidence/${index}`}
          type={evidence.type}
          name={`${label}: ${evidence.name}`}
          onError={() => setBroken(true)}
        />
      )}
      <p className="hint">{evidence.name} · {Math.max(1, Math.round(evidence.size / 1024))} KB</p>
    </div>
  );
}

function PhotoEvidence({ report, label, fail, staffView }: { report: TrafficReport; label: string; fail: string; staffView: boolean }) {
  if (!report.evidence.length) return null;
  return (
    <div className="history-photo">
      <span className="history-label">{label}</span>
      <div className="history-evidence-list">
        {report.evidence.map((evidence, index) => (
          <HistoryEvidenceItem
            key={`${index}-${evidence.name}`}
            report={report}
            evidence={evidence}
            index={index}
            label={label}
            fail={fail}
            staffView={staffView}
          />
        ))}
      </div>
    </div>
  );
}

export default function ReportHistoryPage() {
  const { language, direction, t } = useLanguage();
  const h = (k: HistoryKey, n?: number) => historyText(language, k, n);
  const staffView = new URLSearchParams(useSearch()).get('view') === 'staff';
  const params: ListTrafficReportsParams = { view: staffView ? 'staff' : 'resident' };
  const query = useListTrafficReports(
    params,
    { query: { queryKey: getListTrafficReportsQueryKey(params), retry: false, staleTime: 0, refetchOnMount: 'always' } },
  );
  const [printingReportId, setPrintingReportId] = useState<string | null>(null);
  const [printGeneratedAt, setPrintGeneratedAt] = useState<string | null>(null);

  const data = query.isError ? undefined : query.data;
  useEffect(() => {
    const previousTitle = document.title;
    document.title = staffView ? 'City Staff Reports | TrafficSignal' : 'Report History | TrafficSignal';
    return () => { document.title = previousTitle; };
  }, [staffView]);
  const viewer = staffView ? 'staff' : 'resident';
  const reports = useMemo(
    () => [...(data?.reports ?? [])].sort((a, b) => Date.parse(b.submittedAt) - Date.parse(a.submittedAt)),
    [data],
  );

  const fmt = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(language, { dateStyle: 'medium', timeStyle: 'short' });
  };

  useEffect(() => {
    if (!printingReportId) return;
    document.body.classList.add('printing-city-report');
    const clearPrintMode = () => {
      document.body.classList.remove('printing-city-report');
      setPrintingReportId(null);
      setPrintGeneratedAt(null);
    };
    const frame = window.requestAnimationFrame(() => window.print());
    window.addEventListener('afterprint', clearPrintMode);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('afterprint', clearPrintMode);
      document.body.classList.remove('printing-city-report');
    };
  }, [printingReportId]);

  const printCityReport = (reportId: string) => {
    setPrintGeneratedAt(new Date().toISOString());
    setPrintingReportId(reportId);
  };

  const loading = query.isLoading || (query.isFetching && !data);

  return (
    <div className="app-shell" dir={direction} lang={language}>
      <header className="site-header">
        <Link className="brand" href="/" data-testid="link-brand-history">
          <span className="brand-mark" aria-hidden="true"><MapPin /></span>
          <span className="brand-name">TrafficSignal</span>
        </Link>
        <div className="header-actions">
          <Link className="button button-secondary" href="/?view=report" data-testid="link-new-report">{h('newReport')}</Link>
          <LanguageControl />
        </div>
      </header>
      <main className="page-wrap history-page">
        <section className="history-hero">
          <span className="eyebrow">TrafficSignal</span>
            <h1>{viewer === 'staff' ? 'City staff reports' : h('title')}</h1>
            <p>{viewer === 'staff' ? 'Reports from all residents, newest first. No sign-in is required.' : h('intro')}</p>
          <div className="history-privacy" data-testid="text-history-privacy">
              {staffView ? <Globe size={18} aria-hidden="true" /> : <Lock size={18} aria-hidden="true" />}
            {viewer === 'staff'
                ? <div lang="en" dir="ltr"><strong>Public access</strong>Anyone can view full submitted reports, contact details, locations, and attachments.</div>
              : <div><strong>{h('privateTitle')}</strong>{h('privateText')}</div>}
          </div>
        </section>

        <div className="history-bar">
          <span className={`history-badge ${viewer}`} data-testid="status-history-viewer">
             {viewer === 'staff' ? <span lang="en" dir="ltr">{historyText('en', 'staffBadge')}</span> : h('residentBadge')}
          </span>
          {data && <span className="hint" data-testid="text-history-count">{h('count', reports.length)}</span>}
        </div>

        <details className="history-staff" open={viewer === 'staff' ? true : undefined} lang="en" dir="ltr">
          <summary id="staff-h" data-testid="toggle-staff-access">{historyText('en', 'staffTitle')}</summary>
          {viewer === 'staff' ? (
            <>
              <Link className="button button-secondary" href="/history" data-testid="link-resident-history">Return to my report history</Link>
            </>
          ) : (
             <div>
                <p>The public City staff view shows all submitted reports and attachments. No PIN or email is needed.</p>
                <Link className="button button-secondary" href="/history?view=staff" data-testid="link-staff-view">
                  Open City staff view
               </Link>
             </div>
          )}
        </details>

        {loading ? (
            <div className="history-list" role="status" aria-label={staffView ? 'Loading all reports' : h('loading')} data-testid="state-history-loading">
            <div className="history-skel" /><div className="history-skel" />
          </div>
        ) : query.isError ? (
          <div className="history-state" role="alert" data-testid="state-history-error">
            <h2>{h('errorTitle')}</h2>
            <p>{errorMessage(query.error)}</p>
            <button type="button" className="button button-primary" onClick={() => query.refetch()} data-testid="button-history-retry">
              <RotateCcw size={15} /> {h('retry')}
            </button>
          </div>
        ) : reports.length === 0 ? (
          <div className="history-state" data-testid="state-history-empty">
              <h2>{staffView ? 'No reports have been submitted yet' : h('emptyTitle')}</h2>
              <p>{staffView ? 'Submitted reports will appear here with their report numbers.' : h('emptyText')}</p>
            <Link className="button button-primary" href="/?view=report" data-testid="link-empty-report">{h('newReport')}</Link>
          </div>
        ) : (
          <ol className="history-list">
            {reports.map((r) => {
              const o = r.originalReport;
              const contact = [o.name, o.email, o.phone].filter(Boolean).join(' · ');
              return (
                <li key={r.id} className={`history-card${printingReportId === r.id ? ' history-print-target' : ''}`} data-testid={`card-report-${r.id}`}>
                  <div className="history-card-head">
                    <span className="history-number" data-testid={`text-number-${r.id}`}>{r.reportNumber}</span>
                    <time className="history-time" dateTime={r.submittedAt}>{fmt(r.submittedAt)}</time>
                    {viewer === 'staff' && (
                      <button
                        type="button"
                        className="button button-secondary history-print-button"
                        onClick={() => printCityReport(r.id)}
                        data-testid={`button-print-report-${r.id}`}
                      >
                        <Printer size={15} aria-hidden="true" />
                        Print city report / Save as PDF
                      </button>
                    )}
                  </div>
                  {viewer === 'staff' && printGeneratedAt && printingReportId === r.id && (
                    <CityOfficialReport report={r} generatedAt={printGeneratedAt} />
                  )}
                  <div className="history-card-body">
                    <dl className="history-meta">
                      <div><dt>{h('category')}</dt><dd>{t(issueTranslationKeys[o.issueType])}</dd></div>
                      <div><dt>{h('location')}</dt><dd dir="auto">{r.location ?? o.location ?? o.searchedAddress ?? '—'}</dd></div>
                      <div><dt>{h('status')}</dt><dd>{r.status === 'submitted' ? h('statusSubmitted') : r.status}</dd></div>
                      <div><dt>{h('when')}</dt><dd dir="auto">{o.date} · {o.approximateTime}</dd></div>
                      <div><dt>{h('frequency')}</dt><dd>{t(frequencyTranslationKeys[o.frequency])}</dd></div>
                      {o.pinLatitude !== null && o.pinLongitude !== null && <div lang="en" dir="ltr"><dt>Map pin</dt><dd>{o.pinLatitude.toFixed(6)}, {o.pinLongitude.toFixed(6)}</dd></div>}
                    </dl>
                    <div>
                      <span className="history-label">{h('original')}</span>
                      <p className="history-text" dir="auto">{o.description}</p>
                    </div>
                    {contact && (
                      <div>
                        <span className="history-label">{h('contact')}</span>
                        <p className="history-text" dir="auto">{contact}</p>
                      </div>
                    )}
                     <PhotoEvidence report={r} label={t('evidenceLabel')} fail={t('evidenceLoadError')} staffView={staffView} />
                    <div className="history-analysis">
                      <span className="history-label">{h('analysis')}</span>
                      {r.analysis && r.analysisStatus === 'complete' ? (
                        <div lang="en" dir="ltr" style={{ display: 'grid', gap: 8 }}>
                          <p data-testid={`text-ai-summary-${r.id}`}>{r.analysis.summary}</p>
                          <p><span className="history-label">{historyText('en', 'urgency')} </span><span className={`urgency ${r.analysis.urgency}`}>{r.analysis.urgency}</span></p>
                          <p><span className="history-label">{historyText('en', 'category')}: </span>{r.analysis.suggestedCategory.replaceAll('_', ' ')}</p>
                          <p><span className="history-label">{historyText('en', 'action')}: </span>{r.analysis.recommendedAction}</p>
                          <p className="hint">AI suggestions are not verified findings or emergency dispatch.</p>
                        </div>
                      ) : (
                        <p>{r.analysisStatus === 'pending' ? h('analysisPending') : h('analysisUnavailable')}</p>
                      )}
                    </div>
                    {r.englishTranslation && (
                      <div lang="en" dir="ltr">
                        <span className="history-label">{historyText('en', 'translation')}</span>
                        <p className="history-text">{r.englishTranslation.location} · {r.englishTranslation.approximateTime}</p>
                        <p className="history-text">{r.englishTranslation.description}</p>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </main>
      <AppNavigation />
    </div>
  );
}
