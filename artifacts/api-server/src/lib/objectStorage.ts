import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { File, Storage } from "@google-cloud/storage";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

export const objectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token",
      },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export class ObjectStorageService {
  getPrivateObjectDir(): string {
    const dir = process.env.PRIVATE_OBJECT_DIR || "";
    if (!dir) {
      throw new Error("PRIVATE_OBJECT_DIR is not configured.");
    }
    return dir;
  }

  async storeEvidence(
    bytes: Buffer,
    contentType: string,
  ): Promise<{ objectPath: string; size: number }> {
    const objectPath = `/objects/evidence/${randomUUID()}`;
    const file = await this.getObjectEntityFileHandle(objectPath);

    await file.save(bytes, {
      resumable: false,
      metadata: {
        contentType,
        cacheControl: "private, no-store",
        metadata: {
          purpose: "city-issue-evidence",
        },
      },
    });

    return { objectPath, size: bytes.byteLength };
  }

  async getObjectEntityFile(objectPath: string): Promise<File> {
    const file = await this.getObjectEntityFileHandle(objectPath);
    const [exists] = await file.exists();
    if (!exists) {
      throw new ObjectNotFoundError();
    }
    return file;
  }

  async downloadObject(file: File): Promise<Response> {
    const [metadata] = await file.getMetadata();
    const nodeStream = file.createReadStream();
    const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
    const headers: Record<string, string> = {
      "Content-Type": String(metadata.contentType || "application/octet-stream"),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    };

    if (metadata.size) {
      headers["Content-Length"] = String(metadata.size);
    }

    return new Response(webStream, { headers });
  }

  private async getObjectEntityFileHandle(objectPath: string): Promise<File> {
    if (!/^\/objects\/evidence\/[a-f0-9-]{36}$/i.test(objectPath)) {
      throw new ObjectNotFoundError();
    }

    const privateDir = this.getPrivateObjectDir().replace(/\/$/, "");
    const { bucketName, objectName } = parseObjectPath(
      `${privateDir}/evidence/${objectPath.split("/").at(-1)}`,
    );
    return objectStorageClient.bucket(bucketName).file(objectName);
  }
}

function parseObjectPath(path: string): {
  bucketName: string;
  objectName: string;
} {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const parts = normalizedPath.split("/");
  if (parts.length < 3 || !parts[1] || !parts.slice(2).join("/")) {
    throw new Error("Invalid object storage path.");
  }
  return {
    bucketName: parts[1],
    objectName: parts.slice(2).join("/"),
  };
}