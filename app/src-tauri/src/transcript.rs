//! 转写文本的收尾：换行/回车转空格、压缩空白、最多 2000 字。

pub const MAX_TRANSCRIPT_CHARS: usize = 2000;

pub fn normalize_transcript(raw: &str) -> (String, bool) {
    let single_line: String = raw
        .chars()
        .map(|character| {
            if character == '\n' || character == '\r' {
                ' '
            } else {
                character
            }
        })
        .collect();
    let collapsed = single_line.split_whitespace().collect::<Vec<_>>().join(" ");
    let truncated = collapsed.chars().count() > MAX_TRANSCRIPT_CHARS;
    let text = collapsed
        .chars()
        .take(MAX_TRANSCRIPT_CHARS)
        .collect::<String>();
    (text, truncated)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_transcript() {
        let (text, truncated) = normalize_transcript("  hello\r\nworld \n");
        assert_eq!(text, "hello world");
        assert!(!truncated);

        let long = "a".repeat(MAX_TRANSCRIPT_CHARS + 20);
        let (text, truncated) = normalize_transcript(&long);
        assert_eq!(text.chars().count(), MAX_TRANSCRIPT_CHARS);
        assert!(truncated);
    }
}
