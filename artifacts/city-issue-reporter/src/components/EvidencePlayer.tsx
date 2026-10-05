import { useEffect, useState } from 'react';

type Props = { src: string; type: string; name: string; onError?: () => void };

function OggEvidencePlayer({ src, type, name, onError }: Props) {
  const [loaded, setLoaded] = useState<{ src: string; url: string }>();
  useEffect(() => {
    const controller = new AbortController();
    let url: string | undefined;
    // WebKit's Ogg demuxer needs a seekable source. Our authenticated evidence
    // endpoint streams whole files, not byte ranges; a local blob is seekable.
    // Fetch keeps same-origin session cookies and never exposes a capability URL.
    fetch(src, { signal: controller.signal, credentials: 'same-origin' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Evidence could not be loaded.');
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        url = URL.createObjectURL(blob);
        setLoaded({ src, url });
      })
      .catch(() => {
        if (!controller.signal.aborted) onError?.();
      });
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [src, onError]);
  return loaded?.src === src
    ? <EvidencePlayer src={loaded.url} type={type} name={name} onError={onError} />
    : <span aria-busy="true" />;
}

export default function EvidencePlayer({ src, type, name, onError }: Props) {
  if (type === 'audio/ogg' && !src.startsWith('blob:')) {
    return <OggEvidencePlayer src={src} type={type} name={name} onError={onError} />;
  }
  if (type.startsWith('video/')) {
    return <video className="evidence-media" src={src} controls playsInline preload="metadata" aria-label={name} onError={onError} />;
  }
  if (type.startsWith('audio/')) {
    return <audio className="evidence-media" src={src} controls preload="metadata" aria-label={name} onError={onError} />;
  }
  return <img src={src} alt={name} loading="lazy" onError={onError} />;
}