import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Lock, MapPin, RotateCcw } from 'lucide-react';
import {
  getListTrafficReportsQueryKey,
  useListTrafficReports,
  useStaffLogin,
  useStaffLogout,
} from '@workspace/api-client-react';
import type { TrafficReport } from '@workspace/api-client-react';
import { frequencyTranslationKeys, issueTranslationKeys, useLanguage } from '../i18n';
import { historyText, type HistoryKey } from '../historyI18n';
import '../history.css';
import AppNavigation from '../components/AppNavigation';
import LanguageControl from '../components/LanguageControl';
import EvidencePlayer from '../components/EvidencePlayer';

function errorMessage(err: unknown): string {
  const e = err as { data?: { error?: string }; message?: string } | null;
  return e?.data?.error || e?.message || 'Request failed. Please try again.';
}

function HistoryEvidenceItem({ report, evidence, index, label, fail }: {
  report: TrafficReport;
  evidence: TrafficReport['evidence'][number];
  index: number;
  label: string;
  fail: string;
}) {
  const [broken, setBroken] = useState(false);
  return (
    <div className="history-photo-item" data-testid={`history-evidence-${index}`}>
      {broken ? (
        <p className="history-text" role="alert">{fail}</p>
      ) : (
        <EvidencePlayer
          src={`/api/reports/${encodeURIComponent(report.id)}/evidence/${index}`}
          type={evidence.type}
          name={`${label}: ${evidence.name}`}
          onError={() => setBroken(true)}
        />
      )}
      <p className="hint">{evidence.name} · {Math.max(1, Math.round(evidence.size / 1024))} KB</p>
    </div>
  );
}

function PhotoEvidence({ report, label, fail }: { report: TrafficReport; label: string; fail: string }) {
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
          />
        ))}
      </div>
    </div>
  );
}

export default function ReportHistoryPage() {
  const { language, direction, t } = useLanguage();
  const h = (k: HistoryKey, n?: number) => historyText(language, k, n);
  const queryClient = useQueryClient();
  const query = useListTrafficReports();
  const login = useStaffLogin();
  const logout = useStaffLogout();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const data = busy ? undefined : query.data;
  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Report History | TrafficSignal';
    return () => { document.title = previousTitle; };
  }, []);
  const viewer = data?.viewer ?? 'resident';
  const reports = useMemo(
    () => [...(data?.reports ?? [])].sort((a, b) => Date.parse(b.submittedAt) - Date.parse(a.submittedAt)),
    [data],
  );

  const resetAndRefetch = async () => {
    const key = getListTrafficReportsQueryKey();
    await queryClient.cancelQueries({ queryKey: key });
    // Reset the active observer's data immediately, including on a failed
    // follow-up fetch. Removing a query alone can leave its old data visible.
    await queryClient.resetQueries({ queryKey: key, exact: true });
  };

  const onLogin = async (e: FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setBusy(true);
    try {
      await login.mutateAsync({ data: { email, password } });
      setPassword('');
      await resetAndRefetch();
    } catch (err) {
      setAuthError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const onLogout = async () => {
    setAuthError(null);
    setBusy(true);
    try {
      await logout.mutateAsync();
    } catch (err) {
      setAuthError(errorMessage(err));
    }
    try {
      await resetAndRefetch();
    } catch {
      /* error state shown by query */
    } finally {
      setBusy(false);
    }
  };

  const fmt = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(language, { dateStyle: 'medium', timeStyle: 'short' });
  };

  const loading = busy || query.isLoading || (query.isFetching && !data);

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
          <h1>{viewer === 'staff' ? 'All report history' : h('title')}</h1>
          <p>{viewer === 'staff' ? 'Reports from all residents, newest first.' : h('intro')}</p>
          <div className="history-privacy" data-testid="text-history-privacy">
            <Lock size={18} aria-hidden="true" />
            {viewer === 'staff'
              ? <div lang="en" dir="ltr"><strong>Authenticated staff access</strong>You can view all stored submissions. Sign out to return to resident-only history.</div>
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
            <button type="button" className="button button-secondary" onClick={onLogout} disabled={busy} data-testid="button-staff-logout">
              Sign out of staff view
            </button>
          ) : (
            <form onSubmit={onLogin}>
              <label>Staff email
                <input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="input-staff-email" />
              </label>
              <label>Password
                <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} data-testid="input-staff-password" />
              </label>
              <button type="submit" className="button button-primary" disabled={busy} data-testid="button-staff-login">
                {busy ? 'Signing in…' : 'Staff sign in'}
              </button>
            </form>
          )}
          {authError && <p className="history-error" role="alert" data-testid="text-staff-error">{authError}</p>}
        </details>

        {loading ? (
          <div className="history-list" role="status" aria-label={h('loading')} data-testid="state-history-loading">
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
            <h2>{h('emptyTitle')}</h2>
            <p>{h('emptyText')}</p>
            <Link className="button button-primary" href="/?view=report" data-testid="link-empty-report">{h('newReport')}</Link>
          </div>
        ) : (
          <ol className="history-list">
            {reports.map((r) => {
              const o = r.originalReport;
              const contact = [o.name, o.email, o.phone].filter(Boolean).join(' · ');
              return (
                <li key={r.id} className="history-card" data-testid={`card-report-${r.id}`}>
                  <div className="history-card-head">
                    <span className="history-number" data-testid={`text-number-${r.id}`}>{r.reportNumber}</span>
                    <time className="history-time" dateTime={r.submittedAt}>{fmt(r.submittedAt)}</time>
                  </div>
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
                    <PhotoEvidence report={r} label={t('evidenceLabel')} fail={t('evidenceLoadError')} />
                    <div className="history-analysis">
                      <span className="history-label">{h('analysis')}</span>
                      {r.analysis ? (
                        <div lang="en" dir="ltr" style={{ display: 'grid', gap: 8 }}>
                          <p>{r.analysis.summary}</p>
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
