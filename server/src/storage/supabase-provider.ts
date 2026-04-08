import { StorageClient } from "@supabase/storage-js";
import { Readable } from "node:stream";
import type { StorageProvider, PutObjectInput, GetObjectInput, GetObjectResult, HeadObjectResult } from "./types.js";

const BUCKET = "paperclip-attachments";

export function createSupabaseStorageProvider(supabaseUrl: string, serviceRoleKey: string): StorageProvider {
  const storageUrl = `${supabaseUrl}/storage/v1`;
  const client = new StorageClient(storageUrl, {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  });

  void ensureBucket(client);

  return {
    id: "s3" as const,

    async putObject(input: PutObjectInput): Promise<void> {
      const { error } = await client.from(BUCKET).upload(input.objectKey, input.body, {
        contentType: input.contentType,
        upsert: true,
      });
      if (error) throw new Error(`Supabase upload failed: ${error.message}`);
    },

    async getObject(input: GetObjectInput): Promise<GetObjectResult> {
      const { data, error } = await client.from(BUCKET).download(input.objectKey);
      if (error || !data) throw new Error(`Supabase download failed: ${error?.message ?? "no data"}`);
      const buffer = Buffer.from(await data.arrayBuffer());
      const stream = Readable.from(buffer);
      return { stream };
    },

    async headObject(input: GetObjectInput): Promise<HeadObjectResult> {
      const parts = input.objectKey.split("/");
      const filename = parts.pop() ?? "";
      const folder = parts.join("/");
      const { data, error } = await client.from(BUCKET).list(folder, { search: filename });
      if (error) return { exists: false };
      const file = data?.find((f) => f.name === filename);
      if (!file) return { exists: false };
      return {
        exists: true,
        contentLength: file.metadata?.size as number | undefined,
      };
    },

    async deleteObject(input: GetObjectInput): Promise<void> {
      const { error } = await client.from(BUCKET).remove([input.objectKey]);
      if (error) throw new Error(`Supabase delete failed: ${error.message}`);
    },
  };
}

async function ensureBucket(client: StorageClient): Promise<void> {
  const { error } = await client.createBucket(BUCKET, { public: false });
  if (error && !error.message.includes("already exists") && !error.message.includes("Duplicate")) {
    console.warn("[supabase-storage] Could not ensure bucket:", error.message);
  }
}
