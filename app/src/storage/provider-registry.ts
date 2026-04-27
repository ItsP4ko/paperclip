import type { StorageProvider } from './types'
import { createLocalDiskStorageProvider } from './local-disk-provider'
import { createS3StorageProvider } from './s3-provider'
import { createSupabaseStorageProvider } from './supabase-provider'

type StorageConfig = {
  storageProvider: string
  storageLocalDiskBaseDir: string
  storageS3Bucket: string
  storageS3Region: string
  storageS3Endpoint?: string
  storageS3Prefix?: string
  storageS3ForcePathStyle?: boolean
}

export function createStorageProviderFromConfig(config: StorageConfig): StorageProvider {
  const supabaseUrl = process.env.SUPABASE_URL?.trim()
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (supabaseUrl && supabaseKey && supabaseKey !== 'your-service-role-key-here') {
    return createSupabaseStorageProvider(supabaseUrl, supabaseKey)
  }

  if (config.storageProvider === 'local_disk') {
    return createLocalDiskStorageProvider(config.storageLocalDiskBaseDir)
  }

  return createS3StorageProvider({
    bucket: config.storageS3Bucket,
    region: config.storageS3Region,
    endpoint: config.storageS3Endpoint,
    prefix: config.storageS3Prefix,
    forcePathStyle: config.storageS3ForcePathStyle,
  })
}
