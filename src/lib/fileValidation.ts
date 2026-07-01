export type UploadRules = {
  allowedTypes: string[];
  maxBytes: number;
  label: string;
};

export const IMAGE_UPLOAD_RULES: UploadRules = {
  allowedTypes: ['image/png', 'image/jpeg', 'image/webp'],
  maxBytes: 8 * 1024 * 1024,
  label: 'PNG, JPEG of WebP-afbeelding van maximaal 8 MB',
};

export const PDF_UPLOAD_RULES: UploadRules = {
  allowedTypes: ['application/pdf'],
  maxBytes: 12 * 1024 * 1024,
  label: 'PDF van maximaal 12 MB',
};

export const MAX_BATCH_FILES = 5;

export function validateFileForUpload(file: File, rules: UploadRules): string | null {
  if (!rules.allowedTypes.includes(file.type)) {
    return `${file.name}: verwacht ${rules.label}.`;
  }

  if (file.size > rules.maxBytes) {
    return `${file.name}: bestand is te groot. Maximum is ${formatBytes(rules.maxBytes)}.`;
  }

  return null;
}

export function validateBatchForUpload(files: File[], rules: UploadRules): string | null {
  if (files.length > MAX_BATCH_FILES) {
    return `Upload maximaal ${MAX_BATCH_FILES} bestanden tegelijk.`;
  }

  const firstError = files.map((file) => validateFileForUpload(file, rules)).find(Boolean);
  return firstError ?? null;
}

function formatBytes(bytes: number): string {
  return `${Math.round((bytes / 1024 / 1024) * 10) / 10} MB`;
}
