import { isUniqueViolation } from '../lib/db-errors';
import { AppError } from '../lib/errors';
import type { Clock } from '../lib/clock';
import { systemClock } from '../lib/clock';
import type { PartnerStatus } from '../db/schema';
import type { PlatformStore } from './store-contract';
import type {
  AuditEntry,
  AuditListFilter,
  AuditLog,
  AuditMeta,
  Category,
  City,
  CreateCategoryInput,
  CreateItemInput,
  CreateZoneInput,
  MediaAsset,
  Page,
  PartnerListFilter,
  PartnerProfile,
  PartnerSummary,
  ServiceItem,
  UpsertPartnerInput,
  Zone,
} from './types';
import type { CloudinaryClient, CloudinaryConfig } from '../media/cloudinary';
import { createCloudinaryClient, CloudinaryError, signCloudinaryParams } from '../media/cloudinary';

function audit(meta: AuditMeta, entry: Omit<AuditEntry, keyof AuditMeta>): AuditEntry {
  return { ...meta, ...entry };
}

export interface CatalogueService {
  listCities(enabledOnly: boolean): Promise<City[]>;
  listZones(cityId: string, enabledOnly: boolean): Promise<Zone[]>;
  listCategories(enabledOnly: boolean): Promise<Category[]>;
  listItems(categoryId: string | undefined, enabledOnly: boolean): Promise<ServiceItem[]>;
  setCityEnabled(
    cityId: string,
    enabled: boolean,
    meta: AuditMeta,
  ): Promise<City>;
  createZone(input: CreateZoneInput, meta: AuditMeta): Promise<Zone>;
  createCategory(input: CreateCategoryInput, meta: AuditMeta): Promise<Category>;
  createItem(input: CreateItemInput, meta: AuditMeta): Promise<ServiceItem>;
}

export function createCatalogueService(store: PlatformStore): CatalogueService {
  return {
    listCities: (enabledOnly) => store.listCities(enabledOnly),
    listZones: (cityId, enabledOnly) => store.listZones(cityId, enabledOnly),
    listCategories: (enabledOnly) => store.listCategories(enabledOnly),
    listItems: (categoryId, enabledOnly) => store.listItems(categoryId, enabledOnly),

    async setCityEnabled(cityId, enabled, meta) {
      const city = await store.setCityEnabled(
        cityId,
        enabled,
        audit(meta, {
          action: enabled ? 'SERVICE_CITY_ENABLED' : 'SERVICE_CITY_DISABLED',
          targetType: 'service_city',
          targetId: cityId,
          metadata: { enabled },
        }),
      );
      if (!city) throw new AppError(404, 'CITY_NOT_FOUND', 'Service city not found');
      return city;
    },

    async createZone(input, meta) {
      const city = await store.getCity(input.cityId);
      if (!city) throw new AppError(404, 'CITY_NOT_FOUND', 'Service city not found');

      return store.createZone(
        input,
        audit(meta, {
          action: 'SERVICE_ZONE_CREATED',
          targetType: 'service_zone',
          targetId: null,
          metadata: { cityId: input.cityId, name: input.name, enabled: input.enabled },
        }),
      );
    },

    async createCategory(input, meta) {
      const normalized: CreateCategoryInput = {
        ...input,
        code: input.code.trim().toLowerCase(),
        name: input.name.trim(),
      };
      try {
        return await store.createCategory(
          normalized,
          audit(meta, {
            action: 'SERVICE_CATEGORY_CREATED',
            targetType: 'service_category',
            targetId: null,
            metadata: { code: normalized.code, name: normalized.name, enabled: normalized.enabled },
          }),
        );
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new AppError(409, 'CATEGORY_EXISTS', 'A service category with that code already exists');
        }
        throw error;
      }
    },

    async createItem(input, meta) {
      const categories = await store.listCategories(false);
      const category = categories.find((entry) => entry.id === input.categoryId);
      if (!category) throw new AppError(404, 'CATEGORY_NOT_FOUND', 'Service category not found');

      return store.createItem(
        input,
        audit(meta, {
          action: 'SERVICE_ITEM_CREATED',
          targetType: 'service_item',
          targetId: null,
          metadata: {
            categoryId: input.categoryId,
            name: input.name,
            basePrice: input.basePrice,
            enabled: input.enabled,
          },
        }),
      );
    },
  };
}

export interface PartnerService {
  onboard(
    userId: string,
    input: { serviceCityId: string; bio?: string; skills: string[] },
  ): Promise<PartnerProfile>;
  getProfile(userId: string): Promise<PartnerProfile>;
  listPartners(filter: PartnerListFilter): Promise<Page<PartnerSummary>>;
  approve(
    userId: string,
    adminUserId: string,
    verifySkills: boolean,
    meta: AuditMeta,
  ): Promise<PartnerProfile>;
  suspend(
    userId: string,
    adminUserId: string,
    reason: string,
    meta: AuditMeta,
  ): Promise<PartnerProfile>;
}

export function createPartnerService(store: PlatformStore, clock: Clock = systemClock): PartnerService {
  return {
    async onboard(userId, input) {
      const city = await store.getCity(input.serviceCityId);
      if (!city || !city.enabled) {
        throw new AppError(400, 'CITY_NOT_AVAILABLE', 'Selected service city is not available');
      }

      const skills = [...new Set(input.skills.map((skill) => skill.trim().toLowerCase()))];
      const categories = await store.getCategoriesByCodes(skills);
      const enabledCategories = new Set(
        categories.filter((category) => category.enabled).map((category) => category.code),
      );
      if (skills.length === 0 || skills.some((skill) => !enabledCategories.has(skill))) {
        throw new AppError(400, 'INVALID_SKILL', 'One or more selected skills are not available');
      }

      const existing = await store.getPartner(userId);
      if (existing?.status === 'SUSPENDED') {
        throw new AppError(403, 'ACCOUNT_SUSPENDED', 'This partner account is suspended');
      }

      const status: PartnerStatus =
        existing?.status === 'APPROVED' ? 'APPROVED' : 'PENDING_REVIEW';

      const profile: UpsertPartnerInput = {
        userId,
        status,
        serviceCityId: input.serviceCityId,
        bio: input.bio?.trim() || null,
        skills,
      };
      return store.upsertPartner(profile);
    },

    async getProfile(userId) {
      const profile = await store.getPartner(userId);
      if (!profile) throw new AppError(404, 'PARTNER_NOT_FOUND', 'Partner profile not found');
      return profile;
    },

    listPartners: (filter) => store.listPartners(filter),

    async approve(userId, adminUserId, verifySkills, meta) {
      const profile = await store.approvePartner(
        userId,
        adminUserId,
        clock.now(),
        verifySkills,
        audit(meta, {
          action: 'PARTNER_APPROVED',
          targetType: 'partner',
          targetId: userId,
          metadata: { verifySkills },
        }),
      );
      if (!profile) {
        throw new AppError(409, 'PARTNER_NOT_PENDING', 'Partner is not pending review');
      }
      return profile;
    },

    async suspend(userId, adminUserId, reason, meta) {
      const profile = await store.suspendPartner(
        userId,
        adminUserId,
        reason,
        audit(meta, {
          action: 'PARTNER_SUSPENDED',
          targetType: 'partner',
          targetId: userId,
          metadata: { reason },
        }),
      );
      if (!profile) throw new AppError(404, 'PARTNER_NOT_FOUND', 'Partner profile not found');
      return profile;
    },
  };
}

export interface AuditService {
  list(filter: AuditListFilter): Promise<Page<AuditLog>>;
}

export function createAuditService(store: PlatformStore): AuditService {
  return { list: (filter) => store.listAuditLogs(filter) };
}

export type MediaKind = 'AVATAR' | 'PARTNER_DOCUMENT';

interface MediaRule {
  folder: string;
  cloudinaryType: 'upload' | 'authenticated';
  maxBytes: number;
  formats: string[];
}

export const MEDIA_RULES: Record<MediaKind, MediaRule> = {
  AVATAR: {
    folder: 'fixyes/avatars',
    cloudinaryType: 'upload',
    maxBytes: 5 * 1024 * 1024,
    formats: ['jpg', 'jpeg', 'png', 'webp'],
  },
  PARTNER_DOCUMENT: {
    folder: 'fixyes/partner-documents',
    cloudinaryType: 'authenticated',
    maxBytes: 10 * 1024 * 1024,
    formats: ['jpg', 'jpeg', 'png', 'webp'],
  },
};

export interface UploadSignature {
  kind: MediaKind;
  publicId: string;
  uploadUrl: string;
  params: Record<string, string>;
  expiresAt: string;
  maxBytes: number;
  allowedFormats: string[];
}

export interface MediaService {
  createSignature(ownerUserId: string, kind: MediaKind): Promise<UploadSignature>;
  confirm(ownerUserId: string, publicId: string): Promise<MediaAsset>;
}

export interface MediaServiceOptions {
  store: PlatformStore;
  config: CloudinaryConfig;
  client?: CloudinaryClient;
  clock?: Clock;
}

function hasCloudinaryConfig(config: CloudinaryConfig): boolean {
  return Boolean(config.cloudName && config.apiKey && config.apiSecret);
}

export function createMediaService(options: MediaServiceOptions): MediaService {
  const clock = options.clock ?? systemClock;
  const client = options.client ?? createCloudinaryClient(options.config);

  return {
    async createSignature(ownerUserId, kind) {
      if (!hasCloudinaryConfig(options.config)) {
        throw new AppError(503, 'MEDIA_NOT_CONFIGURED', 'Media uploads are not configured');
      }
      const rule = MEDIA_RULES[kind];

      if (kind === 'PARTNER_DOCUMENT') {
        const partner = await options.store.getPartner(ownerUserId);
        if (!partner) {
          throw new AppError(403, 'PARTNER_PROFILE_REQUIRED', 'Create a partner profile before uploading documents');
        }
        if (partner.status === 'SUSPENDED') {
          throw new AppError(403, 'ACCOUNT_SUSPENDED', 'This partner account is suspended');
        }
      }

      const timestamp = Math.floor(clock.now().getTime() / 1000);
      const publicId = `${rule.folder}/${ownerUserId}/${crypto.randomUUID()}`;
      const params: Record<string, string> = {
        public_id: publicId,
        timestamp: String(timestamp),
      };
      if (rule.cloudinaryType !== 'upload') params.type = rule.cloudinaryType;

      const signature = await signCloudinaryParams(params, options.config.apiSecret);
      const asset = await options.store.createMediaAsset({
        ownerUserId,
        cloudinaryPublicId: publicId,
        resourceType: 'image',
        mediaKind: kind,
        folder: rule.folder,
      });

      return {
        kind,
        publicId: asset.cloudinaryPublicId,
        uploadUrl: `https://api.cloudinary.com/v1_1/${options.config.cloudName}/image/upload`,
        params: {
          ...params,
          signature,
          api_key: options.config.apiKey,
          cloud_name: options.config.cloudName,
          resource_type: 'image',
        },
        expiresAt: new Date((timestamp + 60 * 60) * 1000).toISOString(),
        maxBytes: rule.maxBytes,
        allowedFormats: rule.formats,
      };
    },

    async confirm(ownerUserId, publicId) {
      const asset = await options.store.getMediaAsset(publicId, ownerUserId);
      if (!asset) throw new AppError(404, 'MEDIA_ASSET_NOT_FOUND', 'Media asset not found');

      const rule = MEDIA_RULES[asset.mediaKind as MediaKind];
      if (!rule) throw new AppError(409, 'MEDIA_ASSET_INVALID', 'Media asset kind is invalid');

      let resource;
      try {
        resource = await client.getResource({
          publicId: asset.cloudinaryPublicId,
          resourceType: asset.resourceType,
          type: rule.cloudinaryType,
        });
      } catch (error) {
        if (error instanceof CloudinaryError) {
          throw new AppError(502, 'MEDIA_VERIFICATION_FAILED', 'Cloudinary could not verify the upload');
        }
        throw error;
      }

      if (!resource) {
        throw new AppError(422, 'MEDIA_ASSET_NOT_UPLOADED', 'Uploaded asset was not found in Cloudinary');
      }
      if (resource.publicId !== asset.cloudinaryPublicId) {
        throw new AppError(422, 'MEDIA_ASSET_MISMATCH', 'Uploaded asset does not match the signed upload');
      }
      if (resource.resourceType !== asset.resourceType || resource.type !== rule.cloudinaryType) {
        throw new AppError(422, 'MEDIA_ASSET_MISMATCH', 'Uploaded asset has an unexpected resource type');
      }
      if (resource.folder !== null && resource.folder !== rule.folder) {
        throw new AppError(422, 'MEDIA_ASSET_MISMATCH', 'Uploaded asset has an unexpected folder');
      }

      const format = resource.format.toLowerCase();
      if (!format || !rule.formats.includes(format)) {
        throw new AppError(422, 'MEDIA_FORMAT_NOT_ALLOWED', 'Uploaded file format is not allowed');
      }
      if (!Number.isFinite(resource.bytes) || resource.bytes <= 0 || resource.bytes > rule.maxBytes) {
        throw new AppError(422, 'MEDIA_SIZE_NOT_ALLOWED', 'Uploaded file size is not allowed');
      }

      const verified = await options.store.markMediaVerified(publicId, ownerUserId, {
        format,
        bytes: resource.bytes,
      });
      if (!verified) throw new AppError(404, 'MEDIA_ASSET_NOT_FOUND', 'Media asset not found');
      return verified;
    },
  };
}
