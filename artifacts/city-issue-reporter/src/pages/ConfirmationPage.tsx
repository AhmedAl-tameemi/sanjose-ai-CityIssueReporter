import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Clipboard, ImageIcon, MapPin, RotateCcw } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { isEvidenceObjectPath, type Report } from '../types/report';
import { reportStorageKey } from './ReportPage';

export default function ConfirmationPage() {
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
  }, []);

  if (!report) {
    return (
      <div className="app-shell">
        <header className="site-header">
          <Link className="brand" href="/" data-testid="link-brand-empty"><span className="brand-mark" aria-hidden="true"><MapPin /></span><span className="brand-name">City Issue Reporter</span></Link>
        </header>
        <main className="page-wrap not-found">
          <div>
            <h1>Nothing submitted yet.</h1>
            <p>Start a report and your confirmation will appear here.</p>
            <Link className="button button-primary" href="/" data-testid="link-start-report">Start a report</Link>
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
    <div className="app-shell">
      <header className="site-header">
        <Link className="brand" href="/" data-testid="link-brand-confirmation">
          <span className="brand-mark" aria-hidden="true"><MapPin /></span>
          <span className="brand-name">City Issue Reporter</span>
        </Link>
        <span className="header-note">A clearer way to care for our streets</span>
      </header>
      <main className="page-wrap confirmation-page">
        <article className="confirmation-card" aria-labelledby="confirmation-heading">
          <div className="confirmation-top">
            <div className="success-mark" aria-hidden="true"><Check size={28} strokeWidth={2.5} /></div>
            <h1 id="confirmation-heading" ref={headingRef} tabIndex={-1}>We received your report.</h1>
            <p>Thank you for taking the time to let the City know. Your report has been recorded and is ready for review.</p>
            <div className="report-number" data-testid="text-report-number">
              <span>{report.reportNumber}</span>
              <button className="copy-number" onClick={copyNumber} aria-label="Copy report number" title="Copy report number" data-testid="button-copy-report-number">
                {copied ? <Check size={16} /> : <Clipboard size={16} />}
              </button>
            </div>
            <div className="hint" style={{ marginTop: 9 }}>{copied ? 'Copied to your clipboard.' : 'Save this number if you want to check back later.'}</div>
          </div>

          <div className="confirmation-body">
            <section className="confirmation-section" aria-labelledby="summary-heading">
              <h2 id="summary-heading">Your report summary</h2>
              <div className="summary-grid">
                <div className="summary-item"><span className="summary-label">Issue type</span><span className="summary-value" data-testid="text-summary-issue">{report.issueType}</span></div>
                <div className="summary-item"><span className="summary-label">Location</span><span className="summary-value" data-testid="text-summary-location">{report.location}</span></div>
                <div className="summary-item"><span className="summary-label">Date noticed</span><span className="summary-value">{report.date}</span></div>
                <div className="summary-item"><span className="summary-label">Approximate time</span><span className="summary-value">{report.approximateTime}</span></div>
                <div className="summary-item"><span className="summary-label">How often</span><span className="summary-value">{report.frequency}</span></div>
                <div className="summary-item full"><span className="summary-label">What you told us</span><span className="summary-value">{report.description}</span></div>
                {(report.name || report.email || report.phone) && (
                  <div className="summary-item full">
                    <span className="summary-label">Contact details</span>
                    <span className="summary-value">{[report.name, report.email, report.phone].filter(Boolean).join(' · ')}</span>
                  </div>
                )}
                {report.evidence && evidenceUrl && (
                  <div className="summary-item full">
                    <span className="summary-label">Image evidence</span>
                    <div className="confirmation-evidence">
                      <img src={evidenceUrl} alt={`Submitted evidence: ${report.evidence.name}`} />
                      <span><ImageIcon size={15} />{report.evidence.name}</span>
                    </div>
                  </div>
                )}
              </div>
            </section>

            <section className="confirmation-section" aria-labelledby="next-steps-heading">
              <h2 id="next-steps-heading">What happens next</h2>
              <div className="next-steps">
                <div className="next-step"><span className="step-number">01</span><h3>Review</h3><p>City staff will review the details and make sure the report is complete.</p></div>
                <div className="next-step"><span className="step-number">02</span><h3>Route</h3><p>It will be sent to the department best equipped to look into this kind of issue.</p></div>
                <div className="next-step"><span className="step-number">03</span><h3>Keep your number</h3><p>Use <strong>{report.reportNumber}</strong> if you need to ask about this report later.</p></div>
              </div>
            </section>

            <div className="confirmation-actions">
              <button type="button" className="button button-secondary" onClick={startAnother} data-testid="button-submit-another"><RotateCcw size={15} /> Submit another report</button>
              <Link className="button button-primary" href="/" data-testid="link-back-home"><ArrowLeft size={15} /> Back to start</Link>
            </div>
          </div>
        </article>
      </main>
    </div>
  );
}