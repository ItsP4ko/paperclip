import type { Config } from "../config.js";
import type { StorageProvider } from "./types.js";
import { createLocalDiskStorageProvider } from "./local-disk-provider.js";
import { createS3StorageProvider } from "./s3-provider.js";
import { createSupabaseStorageProvider } from "./supabase-provider.js";

export function createStorageProviderFromConfig(config: Config): StorageProvider {
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (supabaseUrl && supabaseKey && supabaseKey !== "your-service-role-key-here") {
    return createSupabaseStorageProvider(supabaseUrl, supabaseKey);
  }

  if (config.storageProvider === "local_disk") {
    return createLocalDiskStorageProvider(config.storageLocalDiskBaseDir);
  }

  return createS3StorageProvider({
    bucket: config.storageS3Bucket,
    region: config.storageS3Region,
    endpoint: config.storageS3Endpoint,
    prefix: config.storageS3Prefix,
    forcePathStyle: config.storageS3ForcePathStyle,
  });
}
