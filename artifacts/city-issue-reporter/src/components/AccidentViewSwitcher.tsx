import { List, MapPinned } from 'lucide-react';
import { Link, useSearch } from 'wouter';
import { useLanguage } from '../i18n';
import '../accident-views.css';

export default function AccidentViewSwitcher() {
  const { t, language, direction } = useLanguage();
  const isMap = new URLSearchParams(useSearch()).get('view') === 'map';
  return (
    <nav className="accident-views" aria-label={t('accidentsNav')} lang={language} dir={direction}>
      <Link href="/accidents" className={isMap ? '' : 'active'} aria-current={!isMap ? 'page' : undefined} data-testid="view-accidents-list">
        <List size={18} aria-hidden="true" />
        {t('accidentListView')}
      </Link>
      <Link href="/accidents?view=map" className={isMap ? 'active' : ''} aria-current={isMap ? 'page' : undefined} data-testid="view-accidents-map">
        <MapPinned size={18} aria-hidden="true" />
        {t('accidentMapView')}
      </Link>
    </nav>
  );
}
