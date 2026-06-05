use bytes::Bytes;
use serde_json::Value;

/// Maximum allowed native message body size: 64 MB.
pub const MAX_NATIVE_MESSAGE_BYTES: usize = 64 * 1024 * 1024;

/// Result of decoding a buffer of native messaging frames.
#[derive(Debug, Clone)]
pub struct DecodedNativeMessages {
    /// Fully decoded JSON messages.
    pub messages: Vec<Value>,
    /// Remaining bytes that don't yet form a complete frame.
    pub remaining: Bytes,
}

/// Encode a JSON value into a Chrome Native Messaging frame.
///
/// Frame format:
///   u32 little-endian body length
///   UTF-8 JSON body
pub fn try_encode_native_message(value: &Value) -> Result<Vec<u8>> {
    let body = serde_json::to_vec(value).expect("JSON serialization should not fail");
    let len = body.len();

    if len > u32::MAX as usize {
        return Err(Error::MessageTooLarge(len));
    }

    let mut frame = Vec::with_capacity(4 + len);
    frame.extend_from_slice(&(len as u32).to_le_bytes());
    frame.extend_from_slice(&body);

    Ok(frame)
}

/// Decode zero or more Chrome Native Messaging frames from a byte buffer.
///
/// Returns the successfully decoded messages and any remaining bytes that were
/// part of an incomplete frame. If a complete frame contains invalid JSON an
/// error is returned.
pub fn decode_native_messages(buffer: &[u8]) -> Result<DecodedNativeMessages> {
    let mut messages = Vec::new();
    let mut offset = 0;

    while offset + 4 <= buffer.len() {
        let header = &buffer[offset..offset + 4];
        let message_length =
            u32::from_le_bytes([header[0], header[1], header[2], header[3]]) as usize;

        if message_length > MAX_NATIVE_MESSAGE_BYTES {
            return Err(Error::OversizedFrame(message_length));
        }

        if offset + 4 + message_length > buffer.len() {
            // Not enough data for the complete frame body; stop here.
            break;
        }

        let body_slice = &buffer[offset + 4..offset + 4 + message_length];
        let value: Value =
            serde_json::from_slice(body_slice).map_err(|e| Error::InvalidJson(e.to_string()))?;

        messages.push(value);
        offset += 4 + message_length;
    }

    let remaining = Bytes::copy_from_slice(&buffer[offset..]);

    Ok(DecodedNativeMessages {
        messages,
        remaining,
    })
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("message too large for 4-byte length prefix: {0} bytes")]
    MessageTooLarge(usize),

    #[error("frame declares body length of {0} bytes which exceeds maximum of {MAX_NATIVE_MESSAGE_BYTES}")]
    OversizedFrame(usize),

    #[error("invalid JSON in native message frame: {0}")]
    InvalidJson(String),
}

type Result<T> = std::result::Result<T, Error>;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use pretty_assertions::assert_eq;
    use serde_json::json;

    #[test]
    fn test_encode_decode_one_message() {
        let value = json!({"type": "hello", "version": "1.0"});
        let frame = try_encode_native_message(&value).unwrap();

        let decoded = decode_native_messages(&frame).unwrap();
        assert_eq!(decoded.messages.len(), 1);
        assert_eq!(decoded.messages[0], value);
        assert!(decoded.remaining.is_empty());
    }

    #[test]
    fn test_frame_format_is_little_endian_length_plus_json_body() {
        let value = json!("hello");
        let frame = try_encode_native_message(&value).unwrap();

        assert_eq!(&frame[..4], &[7, 0, 0, 0]);
        assert_eq!(&frame[4..], br#""hello""#);
    }

    #[test]
    fn test_keeps_partial_frames_as_remaining() {
        let value = json!({"key": "value"});
        let frame = try_encode_native_message(&value).unwrap();

        // Only take the header and first byte of the body
        let partial = &frame[..5];
        let decoded = decode_native_messages(partial).unwrap();
        assert_eq!(decoded.messages.len(), 0);
        assert_eq!(decoded.remaining.len(), 5);
    }

    #[test]
    fn test_decodes_multiple_concatenated_frames() {
        let v1 = json!({"seq": 1});
        let v2 = json!({"seq": 2});
        let v3 = json!({"seq": 3});

        let mut buf = Vec::new();
        buf.extend_from_slice(&try_encode_native_message(&v1).unwrap());
        buf.extend_from_slice(&try_encode_native_message(&v2).unwrap());
        buf.extend_from_slice(&try_encode_native_message(&v3).unwrap());

        let decoded = decode_native_messages(&buf).unwrap();
        assert_eq!(decoded.messages.len(), 3);
        assert_eq!(decoded.messages[0], v1);
        assert_eq!(decoded.messages[1], v2);
        assert_eq!(decoded.messages[2], v3);
        assert!(decoded.remaining.is_empty());
    }

    #[test]
    fn test_empty_buffer() {
        let decoded = decode_native_messages(&[]).unwrap();
        assert!(decoded.messages.is_empty());
        assert!(decoded.remaining.is_empty());
    }

    #[test]
    fn test_fewer_than_4_bytes_remaining() {
        let decoded = decode_native_messages(&[0x01, 0x02]).unwrap();
        assert!(decoded.messages.is_empty());
        assert_eq!(decoded.remaining.len(), 2);
    }

    #[test]
    fn test_frame_split_exactly_after_header() {
        let value = json!("hello");
        let frame = try_encode_native_message(&value).unwrap();

        // Only the 4-byte header
        let partial = &frame[..4];
        let decoded = decode_native_messages(partial).unwrap();
        assert!(decoded.messages.is_empty());
        assert_eq!(decoded.remaining.len(), 4);
    }

    #[test]
    fn test_invalid_json_returns_error() {
        // Encode a frame with valid header but garbage body
        let body = b"not valid json at all";
        let mut frame = Vec::new();
        frame.extend_from_slice(&(body.len() as u32).to_le_bytes());
        frame.extend_from_slice(body);

        let result = decode_native_messages(&frame);
        assert!(result.is_err());
        match result {
            Err(Error::InvalidJson(_)) => {} // expected
            _ => panic!("expected InvalidJson error"),
        }
    }

    #[test]
    fn test_oversized_frame() {
        let oversized = MAX_NATIVE_MESSAGE_BYTES + 1;
        let mut frame = Vec::new();
        frame.extend_from_slice(&(oversized as u32).to_le_bytes());

        let result = decode_native_messages(&frame);
        assert!(result.is_err());
        match result {
            Err(Error::OversizedFrame(n)) => assert_eq!(n, oversized),
            _ => panic!("expected OversizedFrame error"),
        }
    }

    #[test]
    fn test_non_ascii_utf8_string() {
        let value = json!("héllo wörld 🌍");
        let frame = try_encode_native_message(&value).unwrap();

        let decoded = decode_native_messages(&frame).unwrap();
        assert_eq!(decoded.messages.len(), 1);
        assert_eq!(decoded.messages[0], value);
    }

    #[test]
    fn test_various_json_types() {
        let values = vec![
            json!(null),
            json!(true),
            json!(false),
            json!(42),
            json!(3.5),
            json!("a string"),
            json!([1, 2, 3]),
            json!({"nested": {"a": [1, null, false]}}),
        ];

        for value in &values {
            let frame = try_encode_native_message(value).unwrap();
            let decoded = decode_native_messages(&frame).unwrap();
            assert_eq!(decoded.messages.len(), 1);
            assert_eq!(decoded.messages[0], *value);
            assert!(decoded.remaining.is_empty());
        }
    }

    #[test]
    fn test_roundtrip_with_multiple_frames_and_leftover() {
        let v1 = json!({"type": "request", "id": "abc"});
        let v2 = json!({"type": "response", "id": "abc", "ok": true, "result": null});

        let mut buf = Vec::new();
        buf.extend_from_slice(&try_encode_native_message(&v1).unwrap());
        buf.extend_from_slice(&try_encode_native_message(&v2).unwrap());
        // Append some garbage bytes (simulating partial next frame)
        buf.extend_from_slice(&[0xFF, 0xFF]);

        let decoded = decode_native_messages(&buf).unwrap();
        assert_eq!(decoded.messages.len(), 2);
        assert_eq!(decoded.remaining.len(), 2);
    }
}
