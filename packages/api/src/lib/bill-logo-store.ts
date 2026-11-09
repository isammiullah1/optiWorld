import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AppError } from './errors.js';

const LOGO_DIR = fileURLToPath(new URL('../../uploads/bill-logos/', import.meta.url));
const LOGO_KEY = /^[a-f0-9]{32}\.(png|jpg|webp)$/;
const MAX_LOGO_BYTES = 1_048_576;

type LogoFile = {
  bytes: Buffer;
  contentType: 'image/png' | 'image/jpeg' | 'image/webp';
};

type DecodedLogo = {
  bytes: Buffer;
  extension: 'png' | 'jpg' | 'webp';
  contentType: LogoFile['contentType'];
};

export function billLogoPath(key: string | null): string | null {
  if (!key || !LOGO_KEY.test(key)) {
    return null;
  }
  return `/api/v1/public/bill-logos/${key}`;
}

export function decodeBillLogo(image: string): DecodedLogo {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\s]+)$/.exec(image.trim());
  if (!match?.[1] || !match[2]) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Use a PNG, JPG, or WebP logo.');
  }
  const bytes = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  if (bytes.length === 0 || bytes.length > MAX_LOGO_BYTES) {
    throw new AppError(422, 'VALIDATION_ERROR', 'The logo must be under 1 MB.');
  }
  const contentType = match[1] as LogoFile['contentType'];
  const extension = extensionFor(contentType);
  if (!signatureMatches(bytes, extension)) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Use a PNG, JPG, or WebP logo.');
  }
  return { bytes, extension, contentType };
}

export async function writeBillLogo(logo: DecodedLogo): Promise<string> {
  const key = `${randomBytes(16).toString('hex')}.${logo.extension}`;
  await mkdir(LOGO_DIR, { recursive: true });
  await writeFile(logoFile(key), logo.bytes);
  return key;
}

export async function readBillLogo(key: string): Promise<LogoFile | null> {
  if (!LOGO_KEY.test(key)) {
    return null;
  }
  try {
    const bytes = await readFile(logoFile(key));
    const extension = key.slice(-3) === 'png' ? 'png' : key.endsWith('.webp') ? 'webp' : 'jpg';
    return { bytes, contentType: contentTypeFor(extension) };
  } catch {
    return null;
  }
}

export async function deleteBillLogo(key: string | null): Promise<void> {
  if (!key || !LOGO_KEY.test(key)) {
    return;
  }
  await rm(logoFile(key), { force: true });
}

function logoFile(key: string): string {
  if (!LOGO_KEY.test(key)) {
    throw new AppError(404, 'NOT_FOUND', 'This logo was not found');
  }
  const resolvedDir = path.resolve(LOGO_DIR);
  const resolved = path.resolve(resolvedDir, key);
  if (!resolved.startsWith(`${resolvedDir}${path.sep}`)) {
    throw new AppError(404, 'NOT_FOUND', 'This logo was not found');
  }
  return resolved;
}

function extensionFor(contentType: LogoFile['contentType']): DecodedLogo['extension'] {
  if (contentType === 'image/png') {
    return 'png';
  }
  if (contentType === 'image/webp') {
    return 'webp';
  }
  return 'jpg';
}

function contentTypeFor(extension: DecodedLogo['extension']): LogoFile['contentType'] {
  if (extension === 'png') {
    return 'image/png';
  }
  if (extension === 'webp') {
    return 'image/webp';
  }
  return 'image/jpeg';
}

function signatureMatches(bytes: Buffer, extension: DecodedLogo['extension']): boolean {
  if (extension === 'png') {
    return bytes
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (extension === 'jpg') {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  return (
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  );
}
