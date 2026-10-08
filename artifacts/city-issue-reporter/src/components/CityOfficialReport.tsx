import type { TrafficReport } from '@workspace/api-client-react';

function safeValue(value: string | null | undefined): string {
  return value?.trim() || 'Not provided';
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || 'Not provided';
  return date.toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function languageName(language: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(language) || language;
  } catch {
    return language || 'Not provided';
  }
}

export default function CityOfficialReport({
  report,
  generatedAt,
}: {
  report: TrafficReport;
  generatedAt: string;
}) {
  const original = report.originalReport;
  const location = report.location || original.location || original.searchedAddress;
  const pinLatitude = original.pinLatitude;
  const pinLongitude = original.pinLongitude;
  const pinCoordinates =
    typeof pinLatitude === 'number' &&
    Number.isFinite(pinLatitude) &&
    typeof pinLongitude === 'number' &&
    Number.isFinite(pinLongitude);
  const formattedCoordinates = pinCoordinates
    ? `${pinLatitude.toFixed(6)}, ${pinLongitude.toFixed(6)}`
    : null;

  return (
    <article className="history-print-document" lang="en" dir="ltr" aria-label={`Printable report ${report.reportNumber}`}>
      <header className="city-report-header">
        <p className="city-report-brand">TrafficSignal · City staff report</p>
        <h1>Resident-Submitted Incident Report</h1>
        <p className="city-report-confidential">
          PUBLIC COPY — Submitted resident report available in the public City staff view.
        </p>
      </header>

      <section className="city-report-section">
        <h2>Report details</h2>
        <dl className="city-report-facts">
          <div><dt>Report number</dt><dd>{report.reportNumber}</dd></div>
          <div><dt>Report status</dt><dd>{report.status === 'submitted' ? 'Received and recorded' : report.status}</dd></div>
          <div><dt>Submitted to TrafficSignal</dt><dd>{formatDateTime(report.submittedAt)}</dd></div>
          <div><dt>Incident date and approximate time</dt><dd>{safeValue(original.date)} · {safeValue(original.approximateTime)}</dd></div>
          <div><dt>Reported category</dt><dd>{original.issueType}</dd></div>
          <div><dt>Reported frequency</dt><dd>{original.frequency}</dd></div>
          <div><dt>Reported location</dt><dd dir="auto">{safeValue(location)}</dd></div>
          {original.searchedAddress && original.searchedAddress !== location && (
            <div><dt>Address searched for the location</dt><dd dir="auto">{original.searchedAddress}</dd></div>
          )}
          <div><dt>Submission language</dt><dd>{languageName(report.language)}</dd></div>
          {formattedCoordinates && (
            <div><dt>Map pin coordinates</dt><dd>{formattedCoordinates}</dd></div>
          )}
        </dl>
      </section>

      <section className="city-report-section">
        <h2>Resident statement</h2>
        <p className="city-report-narrative" dir="auto">{safeValue(original.description)}</p>
        {report.englishTranslation && (
          <div className="city-report-translation">
            <h3>English translation of the submitted statement</h3>
            <p><strong>Location:</strong> {safeValue(report.englishTranslation.location)}</p>
            <p><strong>Approximate time:</strong> {safeValue(report.englishTranslation.approximateTime)}</p>
            <p className="city-report-narrative">{safeValue(report.englishTranslation.description)}</p>
            <p className="city-report-note">Translation is provided to assist staff; refer to the original submission above.</p>
          </div>
        )}
      </section>

      <section className="city-report-section">
        <h2>Resident follow-up details</h2>
        <dl className="city-report-facts">
          <div><dt>Name</dt><dd dir="auto">{safeValue(original.name)}</dd></div>
          <div><dt>Email</dt><dd>{safeValue(original.email)}</dd></div>
          <div><dt>Phone</dt><dd>{safeValue(original.phone)}</dd></div>
        </dl>
      </section>

      <section className="city-report-section">
        <h2>Attached evidence</h2>
        {report.evidence.length ? (
          <>
            <ul className="city-report-evidence">
              {report.evidence.map((item, index) => (
                <li key={`${index}-${item.name}`}>
                  {item.name} — {item.type}, {Math.max(1, Math.round(item.size / 1024))} KB
                </li>
              ))}
            </ul>
            <p className="city-report-note">
              Evidence files are not embedded in this printout. Review them in the public City staff view.
            </p>
          </>
        ) : (
          <p>No evidence files were attached.</p>
        )}
      </section>

      <section className="city-report-section city-report-triage">
        <h2>AI summary and triage · unverified suggestion</h2>
        {report.analysis && report.analysisStatus === 'complete' ? (
          <>
            <p className="city-report-ai-summary"><strong>AI report summary:</strong> {report.analysis.summary}</p>
            <p><strong>Suggested urgency:</strong> {report.analysis.urgency}</p>
            <p><strong>Suggested category:</strong> {report.analysis.suggestedCategory.replaceAll('_', ' ')}</p>
            <p><strong>Suggested next step:</strong> {report.analysis.recommendedAction}</p>
            <p className="city-report-note">
              Automated suggestions are not verified findings, an official assessment, or emergency dispatch instructions.
            </p>
          </>
        ) : (
          <p>
            {report.analysisStatus === 'pending'
              ? 'The AI summary and triage suggestions are still being prepared.'
              : 'The AI summary is unavailable. The original report details remain saved.'}
          </p>
        )}
      </section>

      <footer className="city-report-footer">
        <p>
          Prepared from information submitted by a resident through TrafficSignal. Resident observations have not
          been independently verified. Confirm details before taking action; this report is not an emergency dispatch record.
        </p>
        <p>Printout generated {formatDateTime(generatedAt)} · Public resident-submitted information.</p>
      </footer>
    </article>
  );
}
