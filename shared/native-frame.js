export function encodeNativeMessage(message) {
    const body = Buffer.from(JSON.stringify(message), "utf8");
    const header = Buffer.alloc(4);
    header.writeUInt32LE(body.length, 0);
    return Buffer.concat([header, body]);
}
export function decodeNativeMessages(buffer) {
    const messages = [];
    let remaining = buffer;
    while (remaining.length >= 4) {
        const messageLength = remaining.readUInt32LE(0);
        if (remaining.length < 4 + messageLength) {
            break;
        }
        const body = remaining.subarray(4, 4 + messageLength);
        remaining = remaining.subarray(4 + messageLength);
        messages.push(JSON.parse(body.toString("utf8")));
    }
    return {
        messages,
        remaining
    };
}
