type ClipboardOffscreenRequest = {
  type?: string;
  action?: string;
  text?: string;
  items?: FormaxClipboardItemData[];
};

type ClipboardItemPayload = {
  mimeType?: string;
  text?: string;
  dataBase64?: string;
};

type FormaxClipboardItemData = {
  types?: ClipboardItemPayload[];
};

chrome.runtime.onMessage.addListener((message: ClipboardOffscreenRequest, _sender, sendResponse) => {
  if (message?.type !== "FORMAX_CLIPBOARD_OFFSCREEN") {
    return false;
  }

  void handleClipboardMessage(message)
    .then((result) => {
      sendResponse({
        ok: true,
        result
      });
    })
    .catch((error) => {
      sendResponse({
        ok: false,
        error: stringifyClipboardError(error)
      });
    });

  return true;
});

async function handleClipboardMessage(message: ClipboardOffscreenRequest) {
  if (message.action === "readText") {
    return {
      text: await navigator.clipboard.readText()
    };
  }

  if (message.action === "writeText") {
    await navigator.clipboard.writeText(String(message.text ?? ""));
    return {
      written: true
    };
  }

  if (message.action === "readItems") {
    const items = await navigator.clipboard.read();
    return {
      items: await Promise.all(items.map(serializeClipboardItem))
    };
  }

  if (message.action === "writeItems") {
    const items = Array.isArray(message.items) ? message.items : [];
    await navigator.clipboard.write(items.map(clipboardItemFromData));
    return {
      written: true,
      itemCount: items.length
    };
  }

  throw new Error(`Unsupported clipboard action: ${message.action}`);
}

async function serializeClipboardItem(item: ClipboardItem) {
  const types = [];

  for (const mimeType of item.types) {
    const blob = await item.getType(mimeType);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const payload: {
      mimeType: string;
      dataBase64: string;
      size: number;
      text?: string;
    } = {
      mimeType,
      dataBase64: bytesToBase64(bytes),
      size: bytes.byteLength
    };

    if (mimeType.startsWith("text/")) {
      payload.text = await blob.text();
    }

    types.push(payload);
  }

  return { types };
}

function clipboardItemFromData(item: FormaxClipboardItemData) {
  const parts: Record<string, Blob> = {};

  for (const payload of item.types ?? []) {
    const mimeType = requireMimeType(payload.mimeType);
    parts[mimeType] = blobFromPayload(mimeType, payload);
  }

  return new ClipboardItem(parts);
}

function blobFromPayload(mimeType: string, payload: ClipboardItemPayload) {
  if (typeof payload.text === "string") {
    return new Blob([payload.text], { type: mimeType });
  }

  if (typeof payload.dataBase64 === "string") {
    return new Blob([base64ToBytes(payload.dataBase64)], { type: mimeType });
  }

  throw new Error(`Clipboard item ${mimeType} requires text or dataBase64`);
}

function requireMimeType(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Clipboard item payload requires mimeType");
  }

  return value.trim();
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function stringifyClipboardError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
