import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Clipboard, ImageIcon, MapPin, RotateCcw } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { isEvidenceObjectPath, type Report } from '../types/report';
import { reportStorageKey } from './ReportPage';
import {
  frequencyTranslationKeys,
  issueTranslationKeys,
  useLanguage,
} from '../i18n';

export default function ConfirmationPage() {
  const { language, direction, setLanguage, t } = useLanguage();
  const [, setLocation] = useLocation();
  const [report, setReport] = useState<Report | null>(() => {
    try {
      const saved = window.localStorage.getItem(reportStorageKey);
      if (!saved) return null;
      const parsed = JSON.parse(saved) as Report & {
        evidence?: { name?: unknown; type?: unknown; size?: unknown; objectPath?: unknown };
      };
      const storedEvidence = parsed.evidence;
      return {
        ...parsed,
        evidence:
          storedEvidence &&
          typeof storedEvidence.name === 'string' &&
          typeof storedEvidence.type === 'string' &&
          typeof storedEvidence.size === 'number' &&
          isEvidenceObjectPath(storedEvidence.objectPath)
            ? {
                name: storedEvidence.name,
                type: storedEvidence.type,
                size: storedEvidence.size,
                objectPath: storedEvidence.objectPath,
              }
            : undefined,
      };
    } catch {
      return null;
    }
  });
  const [copied, setCopied] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
    if (report?.language && report.language !== language) {
      setLanguage(report.language);
    }
  }, [language, report?.language, setLanguage]);

  if (!report) {
    return (
      <div className="app-shell" dir={direction}>
        <header className="site-header">
          <Link className="brand" href="/" data-testid="link-brand-empty"><span className="brand-mark" aria-hidden="true"><MapPin /></span><span className="brand-name">{t('brandName')}</span></Link>
        </header>
        <main className="page-wrap not-found">
          <div>
            <h1>{t('nothingTitle')}</h1>
            <p>{t('nothingText')}</p>
            <Link className="button button-primary" href="/" data-testid="link-start-report">{t('startReport')}</Link>
          </div>
        </main>
      </div>
    );
  }

  const copyNumber = async () => {
    try {
      await navigator.clipboard.writeText(report.reportNumber);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopied(false);
    }
  };

  const startAnother = () => {
    setLocation('/');
  };

  const evidenceUrl = report.evidence
    ? `/api/storage${report.evidence.objectPath}`
    : undefined;

  return (
    <div className="app-shell" dir={direction}>
      <header className="site-header">
        <Link className="brand" href="/" data-testid="link-brand-confirmation">
          <span className="brand-mark" aria-hidden="true"><MapPin /></span>
          <span className="brand-name">{t('brandName')}</span>
        </Link>
        <span className="header-note">{t('headerNote')}</span>
      </header>
      <main className="page-wrap confirmation-page">
        <article className="confirmation-card" aria-labelledby="confirmation-heading">
          <div className="confirmation-top">
            <div className="success-mark" aria-hidden="true"><Check size={28} strokeWidth={2.5} /></div>
            <h1 id="confirmation-heading" ref={headingRef} tabIndex={-1}>{t('successTitle')}</h1>
            <p>{t('successText')}</p>
            <div className="report-number" data-testid="text-report-number">
              <span>{report.reportNumber}</span>
              <button className="copy-number" onClick={copyNumber} aria-label={t('saveNumber')} title={t('saveNumber')} data-testid="button-copy-report-number">
                {copied ? <Check size={16} /> : <Clipboard size={16} />}
              </button>
            </div>
            <div className="hint" style={{ marginTop: 9 }}>{copied ? t('copied') : t('saveNumber')}</div>
          </div>

          <div className="confirmation-body">
            <section className="confirmation-section" aria-labelledby="summary-heading">
              <h2 id="summary-heading">{t('summaryTitle')}</h2>
              <div className="summary-grid">
                <div className="summary-item"><span className="summary-label">{t('issueType')}</span><span className="summary-value" data-testid="text-summary-issue">{t(issueTranslationKeys[report.issueType])}</span></div>
                <div className="summary-item"><span className="summary-label">{t('reviewLocation')}</span><span className="summary-value" dir="auto" data-testid="text-summary-location">{report.location}</span></div>
                <div className="summary-item"><span className="summary-label">{t('dateNoticed')}</span><span className="summary-value">{report.date}</span></div>
                <div className="summary-item"><span className="summary-label">{t('timeLabel')}</span><span className="summary-value" dir="auto">{report.approximateTime}</span></div>
                <div className="summary-item"><span className="summary-label">{t('howOften')}</span><span className="summary-value">{t(frequencyTranslationKeys[report.frequency])}</span></div>
                <div className="summary-item full"><span className="summary-label">{t('whatYouSaid')}</span><span className="summary-value" dir="auto">{report.description}</span></div>
                {(report.name || report.email || report.phone) && (
                  <div className="summary-item full">
                    <span className="summary-label">{t('contactDetails')}</span>
                    <span className="summary-value" dir="auto">{[report.name, report.email, report.phone].filter(Boolean).join(' · ')}</span>
                  </div>
                )}
                {report.evidence && evidenceUrl && (
                  <div className="summary-item full">
                    <span className="summary-label">{t('imageEvidence')}</span>
                    <div className="confirmation-evidence">
                      <img src={evidenceUrl} alt={`${t('imageEvidence')}: ${report.evidence.name}`} />
                      <span><ImageIcon size={15} />{report.evidence.name}</span>
                    </div>
                  </div>
                )}
              </div>
            </section>

            {report.language && report.language !== 'en' && (
              <section className="confirmation-section" aria-labelledby="staff-translation-heading">
                <h2 id="staff-translation-heading">{t('staffEnglishTitle')}</h2>
                {report.translationStatus === 'complete' && report.englishTranslation ? (
                  <div className="staff-translation" dir="ltr" lang="en">
                    <div><span>Location</span><p>{report.englishTranslation.location}</p></div>
                    <div><span>Approximate time</span><p>{report.englishTranslation.approximateTime}</p></div>
                    <div><span>Description</span><p>{report.englishTranslation.description}</p></div>
                  </div>
                ) : (
                  <p className="translation-pending">{t('translationPending')}</p>
                )}
              </section>
            )}

            <section className="confirmation-section" aria-labelledby="next-steps-heading">
              <h2 id="next-steps-heading">{t('nextHeading')}</h2>
              <div className="next-steps">
                <div className="next-step"><span className="step-number">01</span><h3>{t('nextReviewTitle')}</h3><p>{t('nextReviewText')}</p></div>
                <div className="next-step"><span className="step-number">02</span><h3>{t('nextRouteTitle')}</h3><p>{t('nextRouteText')}</p></div>
                <div className="next-step"><span className="step-number">03</span><h3>{t('nextKeepTitle')}</h3><p>{t('nextKeepText', { number: report.reportNumber })}</p></div>
              </div>
            </section>

            <div className="confirmation-actions">
              <button type="button" className="button button-secondary" onClick={startAnother} data-testid="button-submit-another"><RotateCcw size={15} /> {t('submitAnother')}</button>
              <Link className="button button-primary" href="/" data-testid="link-back-home"><ArrowLeft size={15} /> {t('backStart')}</Link>
            </div>
          </div>
        </article>
      </main>
    </div>
  );
}