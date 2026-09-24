import { useEffect, useState } from "react";

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

    fetch(`/api/storage${objectPath}`, {
      headers: { "X-Resident-Preview-Token": previewToken },
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("The secured image preview could not be loaded.");
        }
        return response.blob();
      })
      .then((blob) => {
        if (cancelled) return;
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