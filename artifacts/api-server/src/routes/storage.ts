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
  ObjectNotFoundError,
  ObjectStorageService,
} from "../lib/objectStorage";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();
const maxEvidenceSize = 3 * 1024 * 1024;
const allowedContentTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const parseEvidenceBody = express.raw({
  type: "*/*",
  limit: maxEvidenceSize,
});

function validateEvidenceHeaders(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const contentType = getContentType(req);
  if (!contentType || !allowedContentTypes.has(contentType)) {
    res.status(415).json({
      error: "Only JPEG, PNG, WebP, and GIF images are supported.",
    });
    return;
  }

  const contentLength = Number(req.headers["content-length"]);
  if (Number.isFinite(contentLength) && contentLength > maxEvidenceSize) {
    res.status(413).json({ error: "Images must be 3 MB or smaller." });
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
    const contentType = getContentType(req);
    const bytes = Buffer.isBuffer(req.body) ? req.body : null;

    if (!bytes || bytes.length === 0) {
      res.status(400).json({ error: "An image file is required." });
      return;
    }
    if (bytes.length > maxEvidenceSize) {
      res.status(413).json({ error: "Images must be 3 MB or smaller." });
      return;
    }
    if (!contentType || detectImageType(bytes) !== contentType) {
      res.status(400).json({ error: "The uploaded file is not a valid image." });
      return;
    }

    try {
      const stored = await objectStorageService.storeEvidence(bytes, contentType);
      res.status(201).json(
        UploadEvidenceResponse.parse({
          ...stored,
          contentType,
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

function getContentType(req: Request): string | null {
  const value = req.headers["content-type"];
  return typeof value === "string" ? value.split(";")[0].trim().toLowerCase() : null;
}

function detectImageType(bytes: Buffer): string | null {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 6 &&
    (bytes.subarray(0, 6).toString("ascii") === "GIF87a" ||
      bytes.subarray(0, 6).toString("ascii") === "GIF89a")
  ) {
    return "image/gif";
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export default router;