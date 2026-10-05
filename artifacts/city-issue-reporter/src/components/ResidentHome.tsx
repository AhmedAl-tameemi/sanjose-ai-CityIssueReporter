import { useEffect, useRef } from 'react';
import { ArrowRight, FilePlus2, FolderClock, ShieldCheck } from 'lucide-react';
import { Link } from 'wouter';
import { useLanguage } from '../i18n';

export default function ResidentHome() {
  const { t } = useLanguage();
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <section className="home-screen" aria-labelledby="home-heading">
      <div className="screen-heading">
        <span className="eyebrow">{t('homeNav')}</span>
        <h1 id="home-heading" ref={headingRef} tabIndex={-1}>{t('homeTitle')}</h1>
        <p>{t('homeIntro')}</p>
      </div>
      <div className="home-actions">
        <Link className="home-action report-action" href="/?view=report" data-testid="button-report-incident">
          <span className="home-action-icon" aria-hidden="true"><FilePlus2 size={25} /></span>
          <strong>{t('reportIncident')}</strong>
          <span className="home-action-description">{t('trustTimeText')}</span>
          <ArrowRight className="home-action-arrow" size={20} aria-hidden="true" />
        </Link>
        <Link className="home-action history-action" href="/history" data-testid="button-view-my-reports">
          <span className="home-action-icon" aria-hidden="true"><FolderClock size={25} /></span>
          <strong>{t('myReports')}</strong>
          <span className="home-action-description">{t('myReportsHint')}</span>
          <ArrowRight className="home-action-arrow" size={20} aria-hidden="true" />
        </Link>
      </div>
      <p className="home-privacy"><ShieldCheck size={17} aria-hidden="true" />{t('trustBuiltText')}</p>
    </section>
  );
}