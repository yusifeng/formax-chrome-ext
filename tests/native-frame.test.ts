import { describe, expect, it } from "vitest";
import { decodeNativeMessages, encodeNativeMessage } from "../shared/native-frame.js";

describe("native messaging frames", () => {
  it("encodes and decodes one message", () => {
    const frame = encodeNativeMessage({ type: "hello", ok: true });
    const { messages, remaining } = decodeNativeMessages(frame);

    expect(messages).toEqual([{ type: "hello", ok: true }]);
    expect(remaining.length).toBe(0);
  });

  it("keeps partial frames as remaining bytes", () => {
    const frame = encodeNativeMessage({ action: "health" });
    const partial = frame.subarray(0, frame.length - 2);
    const { messages, remaining } = decodeNativeMessages(partial);

    expect(messages).toEqual([]);
    expect(remaining).toEqual(partial);
  });

  it("decodes multiple concatenated frames", () => {
    const frames = Buffer.concat([
      encodeNativeMessage({ n: 1 }),
      encodeNativeMessage({ n: 2 })
    ]);
    const { messages, remaining } = decodeNativeMessages(frames);

    expect(messages).toEqual([{ n: 1 }, { n: 2 }]);
    expect(remaining.length).toBe(0);
  });
});
