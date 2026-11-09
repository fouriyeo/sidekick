//! 英语角双端同步的合并规则。
//!
//! 身份 = `normalized`（同一句词在两端天然同 id）。合并是**字段级**而不是整行覆盖：
//! 解释取「已有解释且 explained_at 较新」的一方；备注/语境按 updated_at 后写胜；
//! 墓碑较新则删除；created_at 取较早值。桌面是时间权威（手机游标用桌面时钟）。

use super::types::{WordRow, WordStatus};

/// 合并本地与远端词条；`local` 为 None 表示新词条。
pub fn merge(local: Option<&WordRow>, incoming: WordRow) -> WordRow {
    let Some(local) = local else {
        return normalize_incoming(incoming);
    };

    let local_newer = incoming.updated_at >= local.updated_at;
    let updated_at = local.updated_at.max(incoming.updated_at);
    let created_at = match (local.created_at, incoming.created_at) {
        (0, other) | (other, 0) => other,
        (a, b) => a.min(b),
    };

    // 墓碑：较新的删除生效，且不能被较旧的更新复活。
    let deleted_at = match (local.deleted_at, incoming.deleted_at) {
        (None, None) => None,
        (Some(local_deleted), None) => {
            if incoming.updated_at > local_deleted {
                None
            } else {
                Some(local_deleted)
            }
        }
        (None, Some(incoming_deleted)) => Some(incoming_deleted),
        (Some(local_deleted), Some(incoming_deleted)) => Some(local_deleted.min(incoming_deleted)),
    };

    // 解释：有解释的一方优先；两边都有解释时 explained_at 较新者胜。
    let (explanation, explained_at, model, prompt_version) =
        match (&local.explanation, &incoming.explanation) {
            (None, Some(_)) => (
                incoming.explanation.clone(),
                incoming.explained_at,
                incoming.model.clone(),
                incoming.prompt_version,
            ),
            (Some(_), None) => (
                local.explanation.clone(),
                local.explained_at,
                local.model.clone(),
                local.prompt_version,
            ),
            (Some(_), Some(_)) => {
                if incoming.explained_at.unwrap_or(0) >= local.explained_at.unwrap_or(0) {
                    (
                        incoming.explanation.clone(),
                        incoming.explained_at,
                        incoming.model.clone(),
                        incoming.prompt_version,
                    )
                } else {
                    (
                        local.explanation.clone(),
                        local.explained_at,
                        local.model.clone(),
                        local.prompt_version,
                    )
                }
            }
            (None, None) => (None, None, None, None),
        };

    let status = if explanation.is_some() {
        WordStatus::Ready
    } else if incoming.status == WordStatus::Failed || local.status == WordStatus::Failed {
        WordStatus::Failed
    } else {
        WordStatus::Pending
    };

    let (note, context) = if local_newer {
        (incoming.note.clone(), incoming.context.clone())
    } else {
        (local.note.clone(), local.context.clone())
    };

    let last_error = if status == WordStatus::Failed {
        incoming
            .last_error
            .clone()
            .or_else(|| local.last_error.clone())
    } else {
        None
    };

    WordRow {
        id: local.id.clone(),
        word: if local_newer { incoming.word } else { local.word.clone() },
        normalized: local.normalized.clone(),
        status,
        explanation,
        note,
        context,
        source: if local_newer { incoming.source } else { local.source },
        created_at,
        updated_at,
        explained_at,
        deleted_at,
        model,
        prompt_version,
        rev: local.rev.max(incoming.rev) + 1,
        last_error,
        dirty: false,
    }
}

fn normalize_incoming(mut incoming: WordRow) -> WordRow {
    if incoming.created_at == 0 {
        incoming.created_at = incoming.updated_at;
    }
    if incoming.updated_at == 0 {
        incoming.updated_at = super::now_ms();
    }
    if incoming.id.is_empty() {
        incoming.id = incoming.normalized.clone();
    }
    if incoming.rev < 1 {
        incoming.rev = 1;
    }
    incoming
}

/// 把词库导出为 Markdown（导出弹层与测试共用）。
pub fn to_markdown(rows: &[WordRow]) -> String {
    let live = rows.iter().filter(|row| row.deleted_at.is_none()).count();
    let mut out = String::new();
    out.push_str(&format!("# 英语角词库（{live} 个词）\n\n"));
    for row in rows.iter().filter(|row| row.deleted_at.is_none()) {
        let explanation = row.explanation_value();
        let phonetic = explanation
            .as_ref()
            .and_then(|value| value.phonetic.clone())
            .unwrap_or_default();
        let pos = explanation
            .as_ref()
            .and_then(|value| value.pos.clone())
            .unwrap_or_default();
        let mut title = format!("## {}", row.word);
        if !phonetic.is_empty() {
            title.push_str(&format!(" {phonetic}"));
        }
        if !pos.is_empty() {
            title.push_str(&format!(" {pos}"));
        }
        out.push_str(&title);
        out.push_str("\n\n");
        if let Some(note) = row.note.as_deref().filter(|text| !text.trim().is_empty()) {
            out.push_str(&format!("> 备注：{note}\n\n"));
        }
        if let Some(explanation) = explanation {
            for definition in &explanation.definitions {
                out.push_str(&format!("- {}\n", definition.zh));
            }
            for example in &explanation.examples {
                out.push_str(&format!("  - {}（{}）\n", example.en, example.zh));
            }
        } else if row.status == WordStatus::Failed {
            out.push_str("- （解释失败）\n");
        } else {
            out.push_str("- （待解释）\n");
        }
        out.push('\n');
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::word::types::{WordSource, WordStatus};

    fn row(
        normalized: &str,
        status: WordStatus,
        explanation: Option<&str>,
        updated_at: i64,
    ) -> WordRow {
        WordRow {
            id: normalized.into(),
            word: normalized.into(),
            normalized: normalized.into(),
            status,
            explanation: explanation.map(str::to_string),
            note: None,
            context: None,
            source: WordSource::Manual,
            created_at: 100,
            updated_at,
            explained_at: explanation.map(|_| updated_at),
            deleted_at: None,
            model: None,
            prompt_version: None,
            rev: 1,
            last_error: None,
            dirty: false,
        }
    }

    #[test]
    fn new_entry_is_taken_as_is() {
        let merged = merge(None, row("run", WordStatus::Ready, Some("{}"), 200));
        assert_eq!(merged.status, WordStatus::Ready);
        assert_eq!(merged.rev, 1);
    }

    #[test]
    fn explanation_survives_stale_pending_push() {
        // 桌面已解释；手机稍后又推了一个 pending（updated_at 更晚）——解释不能丢。
        let local = row("run", WordStatus::Ready, Some("{\"word\":\"run\"}"), 200);
        let incoming = row("run", WordStatus::Pending, None, 300);
        let merged = merge(Some(&local), incoming);
        assert_eq!(merged.status, WordStatus::Ready);
        assert!(merged.explanation.is_some());
    }

    #[test]
    fn newer_explanation_wins() {
        let local = row("run", WordStatus::Ready, Some("{\"word\":\"run\",\"v\":1}"), 200);
        let mut incoming = row("run", WordStatus::Ready, Some("{\"word\":\"run\",\"v\":2}"), 400);
        incoming.explained_at = Some(400);
        let merged = merge(Some(&local), incoming);
        assert!(merged.explanation.unwrap().contains("\"v\":2"));
    }

    #[test]
    fn tombstone_wins_and_blocks_resurrection() {
        let mut local = row("run", WordStatus::Ready, Some("{}"), 200);
        local.deleted_at = Some(300);
        let incoming = row("run", WordStatus::Pending, None, 250);
        let merged = merge(Some(&local), incoming);
        assert_eq!(merged.deleted_at, Some(300));

        // 更新时间的复活（显式重新添加）可以清墓碑。
        let incoming = row("run", WordStatus::Pending, None, 400);
        let merged = merge(Some(&local), incoming);
        assert_eq!(merged.deleted_at, None);
    }

    #[test]
    fn markdown_lists_words_and_skips_deleted() {
        let mut ready = row("run", WordStatus::Ready, Some("{\"word\":\"run\",\"definitions\":[{\"zh\":\"跑\"}],\"examples\":[]}"), 200);
        ready.note = Some("在报错里看到".into());
        let mut deleted = row("gone", WordStatus::Ready, Some("{}"), 300);
        deleted.deleted_at = Some(300);
        let text = to_markdown(&[ready, deleted]);
        assert!(text.contains("## run"));
        assert!(text.contains("- 跑"));
        assert!(text.contains("> 备注：在报错里看到"));
        assert!(!text.contains("## gone"));
        assert!(text.contains("1 个词"));
    }

    #[test]
    fn created_at_keeps_earlier_value() {
        let local = row("run", WordStatus::Ready, Some("{}"), 200);
        let mut incoming = row("run", WordStatus::Ready, Some("{}"), 500);
        incoming.created_at = 50;
        let merged = merge(Some(&local), incoming);
        assert_eq!(merged.created_at, 50);
    }

}
