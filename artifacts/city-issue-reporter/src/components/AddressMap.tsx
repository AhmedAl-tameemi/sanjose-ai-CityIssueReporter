import { useEffect, useRef, useState } from 'react';
import { getMapsConfig } from '@workspace/api-client-react';
import { useLanguage } from '../i18n';
import type { ReportDraft } from '../types/report';

type Point = { lat: number; lng: number };
type GooglePosition = { lat(): number; lng(): number };
type GeocodeResult = {
  formatted_address: string;
  address_components: { types: string[] }[];
  geometry: { location: GooglePosition; location_type: string };
  partial_match?: boolean;
  types: string[];
};
type MapHandle = { setCenter(position: Point): void; setZoom(zoom: number): void };
type MarkerHandle = {
  setPosition(position: Point): void;
  setDraggable(draggable: boolean): void;
  getPosition(): GooglePosition | null;
  addListener(event: string, handler: () => void): { remove(): void };
  setMap(map: null): void;
};
type GeocoderHandle = {
  geocode(
    request: { address: string } | { location: Point },
    callback: (results: GeocodeResult[] | null, status: string) => void,
  ): void;
};
type MapsApi = {
  Map: new (element: HTMLElement, options: Record<string, unknown>) => MapHandle;
  Marker: new (options: Record<string, unknown>) => MarkerHandle;
  Geocoder: new () => GeocoderHandle;
  Animation: { DROP: unknown };
};

declare global {
  interface Window {
    google?: { maps: MapsApi };
  }
}

let mapsLoad: Promise<MapsApi> | undefined;
function loadMaps(): Promise<MapsApi> {
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (!mapsLoad) {
    mapsLoad = getMapsConfig().then(({ apiKey }) => new Promise<MapsApi>((resolve, reject) => {
      const callbackName = '__cityIssueMapsReady';
      const callbackWindow = window as Window & { [callbackName]?: () => void };
      const script = document.createElement('script');
      callbackWindow[callbackName] = () => {
        delete callbackWindow[callbackName];
        if (window.google?.maps) resolve(window.google.maps);
        else reject(new Error('Google Maps was unavailable.'));
      };
      script.onerror = () => {
        delete callbackWindow[callbackName];
        reject(new Error('Google Maps could not load.'));
      };
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&callback=${callbackName}&v=weekly`;
      script.async = true;
      document.head.appendChild(script);
    })).catch((error: unknown) => {
      mapsLoad = undefined;
      throw error;
    });
  }
  return mapsLoad;
}

const defaultCenter = { lat: 37.3382, lng: -121.8863 }; // San José, consistent with the example address.
function coordinates(result: GeocodeResult): Point {
  return { lat: result.geometry.location.lat(), lng: result.geometry.location.lng() };
}
function isStreetAddress(result: GeocodeResult): boolean {
  const parts = result.address_components;
  return !result.partial_match &&
    parts.some((part) => part.types.includes('street_number')) &&
    parts.some((part) => part.types.includes('route')) &&
    !['APPROXIMATE', 'GEOMETRIC_CENTER'].includes(result.geometry.location_type);
}
function isAtPin(result: GeocodeResult, point: Point): boolean {
  const target = coordinates(result);
  const latDistance = (target.lat - point.lat) * 111_000;
  const lngDistance = (target.lng - point.lng) * 111_000 * Math.cos(point.lat * Math.PI / 180);
  return Math.hypot(latDistance, lngDistance) <= 25;
}

type Props = {
  draft: ReportDraft;
  error?: string;
  onPatch: (patch: Partial<ReportDraft>) => void;
  onError: (message?: string) => void;
  onSearching: (searching: boolean) => void;
};

export default function AddressMap({ draft, error, onPatch, onError, onSearching }: Props) {
  const { t } = useLanguage();
  const mapElement = useRef<HTMLDivElement>(null);
  const map = useRef<MapHandle | null>(null);
  const marker = useRef<MarkerHandle | null>(null);
  const geocoder = useRef<GeocoderHandle | null>(null);
  const requestVersion = useRef(0);
  const draftRef = useRef(draft);
  const patchRef = useRef(onPatch);
  const errorRef = useRef(onError);
  const translateRef = useRef(t);
  const [mapStatus, setMapStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [searching, setSearching] = useState(false);
  draftRef.current = draft;
  patchRef.current = onPatch;
  errorRef.current = onError;
  translateRef.current = t;

  useEffect(() => {
    let active = true;
    let listener: { remove(): void } | undefined;
    loadMaps().then((maps) => {
      if (!active || !mapElement.current) return;
      const saved = draftRef.current;
      const hasPin = Number.isFinite(saved.pinLatitude) && Number.isFinite(saved.pinLongitude);
      const center = hasPin
        ? { lat: saved.pinLatitude!, lng: saved.pinLongitude! }
        : defaultCenter;
      map.current = new maps.Map(mapElement.current, {
        center,
        zoom: hasPin ? 17 : 12,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
      });
      geocoder.current = new maps.Geocoder();
      if (hasPin) {
        marker.current = new maps.Marker({
          map: map.current,
          position: center,
          draggable: Boolean(saved.searchedAddress && saved.location === saved.searchedAddress),
          icon: 'https://maps.google.com/mapfiles/ms/icons/red-dot.png',
        });
      }
      const attachDrag = () => {
        listener?.remove();
        listener = marker.current?.addListener('dragend', () => {
          const position = marker.current?.getPosition();
          if (!position || !geocoder.current) return;
          const point = { lat: position.lat(), lng: position.lng() };
          const version = ++requestVersion.current;
          // Save the exact pin immediately, independently of reverse-geocoding.
          patchRef.current({ pinLatitude: point.lat, pinLongitude: point.lng });
          geocoder.current.geocode({ location: point }, (results, status) => {
            if (!active || version !== requestVersion.current || status !== 'OK') return;
            const exact = results?.find((result) => isStreetAddress(result) && isAtPin(result, point));
            if (exact) {
              patchRef.current({ location: exact.formatted_address, searchedAddress: exact.formatted_address });
            }
          });
        });
      };
      attachDrag();
      dragListenerRef.current = attachDrag;
      setMapStatus('ready');
    }).catch(() => {
      if (active) setMapStatus('unavailable');
    });
    return () => {
      active = false;
      requestVersion.current++;
      listener?.remove();
      marker.current?.setMap(null);
      marker.current = null;
      map.current = null;
      geocoder.current = null;
      dragListenerRef.current = null;
    };
  }, []);
  const dragListenerRef = useRef<(() => void) | null>(null);

  const editAddress = (value: string) => {
    requestVersion.current++;
    setSearching(false);
    onSearching(false);
    marker.current?.setDraggable(false);
    onPatch({ location: value, searchedAddress: '' });
    onError(undefined);
  };

  const search = () => {
    const address = draft.location.trim();
    if (!address) {
      onError(t('errorRequired'));
      return;
    }
    if (!geocoder.current) {
      onError(t('mapUnavailable'));
      return;
    }
    const version = ++requestVersion.current;
    marker.current?.setDraggable(false);
    onPatch({ searchedAddress: '' });
    setSearching(true);
    onSearching(true);
    onError(undefined);
    geocoder.current.geocode({ address }, (results, status) => {
      if (version !== requestVersion.current) return;
      setSearching(false);
      onSearching(false);
      const match = status === 'OK' ? results?.find(isStreetAddress) : undefined;
      if (!match) {
        onError(status === 'OK' || status === 'ZERO_RESULTS' ? t('addressInvalid') : t('mapUnavailable'));
        return;
      }
      const point = coordinates(match);
      const formatted = match.formatted_address;
      onPatch({ location: formatted, searchedAddress: formatted, pinLatitude: point.lat, pinLongitude: point.lng });
      map.current?.setCenter(point);
      map.current?.setZoom(17);
      if (marker.current) {
        marker.current.setPosition(point);
        marker.current.setDraggable(true);
      } else if (map.current && window.google?.maps) {
        marker.current = new window.google.maps.Marker({
          map: map.current,
          position: point,
          draggable: true,
          icon: 'https://maps.google.com/mapfiles/ms/icons/red-dot.png',
        });
        dragListenerRef.current?.();
      }
    });
  };

  return (
    <div className={`field address-field ${error ? 'has-error' : ''}`}>
      <h4 className="address-heading">{t('locationLabel')} <span className="required">*</span></h4>
      <p className="address-instruction">{t('locationSearchHint')}</p>
      <label htmlFor="street-address">{t('streetAddress')} <span className="required">*</span></label>
      <input
        id="street-address"
        type="text"
        value={draft.location}
        onChange={(event) => editAddress(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            if (!searching) search();
          }
        }}
        placeholder="123 Main St, San José, CA 95112"
        dir="auto"
        aria-invalid={Boolean(error)}
        aria-describedby={error ? 'address-error' : undefined}
        data-testid="input-location"
      />
      <button type="button" className="button button-primary address-search" onClick={search} disabled={searching || mapStatus !== 'ready'} data-testid="button-search-address">
        {searching ? t('searchingAddress') : t('searchRequired')}
      </button>
      {error && <span id="address-error" className="error-text" role="alert">{error}</span>}
      <p className="address-instruction">{t('dragPinHint')}</p>
      <div className="address-map-frame">
        <div ref={mapElement} className="address-map" role="img" aria-label={t('locationMap')} data-testid="map-location" />
        {mapStatus !== 'ready' && (
          <div className="map-overlay" role="status">
            {mapStatus === 'loading' ? t('loadingMap') : t('mapUnavailable')}
          </div>
        )}
      </div>
    </div>
  );
}