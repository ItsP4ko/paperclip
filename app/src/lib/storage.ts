import { createStorageProviderFromConfig } from '@/storage/provider-registry'
import { createStorageService as _createStorageService } from '@/storage/service'
export type { StorageService } from '@/storage/types'

function getStorageConfig() {
  return {
    storageProvider: (process.env.STORAGE_PROVIDER ?? 'local_disk') as 'local_disk' | 's3',
    storageLocalDiskBaseDir: process.env.STORAGE_LOCAL_DISK_BASE_DIR ?? '/tmp/paperclip-storage',
    storageS3Bucket: process.env.AWS_S3_BUCKET ?? '',
    storageS3Region: process.env.AWS_REGION ?? '',
    storageS3Endpoint: process.env.AWS_S3_ENDPOINT,
    storageS3Prefix: process.env.AWS_S3_PREFIX,
    storageS3ForcePathStyle: process.env.AWS_S3_FORCE_PATH_STYLE === 'true',
  }
}

export function createStorageService() {
  const config = getStorageConfig()
  const provider = createStorageProviderFromConfig(config)
  return _createStorageService(provider)
}
