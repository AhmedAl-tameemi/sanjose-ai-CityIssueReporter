import express, {
  Router,
  type IRouter,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { UploadEvidenceResponse } from "@workspace/api-zod";
import { Readable } from "node:stream";
import {
  canResidentPreviewEvidence,
  canStaffReadEvidence,
  createResidentEvidencePreviewToken,
  getStaffSession,
} from "../lib/staffAuth";
import {
  ObjectNotFoundError,
  ObjectStorageService,
} from "../lib/objectStorage";
import {
  getEvidenceContentType,
  maxEvidenceSize,
  validateEvidenceBytes,
  validateEvidenceHeaders as validateEvidenceRequestHeaders,
} from "../lib/evidenceValidation";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

const parseEvidenceBody = express.raw({
  type: "*/*",
  limit: maxEvidenceSize,
});

function validateEvidenceHeaders(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const contentType = getEvidenceContentType(req.headers["content-type"]);
  const headerError = validateEvidenceRequestHeaders(
    contentType,
    req.headers["content-length"],
  );
  if (headerError) {
    res.status(headerError.status).json({ error: headerError.message });
    return;
  }

  parseEvidenceBody(req, res, (error) => {
    if (error) {
      if ((error as { type?: string }).type === "entity.too.large") {
        res.status(413).json({ error: "Images must be 3 MB or smaller." });
        return;
      }
      next(error);
      return;
    }
    next();
  });
}

router.post(
  "/storage/evidence",
  validateEvidenceHeaders,
  async (req: Request, res: Response) => {
    const contentType = getEvidenceContentType(req.headers["content-type"]);
    const bytes = Buffer.isBuffer(req.body) ? req.body : null;

    const bodyError = validateEvidenceBytes(contentType, bytes ?? Buffer.alloc(0));
    if (bodyError) {
      res.status(bodyError.status).json({ error: bodyError.message });
      return;
    }

    try {
      if (!bytes || !contentType) {
        res.status(400).json({ error: "An image file is required." });
        return;
      }
      const stored = await objectStorageService.storeEvidence(bytes, contentType);
      res.status(201).json(
        UploadEvidenceResponse.parse({
          ...stored,
          contentType,
          previewToken: createResidentEvidencePreviewToken(stored.objectPath),
        }),
      );
    } catch (error) {
      req.log.error({ err: error }, "Error storing evidence");
      res.status(500).json({ error: "The image could not be stored." });
    }
  },
);

router.get(
  "/storage/objects/*objectPath",
  async (req: Request, res: Response) => {
    const raw = req.params.objectPath;
    const objectPath = `/objects/${Array.isArray(raw) ? raw.join("/") : raw}`;

    const staffSession = getStaffSession(req);
    if (!canStaffReadEvidence(staffSession) && !canResidentPreviewEvidence(req, objectPath)) {
      res.status(401).json({
        error: "Staff authentication or a resident preview token is required.",
      });
      return;
    }

    try {
      const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
      const response = await objectStorageService.downloadObject(objectFile);
      res.status(response.status);
      response.headers.forEach((value, key) => res.setHeader(key, value));

      if (response.body) {
        Readable.fromWeb(
          response.body as ReadableStream<Uint8Array>,
        ).pipe(res);
      } else {
        res.end();
      }
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        res.status(404).json({ error: "Evidence object not found." });
        return;
      }
      req.log.error({ err: error }, "Error serving evidence");
      res.status(500).json({ error: "The image could not be served." });
    }
  },
);

export default router;