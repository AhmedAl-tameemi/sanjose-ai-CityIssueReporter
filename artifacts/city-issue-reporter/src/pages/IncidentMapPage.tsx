import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Link } from 'wouter';
import { MapPin } from 'lucide-react';
import {
  getListCityIncidentsQueryKey,
  useListCityIncidents,
  type CityIncident,
  type ListCityIncidentsParams,
} from '@workspace/api-client-react';
import { useLanguage } from '../i18n';
import AppNavigation from '../components/AppNavigation';
import AccidentViewSwitcher from '../components/AccidentViewSwitcher';
import LanguageControl from '../components/LanguageControl';
import '../incident-map.css';

const CENTER: [number, number] = [37.3382, -121.8863];
const INITIAL_BBOX = '-122.0,37.22,-121.75,37.46';
const COLORS: Record<string, string> = {
  fatal: '#8f1d2c', severe: '#d9622b', injury: '#e8b73a', none: '#6fa6a0', unknown: '#9a9a9a',
};
const LABELS: Record<string, string> = {
  fatal: 'Fatal', severe: 'Severe injury', injury: 'Injury', none: 'No injury recorded', unknown: 'Not specified',
};
const PAGE = 100;

const fmt = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Los_Angeles', dateStyle: 'medium', timeStyle: 'short',
});
const fmtDate = (iso: string | null) => (iso ? fmt.format(new Date(iso)) : 'Date not published');

function bboxOf(map: L.Map) {
  const b = map.getBounds();
  const r = (n: number) => n.toFixed(4);
  return `${r(b.getWest())},${r(b.getSouth())},${r(b.getEast())},${r(b.getNorth())}`;
}

export default function IncidentMapPage({ accidentType, onAccidentTypeChange }: {
  accidentType: string;
  onAccidentTypeChange: (value: string) => void;
}) {
  const { direction, language, t } = useLanguage();
  const [bbox, setBbox] = useState(INITIAL_BBOX);
  const [year, setYear] = useState('all');
  const [severity, setSeverity] = useState<'all' | 'fatal' | 'severe' | 'injury' | 'none'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE);
  const [tileErrors, setTileErrors] = useState(0);
  const [knownYears, setKnownYears] = useState<string[]>([]);
  const [knownTypes, setKnownTypes] = useState<string[]>([]);

  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const markers = useRef(new Map<string, L.CircleMarker>());
  const timer = useRef<number | undefined>(undefined);
  const selectRef = useRef(setSelectedId);
  selectRef.current = setSelectedId;

  const params: ListCityIncidentsParams = { bbox, year, severity, accidentType: accidentType || 'all' };
  const query = useListCityIncidents(params, {
    query: {
      queryKey: getListCityIncidentsQueryKey(params),
      staleTime: 300000,
      retry: 1,
    },
  });
  // Never label markers from an earlier area/filter as the current results.
  const data = query.isError ? undefined : query.data;
  const incidents = useMemo(() => data?.incidents ?? [], [data]);
  const years = knownYears;
  const selected = incidents.find((i) => i.id === selectedId) ?? null;

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Accidents — Map | TrafficSignal';
    return () => { document.title = previousTitle; };
  }, []);

  useEffect(() => {
    if (data?.availableYears) setKnownYears(data.availableYears);
    if (data?.availableTypes) setKnownTypes(data.availableTypes);
  }, [data]);

  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;
    const map = L.map(mapEl.current, {
      center: CENTER, zoom: 12, minZoom: 10, maxZoom: 18,
      maxBounds: [[37.0, -122.15], [37.55, -121.5]],
      maxBoundsViscosity: 0.9,
    });
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
    }).addTo(map);
    tiles.on('tileerror', () => setTileErrors((n) => n + 1));
    tiles.on('tileload', () => setTileErrors(0));
    layerRef.current = L.layerGroup().addTo(map);
    const onMove = () => {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setBbox(bboxOf(map)), 600);
    };
    map.on('moveend', onMove);
    mapRef.current = map;
    tileRef.current = tiles;
    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize({ pan: false });
      onMove();
    });
    resizeObserver.observe(mapEl.current);
    onMove();
    return () => {
      window.clearTimeout(timer.current);
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      tileRef.current = null;
      layerRef.current = null;
      markers.current.clear();
    };
  }, []);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.clearLayers();
    markers.current.clear();
    for (const i of incidents) {
      const m = L.circleMarker([i.latitude, i.longitude], {
        radius: 7, color: '#1f2d2b', weight: 1.5, fillColor: COLORS[i.severity] ?? COLORS.unknown, fillOpacity: 0.85,
      });
      m.on('click', () => selectRef.current(i.id));
      m.addTo(layer);
      markers.current.set(i.id, m);
    }
  }, [incidents]);

  useEffect(() => {
    markers.current.forEach((m, id) => {
      m.setStyle(id === selectedId ? { radius: 11, weight: 3 } : { radius: 7, weight: 1.5 });
      if (id === selectedId) m.bringToFront();
    });
  }, [selectedId, incidents]);

  const choose = (i: CityIncident) => {
    setSelectedId(i.id);
    mapRef.current?.panTo([i.latitude, i.longitude]);
  };

  const retryTiles = () => { setTileErrors(0); tileRef.current?.redraw(); };
  const failed = query.isError;
  const tileFailed = tileErrors >= 3;
  const loading = query.isFetching;

  return (
    <div className="app-shell" dir={direction} lang={language}>
      <header className="site-header">
        <Link className="brand" href="/" data-testid="link-brand-incident-map">
          <span className="brand-mark" aria-hidden="true"><MapPin /></span>
          <span className="brand-name">TrafficSignal</span>
        </Link>
        <div className="header-actions"><LanguageControl /></div>
      </header>
      <AppNavigation />
      <main className="page-wrap">
        <div className="im-page" lang="en" dir="ltr">
          <AccidentViewSwitcher />
          <span className="eyebrow" lang={language} dir={direction}>{t('accidentsNav')}</span>
          <h1>Historical traffic collisions</h1>
          <p className="im-lede">
            Published City of San José collision records. This is historical data, not live emergencies and not reports submitted to TrafficSignal. For emergencies, call 911.
          </p>

          <div className="im-filters">
            <label>Accident type
              <select value={accidentType} onChange={(e) => { onAccidentTypeChange(e.target.value); setShown(PAGE); setSelectedId(null); }} data-testid="select-incident-type">
                <option value="">All types</option>
                {knownTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                {accidentType && !knownTypes.includes(accidentType) && <option value={accidentType}>{accidentType}</option>}
              </select>
            </label>
            <label>Year
              <select value={year} onChange={(e) => { setYear(e.target.value); setShown(PAGE); setSelectedId(null); }} data-testid="select-incident-year">
                <option value="all">All years</option>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
                {year !== 'all' && !years.includes(year) && <option value={year}>{year}</option>}
              </select>
            </label>
            <label>Severity
              <select value={severity} onChange={(e) => { setSeverity(e.target.value as typeof severity); setShown(PAGE); setSelectedId(null); }} data-testid="select-incident-severity">
                <option value="all">All severities</option>
                <option value="fatal">Fatal</option>
                <option value="severe">Severe injury</option>
                <option value="injury">Injury</option>
                <option value="none">No injury recorded</option>
              </select>
            </label>
          </div>

          {data?.truncated && (
            <p className="im-notice" role="status" data-testid="notice-incident-truncated">
              Showing the latest {data.limit.toLocaleString('en-US')} of {data.totalMatched.toLocaleString('en-US')} matching collisions in this area. Not every record is drawn. Zoom in or filter by accident type, year, or severity to see more.
            </p>
          )}

          <div className="im-layout">
            <div className="im-map-wrap">
              <div ref={mapEl} className="im-map" role="region" aria-label="Map of historical collisions in San José. Use the list beside the map to browse incidents with a keyboard." data-testid="map-incidents" />
              {(failed || tileFailed || loading) && (
                <div className={`im-overlay ${failed || tileFailed ? 'error' : ''}`} role={failed || tileFailed ? 'alert' : 'status'}>
                  {failed ? (
                    <>Collision data could not be loaded.<button type="button" className="button button-secondary" onClick={() => query.refetch()} data-testid="button-retry-incidents">Retry</button></>
                  ) : tileFailed ? (
                    <>Map tiles could not be loaded.<button type="button" className="button button-secondary" onClick={retryTiles} data-testid="button-retry-tiles">Retry</button></>
                  ) : 'Loading collisions...'}
                </div>
              )}
            </div>

            <div className="im-side">
              <section className="im-card" aria-labelledby="im-sel">
                <h2 id="im-sel">Selected collision</h2>
                <div aria-live="polite" data-testid="panel-incident-details">
                  {selected ? (
                    <dl>
                      <dt>Date</dt><dd>{fmtDate(selected.occurredAt)} (Pacific)</dd>
                      <dt>Location</dt><dd>{selected.location}</dd>
                      <dt>Type</dt><dd>{selected.collisionType}</dd>
                      <dt>Severity</dt><dd>{LABELS[selected.severity] ?? selected.severity}</dd>
                    </dl>
                  ) : <p className="im-empty" style={{ padding: 0 }}>Select a marker or a list item for details.</p>}
                </div>
              </section>

              <section className="im-card" aria-labelledby="im-list">
                <h2 id="im-list">Collisions in view{data ? ` (${incidents.length.toLocaleString('en-US')})` : ''}</h2>
                <ul className="im-legend" aria-label="Severity colors">
                  {Object.keys(LABELS).map((k) => (
                    <li key={k}><span className="im-dot" style={{ background: COLORS[k] }} />{LABELS[k]}</li>
                  ))}
                </ul>
                {!data && !failed && (
                  <div className="im-list" aria-busy="true"><div className="im-skel" /><div className="im-skel" /><div className="im-skel" /></div>
                )}
                {!data && failed && <p className="im-empty">No data to show.</p>}
                {data && incidents.length === 0 && (
                  <p className="im-empty" data-testid="empty-incidents">No collisions match this area and filters. Pan the map, zoom out, or change the filters.</p>
                )}
                {incidents.length > 0 && (
                  <ul className="im-list" data-testid="list-incidents">
                    {incidents.slice(0, shown).map((i) => (
                      <li key={i.id}>
                        <button type="button" className="im-item" aria-pressed={i.id === selectedId} onClick={() => choose(i)} data-testid={`button-incident-${i.id}`}>
                          <strong>{i.location}</strong>
                          <small>{fmtDate(i.occurredAt)} - {i.collisionType} - {LABELS[i.severity] ?? i.severity}</small>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {incidents.length > shown && (
                  <button type="button" className="button button-secondary" style={{ marginTop: 8 }} onClick={() => setShown((n) => n + PAGE)} data-testid="button-show-more">
                    Show more ({incidents.length - shown} left)
                  </button>
                )}
              </section>
            </div>
          </div>

          {data && (
            <p className="im-source" data-testid="text-incident-source">
              Source: <a href={data.sourceUrl} target="_blank" rel="noopener noreferrer">{data.sourceName}</a>, police records collected by the City DOT. Retrieved {fmtDate(data.fetchedAt)}.
              {years.length > 0 && ` Published years: ${years.at(-1)}–${years[0]}. This is not a live incident feed.`}
              {data.unmappedCount > 0 && ` ${data.unmappedCount.toLocaleString('en-US')} of the returned records have no usable location and are not shown.`}
            </p>
          )}
          {!data && (
            <p className="im-source">
              Source: <a href="https://data.sanjoseca.gov/dataset/crash-locations-last-five-years" target="_blank" rel="noopener noreferrer">City of San José, Crash Locations Last Five Years</a>.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
