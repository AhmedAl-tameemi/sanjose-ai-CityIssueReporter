import { useSearch } from 'wouter';
import AccidentsPage from './AccidentsPage';
import IncidentMapPage from './IncidentMapPage';

export default function AccidentsHubPage() {
  const search = useSearch();
  return new URLSearchParams(search).get('view') === 'map'
    ? <IncidentMapPage />
    : <AccidentsPage />;
}
