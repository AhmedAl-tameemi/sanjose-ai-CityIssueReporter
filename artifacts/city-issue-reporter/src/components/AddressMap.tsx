import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LocateFixed } from 'lucide-react';
import VoiceInputButton from './VoiceInputButton';
import { useLanguage } from '../i18n';
import type { ReportDraft } from '../types/report';

type Point = { lat: number; lng: number };
type AddressResult = {
  lat: string;
  lon: string;
  display_name: string;
  address?: { house_number?: string; road?: string; pedestrian?: string; city?: string; town?: string };
};

const defaultCenter: Point = { lat: 37.3382, lng: -121.8863 };
const endpoint = 'https://nominatim.openstreetmap.org';
// Public Nominatim permits at most one request per second and no autocomplete.
let nextLookupAt = 0;
let lookupQueue: Promise<void> = Promise.resolve();
function lookup(path: string, signal: AbortSignal): Promise<unknown> {
  const pending = lookupQueue.then(async () => {
    const delay = Math.max(0, nextLookupAt - Date.now());
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    nextLookupAt = Date.now() + 1100;
    const response = await fetch(`${endpoint}${path}`, {
      signal,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`Address lookup failed: ${response.status}`);
    return response.json();
  });
  lookupQueue = pending.then(() => undefined, () => undefined);
  return pending;
}

function isStreetAddress(result: AddressResult | undefined): result is AddressResult {
  return Boolean(
    result?.address?.house_number &&
    (result.address.road || result.address.pedestrian) &&
    Number.isFinite(Number(result.lat)) &&
    Number.isFinite(Number(result.lon)),
  );
}

function isAtPin(result: AddressResult, point: Point): boolean {
  const north = (Number(result.lat) - point.lat) * 111_000;
  const east = (Number(result.lon) - point.lng) * 111_000 * Math.cos(point.lat * Math.PI / 180);
  return Math.hypot(north, east) <= 25;
}

const redPin = L.divIcon({
  className: 'address-pin',
  html: '<span aria-hidden="true"></span>',
  iconSize: [28, 38],
  iconAnchor: [14, 37],
});

type Props = {
  draft: ReportDraft;
  error?: string;
  onPatch: (patch: Partial<ReportDraft>) => void;
  onError: (message?: string) => void;
  onSearching: (searching: boolean) => void;
};

export default function AddressMap({ draft, error, onPatch, onError, onSearching }: Props) {
  const { t } = useLanguage();
  const translateRef = useRef(t);
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.Marker | null>(null);
  const lookupController = useRef<AbortController | null>(null);
  const draftRef = useRef(draft);
  const patchRef = useRef(onPatch);
  const [searching, setSearching] = useState(false);
  const [locationStatus, setLocationStatus] = useState<'idle' | 'loading' | 'success' | 'denied' | 'unavailable'>('idle');
  const applyPointRef = useRef<(point: Point, recenter?: boolean) => void>(() => undefined);
  const locationRequest = useRef(0);
  translateRef.current = t;
  draftRef.current = draft;
  patchRef.current = onPatch;

  useEffect(() => {
    if (!element.current) return;
    let active = true;
    const saved = draftRef.current;
    const hasPin = Number.isFinite(saved.pinLatitude) && Number.isFinite(saved.pinLongitude);
    const point = hasPin
      ? { lat: saved.pinLatitude!, lng: saved.pinLongitude! }
      : defaultCenter;
    const instance = L.map(element.current, {
      center: [point.lat, point.lng],
      zoom: hasPin ? 17 : 12,
      zoomControl: true,
    });
    map.current = instance;
    const resizeObserver = new ResizeObserver(() => {
      instance.invalidateSize({ pan: false });
    });
    resizeObserver.observe(element.current);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(instance);
    const applyPoint = (pin: Point, recenter = false) => {
      lookupController.current?.abort();
      const controller = new AbortController();
      lookupController.current = controller;
      patchRef.current({
        location: translateRef.current('mapPinLocation', {
          latitude: pin.lat.toFixed(5),
          longitude: pin.lng.toFixed(5),
        }),
        searchedAddress: '',
        pinLatitude: pin.lat,
        pinLongitude: pin.lng,
      });
      if (recenter) instance.setView([pin.lat, pin.lng], 17);
      marker.current?.setLatLng([pin.lat, pin.lng]);
      marker.current?.dragging?.enable();
      void lookup(
        `/reverse?format=jsonv2&addressdetails=1&zoom=18&lat=${pin.lat}&lon=${pin.lng}`,
        controller.signal,
      ).then((result) => {
        if (!active || controller.signal.aborted) return;
        const address = result as AddressResult;
        if (isStreetAddress(address) && isAtPin(address, pin)) {
          patchRef.current({ location: address.display_name, searchedAddress: address.display_name });
        }
      }).catch(() => {
        // The coordinate-based pin location remains usable if address lookup fails.
      });
    };
    applyPointRef.current = applyPoint;
    const onDrag = () => {
      const position = marker.current?.getLatLng();
      if (!position) return;
      locationRequest.current += 1;
      setLocationStatus('idle');
      applyPoint({ lat: position.lat, lng: position.lng });
    };
    const createMarker = (position: Point) => {
      const pin = L.marker([position.lat, position.lng], { icon: redPin, draggable: true }).addTo(instance);
      pin.getElement()?.setAttribute('data-testid', 'map-pin');
      pin.on('dragend', onDrag);
      marker.current = pin;
    };
    createMarker(point);
    // Leaflet must measure the mounted map container after layout.
    requestAnimationFrame(() => { if (active) instance.invalidateSize(); });
    return () => {
      active = false;
      locationRequest.current += 1;
      lookupController.current?.abort();
      lookupController.current = null;
      marker.current = null;
      map.current = null;
      applyPointRef.current = () => undefined;
      resizeObserver.disconnect();
      instance.remove();
      onSearching(false);
    };
  }, []);

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocationStatus('unavailable');
      return;
    }
    const request = ++locationRequest.current;
    setLocationStatus('loading');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (!map.current || request !== locationRequest.current) return;
        setLocationStatus('success');
        onError(undefined);
        applyPointRef.current({ lat: coords.latitude, lng: coords.longitude }, true);
      },
      (error) => {
        if (!map.current || request !== locationRequest.current) return;
        if (error.code === error.PERMISSION_DENIED) setLocationStatus('denied');
        else setLocationStatus('unavailable');
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );
  };

  const editAddress = (value: string) => {
    locationRequest.current += 1;
    setLocationStatus('idle');
    lookupController.current?.abort();
    setSearching(false);
    onSearching(false);
    onPatch({ location: value, searchedAddress: '', pinLatitude: undefined, pinLongitude: undefined });
    onError(undefined);
  };

  const search = async (spokenAddress?: string) => {
    locationRequest.current += 1;
    setLocationStatus('idle');
    const address = (spokenAddress ?? draft.location).trim();
    if (!address) {
      onError(t('errorRequired'));
      return;
    }
    lookupController.current?.abort();
    const controller = new AbortController();
    lookupController.current = controller;
    marker.current?.dragging?.disable();
    onPatch({ searchedAddress: '' });
    setSearching(true);
    onSearching(true);
    onError(undefined);
    try {
      const params = new URLSearchParams({
        q: address,
        format: 'jsonv2',
        addressdetails: '1',
        limit: '5',
      });
      const results = await lookup(`/search?${params}`, controller.signal) as AddressResult[];
      if (controller.signal.aborted) return;
      const found = results.find(isStreetAddress);
      if (!found) {
        onError(t('addressInvalid'));
        return;
      }
      const position = { lat: Number(found.lat), lng: Number(found.lon) };
      onPatch({
        location: found.display_name,
        searchedAddress: found.display_name,
        pinLatitude: position.lat,
        pinLongitude: position.lng,
      });
      map.current?.setView([position.lat, position.lng], 17);
      if (marker.current) {
        marker.current.setLatLng([position.lat, position.lng]);
        marker.current.dragging?.enable();
      }
    } catch {
      if (!controller.signal.aborted) onError(t('mapUnavailable'));
    } finally {
      if (!controller.signal.aborted) {
        marker.current?.dragging?.enable();
        setSearching(false);
        onSearching(false);
      }
    }
  };

  return (
    <div className={`field address-field ${error ? 'has-error' : ''}`}>
      <h4 className="address-heading">{t('locationLabel')} <span className="required">*</span></h4>
      <p className="address-instruction">{t('locationSearchHint')}</p>
      <div className="location-permission">
        <p className="address-instruction" id="location-permission-note">{t('locationPermissionHint')}</p>
        <button
          type="button"
          className="button button-secondary current-location-button"
          onClick={useCurrentLocation}
          disabled={locationStatus === 'loading' || searching}
          aria-busy={locationStatus === 'loading'}
          aria-describedby="location-permission-note"
          data-testid="button-use-current-location"
        >
          <LocateFixed size={16} aria-hidden="true" />
          {locationStatus === 'loading' ? t('locatingYou') : t('useCurrentLocation')}
        </button>
        {locationStatus === 'success' && <p className="location-status" role="status" data-testid="status-current-location">{t('locationSet')}</p>}
        {locationStatus === 'denied' && <p className="location-status location-status-error" role="alert" data-testid="status-location-error">{t('locationPermissionDenied')}</p>}
        {locationStatus === 'unavailable' && <p className="location-status location-status-error" role="alert" data-testid="status-location-error">{t('locationUnavailable')}</p>}
      </div>
      <div className="field-label-row">
        <label htmlFor="street-address">{t('streetAddress')} <span className="required">*</span></label>
        <VoiceInputButton
          field={t('streetAddress')}
          disabled={searching}
          testId="button-voice-location"
          onTranscript={(transcript) => { editAddress(transcript); void search(transcript); }}
        />
      </div>
      <input
        id="street-address"
        type="text"
        value={draft.location}
        onChange={(event) => editAddress(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            if (!searching) void search();
          }
        }}
        placeholder="200 E Santa Clara St, San José, CA 95113"
        dir="auto"
        aria-invalid={Boolean(error)}
        aria-describedby={error ? 'address-error' : undefined}
        data-testid="input-location"
      />
      <button type="button" className="button button-primary address-search" onClick={() => void search()} disabled={searching} data-testid="button-search-address">
        {searching ? t('searchingAddress') : t('searchRequired')}
      </button>
      {error && <span id="address-error" className="error-text" role="alert">{error}</span>}
      <p className="address-instruction">{t('dragPinHint')}</p>
      <div className="address-map-frame">
        <div ref={element} className="address-map" role="region" aria-label={t('locationMap')} data-testid="map-location" />
      </div>
    </div>
  );
}