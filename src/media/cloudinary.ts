export interface CloudinaryConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

export interface CloudinaryResource {
  publicId: string;
  resourceType: string;
  type: string;
  format: string;
  bytes: number;
  folder: string | null;
  secureUrl: string | null;
}

export interface CloudinaryClient {
  getResource(input: {
    publicId: string;
    resourceType: string;
    type: string;
  }): Promise<CloudinaryResource | null>;
}

export class CloudinaryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CloudinaryError';
  }
}

export async function sha1Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function signCloudinaryParams(
  params: Record<string, string>,
  apiSecret: string,
): Promise<string> {
  const toSign = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');
  return sha1Hex(`${toSign}${apiSecret}`);
}

function encodePublicId(publicId: string): string {
  return publicId.split('/').map(encodeURIComponent).join('/');
}

function basicAuth(apiKey: string, apiSecret: string): string {
  return `Basic ${btoa(`${apiKey}:${apiSecret}`)}`;
}

export function createCloudinaryClient(config: CloudinaryConfig): CloudinaryClient {
  return {
    async getResource({ publicId, resourceType, type }) {
      if (!config.cloudName || !config.apiKey || !config.apiSecret) {
        throw new CloudinaryError('Cloudinary is not configured');
      }

      const url = `https://api.cloudinary.com/v1_1/${config.cloudName}/resources/${encodeURIComponent(
        resourceType,
      )}/${encodeURIComponent(type)}/${encodePublicId(publicId)}`;

      const response = await fetch(url, {
        headers: { authorization: basicAuth(config.apiKey, config.apiSecret) },
      });

      if (response.status === 404) return null;
      if (!response.ok) {
        throw new CloudinaryError(`Cloudinary Admin API returned ${response.status}`);
      }

      const body = (await response.json()) as Record<string, unknown>;
      return {
        publicId: String(body.public_id ?? ''),
        resourceType: String(body.resource_type ?? ''),
        type: String(body.type ?? ''),
        format: String(body.format ?? ''),
        bytes: Number(body.bytes ?? 0),
        folder: typeof body.folder === 'string' ? body.folder : null,
        secureUrl: typeof body.secure_url === 'string' ? body.secure_url : null,
      };
    },
  };
}
