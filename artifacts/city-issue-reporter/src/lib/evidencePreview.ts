import { useEffect, useState } from "react";
import { fetchResidentEvidenceBlob } from "../reportStorage";

export function useResidentEvidencePreview(
  objectPath: string | undefined,
  previewToken: string | undefined,
): { url: string | undefined; isLoading: boolean; error: boolean } {
  const [previewUrl, setPreviewUrl] = useState<string>();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | undefined;

    setPreviewUrl(undefined);
    setIsLoading(Boolean(objectPath && previewToken));
    setError(false);
    if (!objectPath || !previewToken) {
      return () => undefined;
    }

    fetchResidentEvidenceBlob({ objectPath, previewToken })
      .then((blob) => {
        if (cancelled || !blob) return;
        objectUrl = URL.createObjectURL(blob);
        setPreviewUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) { setPreviewUrl(undefined); setError(true); }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectPath, previewToken]);

  return { url: previewUrl, isLoading, error };
}