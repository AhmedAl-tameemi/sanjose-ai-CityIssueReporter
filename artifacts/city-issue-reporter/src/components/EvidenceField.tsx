import { useEffect, useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { useLanguage } from '../i18n';
import { isEvidenceObjectPath, isEvidencePreviewToken, type EvidenceImage } from '../types/report';
import { useResidentEvidencePreview } from '../lib/evidencePreview';
import {
  evidenceContentType,
  evidenceSizeLimit,
  maxEvidenceAttachments,
  supportedEvidenceTypes,
  sendEvidenceFile,
  uploadEvidenceBatch,
  validateEvidenceSelection,
} from '../lib/mediaEvidence';
import EvidencePlayer from './EvidencePlayer';
import EvidenceRecorder from './EvidenceRecorder';

type Props = {
  value?: EvidenceImage[];
  error?: string;
  onChange: (value: EvidenceImage[]) => void;
  onBusy: (busy: boolean) => void;
};

type PendingUpload = {
  id: number;
  file: File;
  replaces?: string;
  state: 'queued' | 'uploading' | 'failed';
  progress?: number;
};

function EvidenceAttachment({
  evidence,
  index,
  disabled,
  onReplace,
  onRemove,
  replaceLabel,
  removeLabel,
  loadingLabel,
  loadErrorLabel,
  attachedLabel,
}: {
  evidence: EvidenceImage;
  index: number;
  disabled: boolean;
  onReplace: () => void;
  onRemove: () => void;
  replaceLabel: string;
  removeLabel: string;
  loadingLabel: string;
  loadErrorLabel: string;
  attachedLabel: string;
}) {
  const secured = useResidentEvidencePreview(evidence.objectPath, evidence.previewToken);
  return (
    <div className="evidence-preview evidence-preview-media" data-testid={`evidence-item-${index}`}>
      {secured.url && <EvidencePlayer src={secured.url} type={evidence.type} name={evidence.name} />}
      {secured.isLoading && <p className="hint" role="status">{loadingLabel}</p>}
      {secured.error && <p className="error-text" role="alert">{loadErrorLabel}</p>}
      <div className="evidence-preview-copy">
        <strong>{evidence.name}</strong>
        <span>{attachedLabel} · {Math.max(1, Math.round(evidence.size / 1024))} KB</span>
      </div>
      <button type="button" className="button button-link" disabled={disabled} onClick={onReplace} aria-label={`${replaceLabel}: ${evidence.name}`} data-testid={`button-replace-evidence-${index}`}>
        {replaceLabel}
      </button>
      <button type="button" className="evidence-remove" disabled={disabled} onClick={onRemove} aria-label={`${removeLabel}: ${evidence.name}`} data-testid={`button-remove-evidence-${index}`}>
        <X size={16} />
      </button>
    </div>
  );
}

export default function EvidenceField({ value = [], error: externalError, onChange, onBusy }: Props) {
  const { t } = useLanguage();
  const [uploading, setUploading] = useState(false);
  const [captureBusy, setCaptureBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const nextUploadId = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  const uploadController = useRef<AbortController | undefined>(undefined);
  const replacingIndex = useRef<number | undefined>(undefined);
  const mounted = useRef(true);
  const busy = uploading || captureBusy;
  const canAdd = value.length < maxEvidenceAttachments;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      uploadController.current?.abort();
    };
  }, []);
  useEffect(() => {
    onBusy(busy);
    return () => onBusy(false);
  }, [busy, onBusy]);

  const updatePending = (id: number, changes: Partial<PendingUpload>) => {
    if (mounted.current) setPending((items) => items.map((item) => item.id === id ? { ...item, ...changes } : item));
  };

  const uploadFiles = async (selectedFiles: readonly File[], replaceIndex?: number, retry?: PendingUpload): Promise<boolean> => {
    if (!selectedFiles.length || uploadController.current || uploading) return false;
    const files = replaceIndex === undefined ? [...selectedFiles] : [selectedFiles[0]!];
    for (const file of files) {
      const type = evidenceContentType(file.type);
      if (!(supportedEvidenceTypes as readonly string[]).includes(type)) {
        setError(t('errorEvidenceType'));
        return false;
      }
      if (!file.size || file.size > evidenceSizeLimit(type)) {
        setError(t('errorEvidenceSize'));
        return false;
      }
    }

    const selectionError = validateEvidenceSelection(files, value, replaceIndex);
    if (selectionError) {
      setError(t(selectionError === 'count' ? 'errorEvidenceCount' : 'errorEvidenceCombinedSize'));
      return false;
    }
    const entries: PendingUpload[] = retry
      ? [{ ...retry, state: 'queued', progress: undefined }]
      : files.map((file) => ({
        id: ++nextUploadId.current,
        file,
        replaces: replaceIndex === undefined ? undefined : value[replaceIndex]?.objectPath,
        state: 'queued',
      }));
    setPending((items) => [
      ...items.filter((item) => item.id !== retry?.id &&
        !(replaceIndex !== undefined && item.replaces === value[replaceIndex]?.objectPath)),
      ...entries,
    ]);
    setError('');
    const controller = new AbortController();
    uploadController.current = controller;
    setDragging(false);
    setUploading(true);
    try {
      const result = await uploadEvidenceBatch(
        files,
        value,
        async (file): Promise<EvidenceImage> => {
          const entry = entries.find((item) => item.file === file)!;
          updatePending(entry.id, { state: 'uploading', progress: undefined });
          try {
            const type = evidenceContentType(file.type);
            const uploaded = await sendEvidenceFile(file, controller.signal, (progress) => {
              updatePending(entry.id, { progress });
            }) as {
              objectPath?: unknown;
              contentType?: unknown;
              size?: unknown;
              previewToken?: unknown;
            } | null;
            if (!uploaded || !isEvidenceObjectPath(uploaded.objectPath) ||
              uploaded.contentType !== type || uploaded.size !== file.size ||
              !isEvidencePreviewToken(uploaded.previewToken)) {
              throw new Error('Evidence upload failed.');
            }
            if (mounted.current && !controller.signal.aborted) {
              setPending((items) => items.filter((item) => item.id !== entry.id));
            }
            return {
              name: file.name,
              type,
              size: uploaded.size,
              objectPath: uploaded.objectPath,
              previewToken: uploaded.previewToken,
            };
          } catch (cause) {
            if (!controller.signal.aborted) updatePending(entry.id, { state: 'failed', progress: undefined });
            throw cause;
          }
        },
        (attachments) => { if (mounted.current && !controller.signal.aborted) onChange(attachments); },
        replaceIndex,
        controller.signal,
      );
      if (result.error === 'count') setError(t('errorEvidenceCount'));
      else if (result.error === 'combined-size') setError(t('errorEvidenceCombinedSize'));
      // The parent now owns every accepted file, including retryable failures.
      // Release the recorder's duplicate preview so it cannot block its Retry button.
      return !result.error;
    } catch {
      if (mounted.current && !controller.signal.aborted) setError(t('errorEvidenceUpload'));
      return false;
    } finally {
      if (uploadController.current === controller) uploadController.current = undefined;
      if (mounted.current) {
        setUploading(false);
        if (input.current) input.current.value = '';
      }
    }
  };

  const openPicker = (replaceIndex?: number) => {
    replacingIndex.current = replaceIndex;
    if (input.current) {
      input.current.multiple = replaceIndex === undefined;
      input.current.value = '';
    }
    input.current?.click();
  };

  return (
    <div
      className={`field photo-evidence-field ${dragging ? 'is-dragging' : ''}`}
      role="group"
      aria-label={t('evidenceLabel')}
      data-testid="photo-dropzone"
      onDragOver={(event) => { if (!busy && canAdd) { event.preventDefault(); setDragging(true); } }}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        if (!busy && canAdd) void uploadFiles(Array.from(event.dataTransfer.files));
      }}
    >
      <label>{t('evidenceLabel')} <span className="optional">({t('optional')})</span></label>
      <span className="hint">{t('evidenceFormats')}</span>
      <button
        type="button"
        className="evidence-picker"
        onClick={() => openPicker()}
        disabled={busy || !canAdd}
        aria-busy={uploading}
        data-testid="button-add-evidence"
      >
        <ImagePlus size={18} /><span>{uploading ? t('uploadingSecurely') : t('chooseEvidence')}</span>
      </button>
      <input
        ref={input}
        className="file-input"
        type="file"
        multiple
        accept={[...supportedEvidenceTypes, 'audio/x-m4a', 'audio/x-wav'].join(',')}
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          const target = replacingIndex.current;
          replacingIndex.current = undefined;
          void uploadFiles(files, target);
        }}
        aria-label={t('chooseEvidence')}
        data-testid="input-evidence"
      />
      <EvidenceRecorder
        disabled={uploading}
        canAttach={canAdd}
        onAttach={(file) => uploadFiles([file])}
        onBusy={setCaptureBusy}
      />
      {value.map((evidence, index) => (
        <EvidenceAttachment
          key={evidence.objectPath}
          evidence={evidence}
          index={index}
          disabled={busy}
          replaceLabel={t('replaceEvidence')}
          removeLabel={t('removeEvidence')}
          loadingLabel={t('evidenceLoading')}
          loadErrorLabel={t('evidenceLoadError')}
          attachedLabel={t('attached')}
          onReplace={() => openPicker(index)}
          onRemove={() => {
            onChange(value.filter((_, itemIndex) => itemIndex !== index));
            setPending((items) => items.filter((item) => item.replaces !== evidence.objectPath));
            setError('');
          }}
        />
      ))}
      {pending.map((item) => (
        <div className="evidence-preview evidence-upload-row" key={item.id} data-testid={`evidence-upload-${item.id}`}>
          <div className="evidence-preview-copy">
            <strong>{item.file.name}</strong>
            <span role={item.state === 'failed' ? 'alert' : 'status'}>
              {item.state === 'failed' && `${item.file.name}: `}
              {item.state === 'failed' ? t('evidenceUploadFailed') :
                item.state === 'queued' ? t('evidenceUploadQueued') :
                  item.progress === 100 ? t('evidenceUploadFinishing') :
                    `${t('uploadingSecurely')}${item.progress === undefined ? '' : ` ${item.progress}%`}`}
            </span>
            {item.state === 'uploading' && (
              <progress max={100} value={item.progress} aria-label={`${t('uploadingSecurely')}: ${item.file.name}`} />
            )}
          </div>
          {item.state === 'failed' && (
            <>
              <button type="button" className="button button-link" disabled={busy}
                aria-label={`${t('retryEvidenceUpload')}: ${item.file.name}`}
                onClick={() => {
                  const target = item.replaces ? value.findIndex((attachment) => attachment.objectPath === item.replaces) : undefined;
                  if (target === -1) {
                    setPending((items) => items.filter((entry) => entry.id !== item.id));
                    return;
                  }
                  void uploadFiles([item.file], target, item);
                }}>
                {t('retryEvidenceUpload')}
              </button>
              <button type="button" className="evidence-remove" disabled={busy}
                aria-label={`${t('removeEvidence')}: ${item.file.name}`}
                onClick={() => { setPending((items) => items.filter((entry) => entry.id !== item.id)); setError(''); }}>
                <X size={16} />
              </button>
            </>
          )}
        </div>
      ))}
      {(error || externalError) && <span className="error-text" role="alert">{error || externalError}</span>}
    </div>
  );
}