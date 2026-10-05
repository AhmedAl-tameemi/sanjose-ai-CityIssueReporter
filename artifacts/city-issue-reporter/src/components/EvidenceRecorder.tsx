import { useEffect, useRef, useState } from 'react';
import { Mic, Square, Video, X } from 'lucide-react';
import { useLanguage } from '../i18n';
import { evidenceContentType, evidenceSizeLimit, recordingMimeType } from '../lib/mediaEvidence';
import EvidencePlayer from './EvidencePlayer';

type Props = {
  disabled: boolean;
  hasAttachment: boolean;
  onAttach: (file: File) => Promise<boolean>;
  onBusy: (busy: boolean) => void;
};

export default function EvidenceRecorder({ disabled, hasAttachment, onAttach, onBusy }: Props) {
  const { t } = useLanguage();
  const [phase, setPhase] = useState<'idle' | 'requesting' | 'recording' | 'preview'>('idle');
  const [kind, setKind] = useState<'audio' | 'video'>('audio');
  const [seconds, setSeconds] = useState(0);
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState<string>();
  const [error, setError] = useState('');
  const stream = useRef<MediaStream | undefined>(undefined);
  const recorder = useRef<MediaRecorder | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const liveVideo = useRef<HTMLVideoElement>(null);
  const requestId = useRef(0);
  const mounted = useRef(true);

  const stopDevices = () => {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = undefined;
    if (timer.current) clearInterval(timer.current);
    timer.current = undefined;
  };
  const stopRecording = () => {
    if (recorder.current?.state === 'recording') recorder.current.stop();
    stopDevices();
  };
  const discard = () => {
    requestId.current += 1;
    stopRecording();
    setFile(undefined);
    setPhase('idle');
  };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      requestId.current += 1;
      stopRecording();
    };
  }, []);
  useEffect(() => {
    const onVisibilityChange = () => {
      if (!document.hidden) return;
      if (phase === 'recording') stopRecording();
      else if (phase === 'requesting') discard();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [phase]);
  useEffect(() => {
    onBusy(phase !== 'idle');
    return () => onBusy(false);
  }, [phase, onBusy]);
  useEffect(() => {
    if (!file) { setPreview(undefined); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    if (phase === 'recording' && liveVideo.current && stream.current) {
      liveVideo.current.srcObject = stream.current;
      void liveVideo.current.play().catch(() => undefined);
    }
  }, [phase]);

  const start = async (nextKind: 'audio' | 'video') => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError(t('recordUnsupported'));
      return;
    }
    const request = ++requestId.current;
    setKind(nextKind);
    setError('');
    setSeconds(0);
    setPhase('requesting');
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: nextKind === 'video' ? { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } : false,
      });
      if (!mounted.current || request !== requestId.current || document.hidden) {
        media.getTracks().forEach((track) => track.stop());
        if (mounted.current && request === requestId.current) setPhase('idle');
        return;
      }
      stream.current = media;
      const mimeType = recordingMimeType(nextKind);
      const capture = new MediaRecorder(media, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: 128000,
        ...(nextKind === 'video' ? { videoBitsPerSecond: 2500000 } : {}),
      });
      recorder.current = capture;
      const chunks: Blob[] = [];
      let bytes = 0;
      capture.ondataavailable = ({ data }) => {
        if (!data.size) return;
        chunks.push(data);
        bytes += data.size;
        if (bytes >= evidenceSizeLimit(capture.mimeType)) stopRecording();
      };
      capture.onstop = () => {
        stopDevices();
        if (!mounted.current || request !== requestId.current) return;
        const type = evidenceContentType(capture.mimeType || chunks[0]?.type || '');
        const blob = new Blob(chunks, { type });
        if (!blob.size || blob.size > evidenceSizeLimit(type)) {
          setError(t('errorEvidenceSize'));
          setPhase('idle');
          return;
        }
        const extension = type.includes('mp4') ? 'mp4' : type.includes('ogg') ? 'ogg' : 'webm';
        setFile(new File([blob], `incident-${nextKind}-${Date.now()}.${extension}`, { type }));
        setPhase('preview');
      };
      capture.onerror = () => {
        requestId.current += 1;
        stopRecording();
        if (mounted.current) { setError(t('recordAccessError')); setPhase('idle'); }
      };
      media.getTracks().forEach((track) => track.addEventListener('ended', stopRecording, { once: true }));
      capture.start(1000);
      setPhase('recording');
      const startedAt = Date.now();
      timer.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startedAt) / 1000);
        setSeconds(Math.min(30, elapsed));
        if (elapsed >= 30) stopRecording();
      }, 200);
    } catch {
      if (!mounted.current || request !== requestId.current) return;
      stopDevices();
      setError(t('recordAccessError'));
      setPhase('idle');
    }
  };

  return (
    <div className="evidence-recorder">
      <p className="hint">{t('recordPermissionHint')}</p>
      {phase === 'idle' && (
        <div className="record-actions">
          <button type="button" className="button button-secondary" disabled={disabled} onClick={() => void start('audio')} data-testid="button-record-audio"><Mic size={16} />{t('recordAudio')}</button>
          <button type="button" className="button button-secondary" disabled={disabled} onClick={() => void start('video')} data-testid="button-record-video"><Video size={16} />{t('recordVideo')}</button>
        </div>
      )}
      {phase === 'requesting' && <p role="status">{t('recordPermissionWait')}</p>}
      {phase === 'recording' && (
        <div className="recording-panel">
          {kind === 'video' && <video ref={liveVideo} className="evidence-media" muted playsInline aria-label={t('recordVideo')} />}
          <p className="recording-status" role="status"><span aria-hidden="true" />{t('recordingStatus', { seconds })}</p>
          <button type="button" className="button button-primary" onClick={stopRecording} data-testid="button-stop-recording"><Square size={15} />{t('stopRecording')}</button>
        </div>
      )}
      {phase === 'preview' && file && preview && (
        <div className="recording-panel">
          <p className="hint">{t('recordPreviewHint')}</p>
          <EvidencePlayer src={preview} type={file.type} name={file.name} />
          <button type="button" className="button button-primary" disabled={disabled} onClick={async () => { if (await onAttach(file)) discard(); }} data-testid="button-attach-recording">{hasAttachment ? t('replaceEvidence') : t('attachRecording')}</button>
        </div>
      )}
      {phase !== 'idle' && <button type="button" className="button button-link" disabled={disabled} onClick={discard} data-testid="button-discard-recording"><X size={15} />{t('discardRecording')}</button>}
      {error && <p className="error-text" role="alert">{error}</p>}
    </div>
  );
}