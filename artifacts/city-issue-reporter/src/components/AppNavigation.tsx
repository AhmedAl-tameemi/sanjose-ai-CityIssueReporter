import { CarFront, FilePlus2, FolderClock, House } from 'lucide-react';
import { Link, useLocation, useSearch } from 'wouter';
import { useLanguage } from '../i18n';

export default function AppNavigation() {
  const [location] = useLocation();
  const search = useSearch();
  const { t } = useLanguage();
  const onHistory = location === '/history';
  const onReport = location === '/' && new URLSearchParams(search).get('view') === 'report';
  const onAccidents = location === '/accidents';
  const onHome = location === '/' && !onReport;

  return (
    <nav className="app-nav" aria-label={t('brandName')} data-testid="navigation-app">
      <Link
        href="/"
        className={`app-nav-link ${onHome ? 'active' : ''}`}
        aria-current={onHome ? 'page' : undefined}
        data-testid="nav-home"
      >
        <House size={19} aria-hidden="true" />
        <span>{t('homeNav')}</span>
      </Link>
      <Link
        href="/?view=report"
        className={`app-nav-link ${onReport ? 'active' : ''}`}
        aria-current={onReport ? 'page' : undefined}
        data-testid="nav-report"
      >
        <FilePlus2 size={19} aria-hidden="true" />
        <span>{t('reportNav')}</span>
      </Link>
      <Link
        href="/history"
        className={`app-nav-link ${onHistory ? 'active' : ''}`}
        aria-current={onHistory ? 'page' : undefined}
        data-testid="nav-history"
      >
        <FolderClock size={19} aria-hidden="true" />
        <span>{t('historyNav')}</span>
      </Link>
      <Link
        href="/accidents"
        className={`app-nav-link ${onAccidents ? 'active' : ''}`}
        aria-current={onAccidents ? 'page' : undefined}
        data-testid="nav-accidents"
      >
        <CarFront size={19} aria-hidden="true" />
        <span>{t('accidentsNav')}</span>
      </Link>
    </nav>
  );
}