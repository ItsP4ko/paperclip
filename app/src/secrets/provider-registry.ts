import type { SecretProvider, SecretProviderDescriptor } from "@paperclipai/shared";
import { localEncryptedProvider } from "./local-encrypted-provider";
import {
  awsSecretsManagerProvider,
  gcpSecretManagerProvider,
  vaultProvider,
} from "./external-stub-providers";
import type { SecretProviderModule } from "./types";
import { unprocessable } from "@/server/errors";

const providers: SecretProviderModule[] = [
  localEncryptedProvider,
  awsSecretsManagerProvider,
  gcpSecretManagerProvider,
  vaultProvider,
];

const providerById = new Map<SecretProvider, SecretProviderModule>(
  providers.map((provider) => [provider.id, provider]),
);

export function getSecretProvider(id: SecretProvider): SecretProviderModule {
  const provider = providerById.get(id);
  if (!provider) throw unprocessable(`Unsupported secret provider: ${id}`);
  return provider;
}

export function listSecretProviders(): SecretProviderDescriptor[] {
  return providers.map((provider) => provider.descriptor);
}
