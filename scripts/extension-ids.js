#!/usr/bin/env node

export const WEB_STORE_EXTENSION_ID = "dchkbbjmkheilkmencpckilhmmcppdne";
export const DEV_EXTENSION_ID = "hooonkcoopaigliifkabcdjfmjjffmbm";

const KNOWN_EXTENSION_IDS = new Map([
  ["prod", WEB_STORE_EXTENSION_ID],
  ["production", WEB_STORE_EXTENSION_ID],
  ["webstore", WEB_STORE_EXTENSION_ID],
  ["store", WEB_STORE_EXTENSION_ID],
  ["dev", DEV_EXTENSION_ID],
  ["development", DEV_EXTENSION_ID],
  ["local", DEV_EXTENSION_ID],
]);

export function resolveExtensionId(value, { fallback = WEB_STORE_EXTENSION_ID } = {}) {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }

  return KNOWN_EXTENSION_IDS.get(normalized) ?? value.trim();
}

export function knownExtensionIdLabels() {
  return {
    prod: WEB_STORE_EXTENSION_ID,
    dev: DEV_EXTENSION_ID,
  };
}
