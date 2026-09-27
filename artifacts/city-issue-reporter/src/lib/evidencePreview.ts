import { useEffect, useState } from "react";
import { fetchResidentEvidenceBlob } from "../reportStorage";

export function useResidentEvidencePreview(
  objectPath: string | undefined,
  previewToken: string | undefined,
): string | undefined {
  const [previewUrl, setPreviewUrl] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | undefined;

    setPreviewUrl(undefined);
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
        if (!cancelled) setPreviewUrl(undefined);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectPath, previewToken]);

  return previewUrl;
}