type Props = { src: string; type: string; name: string; onError?: () => void };

export default function EvidencePlayer({ src, type, name, onError }: Props) {
  if (type.startsWith('video/')) {
    return <video className="evidence-media" src={src} controls playsInline preload="metadata" aria-label={name} onError={onError} />;
  }
  if (type.startsWith('audio/')) {
    return <audio className="evidence-media" src={src} controls preload="metadata" aria-label={name} onError={onError} />;
  }
  return <img src={src} alt={name} loading="lazy" onError={onError} />;
}