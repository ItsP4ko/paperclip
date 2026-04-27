import type {
  AuthBaseUrlMode,
  DeploymentExposure,
  DeploymentMode,
  SecretProvider,
  StorageProvider,
} from "@paperclipai/shared";

type DatabaseMode = "embedded-postgres" | "postgres";

export interface Config {
  deploymentMode: DeploymentMode;
  deploymentExposure: DeploymentExposure;
  host: string;
  port: number;
  allowedHostnames: string[];
  authBaseUrlMode: AuthBaseUrlMode;
  authPublicBaseUrl: string | undefined;
  authDisableSignUp: boolean;
  databaseMode: DatabaseMode;
  databaseUrl: string | undefined;
  embeddedPostgresDataDir: string;
  embeddedPostgresPort: number;
  databaseBackupEnabled: boolean;
  databaseBackupIntervalMinutes: number;
  databaseBackupRetentionDays: number;
  databaseBackupDir: string;
  serveUi: boolean;
  uiDevMiddleware: boolean;
  secretsProvider: SecretProvider;
  secretsStrictMode: boolean;
  secretsMasterKeyFilePath: string;
  storageProvider: StorageProvider;
  storageLocalDiskBaseDir: string;
  storageS3Bucket: string;
  storageS3Region: string;
  storageS3Endpoint: string | undefined;
  storageS3Prefix: string;
  storageS3ForcePathStyle: boolean;
  feedbackExportBackendUrl: string | undefined;
  feedbackExportBackendToken: string | undefined;
  heartbeatSchedulerEnabled: boolean;
  heartbeatSchedulerIntervalMs: number;
  companyDeletionEnabled: boolean;
  telemetryEnabled: boolean;
  redisUrl: string | undefined;
}

export function loadConfig(): Config {
  return {
    deploymentMode: (process.env.PAPERCLIP_DEPLOYMENT_MODE ?? "local_trusted") as DeploymentMode,
    deploymentExposure: (process.env.PAPERCLIP_DEPLOYMENT_EXPOSURE ?? "private") as DeploymentExposure,
    host: process.env.HOST ?? "0.0.0.0",
    port: Number(process.env.PORT) || 3000,
    allowedHostnames: (process.env.PAPERCLIP_ALLOWED_HOSTNAMES ?? "").split(",").filter(Boolean),
    authBaseUrlMode: (process.env.PAPERCLIP_AUTH_BASE_URL_MODE ?? "auto") as AuthBaseUrlMode,
    authPublicBaseUrl:
      process.env.PAPERCLIP_AUTH_PUBLIC_BASE_URL?.trim() ||
      process.env.BETTER_AUTH_URL?.trim() ||
      undefined,
    authDisableSignUp: process.env.PAPERCLIP_AUTH_DISABLE_SIGN_UP === "true",
    databaseMode: "postgres",
    databaseUrl: process.env.DATABASE_URL,
    embeddedPostgresDataDir: "",
    embeddedPostgresPort: 0,
    databaseBackupEnabled: false,
    databaseBackupIntervalMinutes: 60,
    databaseBackupRetentionDays: 30,
    databaseBackupDir: "",
    serveUi: false,
    uiDevMiddleware: false,
    secretsProvider: (process.env.PAPERCLIP_SECRETS_PROVIDER ?? "local_encrypted") as SecretProvider,
    secretsStrictMode: process.env.PAPERCLIP_SECRETS_STRICT_MODE === "true",
    secretsMasterKeyFilePath: process.env.PAPERCLIP_SECRETS_MASTER_KEY_FILE ?? "",
    storageProvider: (process.env.PAPERCLIP_STORAGE_PROVIDER ?? "s3") as StorageProvider,
    storageLocalDiskBaseDir: process.env.PAPERCLIP_STORAGE_LOCAL_DIR ?? "",
    storageS3Bucket: process.env.PAPERCLIP_STORAGE_S3_BUCKET ?? "",
    storageS3Region: process.env.PAPERCLIP_STORAGE_S3_REGION ?? "us-east-1",
    storageS3Endpoint: process.env.PAPERCLIP_STORAGE_S3_ENDPOINT?.trim() || undefined,
    storageS3Prefix: process.env.PAPERCLIP_STORAGE_S3_PREFIX ?? "",
    storageS3ForcePathStyle: process.env.PAPERCLIP_STORAGE_S3_FORCE_PATH_STYLE === "true",
    feedbackExportBackendUrl: process.env.PAPERCLIP_FEEDBACK_EXPORT_BACKEND_URL?.trim() || undefined,
    feedbackExportBackendToken: process.env.PAPERCLIP_FEEDBACK_EXPORT_BACKEND_TOKEN?.trim() || undefined,
    heartbeatSchedulerEnabled: process.env.HEARTBEAT_SCHEDULER_ENABLED !== "false",
    heartbeatSchedulerIntervalMs: Math.max(10000, Number(process.env.HEARTBEAT_SCHEDULER_INTERVAL_MS) || 30000),
    companyDeletionEnabled: process.env.PAPERCLIP_ENABLE_COMPANY_DELETION === "true",
    telemetryEnabled: false,
    redisUrl: process.env.REDIS_URL?.trim() || undefined,
  };
}
