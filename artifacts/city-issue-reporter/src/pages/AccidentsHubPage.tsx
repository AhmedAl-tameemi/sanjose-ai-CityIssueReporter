import { useSearch } from 'wouter';
import { useState } from 'react';
import AccidentsPage from './AccidentsPage';
import IncidentMapPage from './IncidentMapPage';

export default function AccidentsHubPage() {
  const search = useSearch();
  const [accidentType, setAccidentType] = useState('');
  return new URLSearchParams(search).get('view') === 'map'
    ? <IncidentMapPage accidentType={accidentType} onAccidentTypeChange={setAccidentType} />
    : <AccidentsPage accidentType={accidentType} onAccidentTypeChange={setAccidentType} />;
}
