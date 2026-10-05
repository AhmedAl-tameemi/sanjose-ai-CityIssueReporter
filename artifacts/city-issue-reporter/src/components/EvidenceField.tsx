import { useEffect, useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { useLanguage } from '../i18n';
import { isEvidenceObjectPath, isEvidencePreviewToken, type EvidenceImage } from '../types/report';
import { useResidentEvidencePreview } from '../lib/evidencePreview';
import { evidenceContentType, evidenceSizeLimit, supportedEvidenceTypes } from '../lib/mediaEvidence';
import EvidencePlayer from './EvidencePlayer';
import EvidenceRecorder from './EvidenceRecorder';

type Props = { value?: EvidenceImage; error?: string; onChange: (value?: EvidenceImage) => void; onBusy: (busy: boolean) => void };

export default function EvidenceField({ value, error: externalError, onChange, onBusy }: Props) {
  const { t } = useLanguage();
  const [uploading, setUploading] = useState(false);
  const [captureBusy, setCaptureBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const [localFile, setLocalFile] = useState<File>();
  const [localUrl, setLocalUrl] = useState<string>();
  const input = useRef<HTMLInputElement>(null);
  const uploadController = useRef<AbortController | undefined>(undefined);
  const mounted = useRef(true);
  const busy = uploading || captureBusy;
  const secured = useResidentEvidencePreview(value?.objectPath, value?.previewToken);
  const preview = localUrl ?? secured.url;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; uploadController.current?.abort(); };
  }, []);
  useEffect(() => {
    onBusy(busy);
    return () => onBusy(false);
  }, [busy, onBusy]);
  useEffect(() => {
    if (!localFile) { setLocalUrl(undefined); return; }
    const url = URL.createObjectURL(localFile);
    setLocalUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [localFile]);

  const upload = async (file: File | undefined): Promise<boolean> => {
    if (!file || uploading) return false;
    const type = evidenceContentType(file.type);
    if (!(supportedEvidenceTypes as readonly string[]).includes(type)) {
      setError(t('errorEvidenceType'));
      if (input.current) input.current.value = '';
      return false;
    }
    if (!file.size || file.size > evidenceSizeLimit(type)) {
      setError(t('errorEvidenceSize'));
      if (input.current) input.current.value = '';
      return false;
    }
    const controller = new AbortController();
    uploadController.current = controller;
    setError('');
    setDragging(false);
    setLocalFile(file);
    setUploading(true);
    try {
      const response = await fetch('/api/storage/evidence', {
        method: 'POST', headers: { 'Content-Type': type }, body: file, signal: controller.signal,
      });
      const result = await response.json().catch(() => null) as {
        objectPath?: unknown; contentType?: unknown; size?: unknown; previewToken?: unknown;
      } | null;
      if (!response.ok || !result || !isEvidenceObjectPath(result.objectPath) ||
        result.contentType !== type || typeof result.size !== 'number' || !isEvidencePreviewToken(result.previewToken)) {
        throw new Error('Upload failed');
      }
      if (!mounted.current || controller.signal.aborted) return false;
      onChange({ name: file.name, type, size: result.size, objectPath: result.objectPath, previewToken: result.previewToken });
      return true;
    } catch {
      if (mounted.current && !controller.signal.aborted) setError(t('errorEvidenceUpload'));
      return false;
    } finally {
      if (mounted.current) {
        setUploading(false);
        setLocalFile(undefined);
        if (input.current) input.current.value = '';
      }
    }
  };

  return (
    <div className={`field photo-evidence-field ${dragging ? 'is-dragging' : ''}`} role="group" aria-label={t('evidenceLabel')} data-testid="photo-dropzone"
      onDragOver={(event) => { if (!busy) { event.preventDefault(); setDragging(true); } }}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
      onDrop={(event) => { event.preventDefault(); setDragging(false); if (!busy) void upload(event.dataTransfer.files[0]); }}>
      <label>{t('evidenceLabel')} <span className="optional">({t('optional')})</span></label>
      <span className="hint">{t('evidenceFormats')}</span>
      <button type="button" className="evidence-picker" onClick={() => input.current?.click()} disabled={busy} aria-busy={uploading} data-testid="button-add-evidence">
        <ImagePlus size={18} /><span>{uploading ? t('uploadingSecurely') : value ? t('replaceEvidence') : t('chooseEvidence')}</span>
      </button>
      <input ref={input} className="file-input" type="file" accept={[...supportedEvidenceTypes, 'audio/x-m4a', 'audio/x-wav'].join(',')} onChange={(event) => void upload(event.currentTarget.files?.[0])} aria-label={t('chooseEvidence')} data-testid="input-evidence" />
      <EvidenceRecorder disabled={uploading} hasAttachment={Boolean(value)} onAttach={upload} onBusy={setCaptureBusy} />
      {(value || localFile) && (
        <div className="evidence-preview evidence-preview-media">
          {preview && <EvidencePlayer src={preview} type={localFile?.type ?? value?.type ?? ''} name={localFile?.name ?? value?.name ?? t('evidenceLabel')} />}
          {!localFile && secured.isLoading && <p className="hint" role="status">{t('evidenceLoading')}</p>}
          {!localFile && secured.error && <p className="error-text" role="alert">{t('evidenceLoadError')}</p>}
          <div className="evidence-preview-copy"><strong>{localFile?.name ?? value?.name}</strong><span>{uploading ? t('uploadingSecurely') : t('attached')}</span></div>
          <button type="button" className="evidence-remove" disabled={busy} onClick={() => { onChange(undefined); setError(''); }} aria-label={t('removeEvidence')} data-testid="button-remove-evidence"><X size={16} /></button>
        </div>
      )}
      {(error || externalError) && <span className="error-text" role="alert">{error || externalError}</span>}
    </div>
  );
}