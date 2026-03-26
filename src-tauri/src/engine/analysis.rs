use crate::utils::extract_json_object_block;
use serde::Deserialize;

/// Maximum character length for a single agent's context before truncation.
/// Rough heuristic: ~3 chars per token => 6000 chars ~= 2000 tokens.
pub(crate) const MAX_AGENT_CONTENT_CHARS: usize = 6000;

pub(crate) fn truncate_context(content: &str) -> String {
    if content.len() <= MAX_AGENT_CONTENT_CHARS {
        return content.to_string();
    }

    let keep = MAX_AGENT_CONTENT_CHARS / 2;
    // Keep byte slicing UTF-8 safe to avoid panics on CJK/multibyte chars.
    let head_end = floor_char_boundary(content, keep);
    let tail_start = ceil_char_boundary(content, content.len().saturating_sub(keep));
    let head = &content[..head_end];
    let tail = &content[tail_start..];

    format!(
        "{}\n\n... [content truncated, removed {} chars] ...\n\n{}",
        head,
        content.len() - MAX_AGENT_CONTENT_CHARS,
        tail
    )
}

fn floor_char_boundary(content: &str, mut index: usize) -> usize {
    if index >= content.len() {
        return content.len();
    }
    while index > 0 && !content.is_char_boundary(index) {
        index -= 1;
    }
    index
}

fn ceil_char_boundary(content: &str, mut index: usize) -> usize {
    if index >= content.len() {
        return content.len();
    }
    while index < content.len() && !content.is_char_boundary(index) {
        index += 1;
    }
    index
}

#[derive(Debug, Deserialize)]
struct ExaminationStructuredResponse {
    #[serde(default)]
    has_major_objection: Option<bool>,
    #[serde(default)]
    objection_items: Vec<String>,
    #[serde(default)]
    review_summary: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ExaminationParseMode {
    StrictJson,
    RepairedJson,
    TextFallback,
}

/// 前端“容忍风险清单”最终展示所需的结构化字段。
///
/// 这样 UI 不再直接显示原始长文本/JSON 残片，而是展示：
/// - 风险摘要
/// - 证据说明
/// - 后续动作
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct RiskDisplayItem {
    pub risk_summary: String,
    pub evidence: String,
    pub next_action: String,
}

fn truncate_chars(input: &str, max_chars: usize) -> String {
    if input.chars().count() <= max_chars {
        return input.to_string();
    }

    let mut out = String::new();
    for ch in input.chars().take(max_chars) {
        out.push(ch);
    }
    out.push_str("...");
    out
}

fn compact_whitespace(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn contains_cjk(text: &str) -> bool {
    text.chars()
        .any(|ch| ('\u{4E00}'..='\u{9FFF}').contains(&ch))
}

fn build_risk_summary(detail: &str) -> String {
    let compact = compact_whitespace(detail);
    if compact.is_empty() {
        return "存在未收敛风险，需要人工复核".to_string();
    }

    let separators = ['。', '；', ';', '\n'];
    let first_sentence = compact
        .split(|ch| separators.contains(&ch))
        .next()
        .unwrap_or(&compact)
        .trim();

    let mut summary = String::new();
    for ch in first_sentence.chars().take(36) {
        summary.push(ch);
    }
    if first_sentence.chars().count() > 36 {
        summary.push_str("...");
    }

    if summary.is_empty() {
        "存在未收敛风险，需要人工复核".to_string()
    } else if contains_cjk(&summary) {
        summary
    } else {
        format!("风险陈述（原文）: {}", summary)
    }
}

fn build_next_action_hint(detail: &str) -> String {
    let lowered = detail.to_lowercase();

    if lowered.contains("legal")
        || lowered.contains("compliance")
        || detail.contains("合规")
        || detail.contains("法务")
    {
        return "先完成法务/合规复核，再给出可执行替代方案与审批节点。".to_string();
    }
    if lowered.contains("data")
        || lowered.contains("sample")
        || detail.contains("数据")
        || detail.contains("口径")
        || detail.contains("偏差")
    {
        return "补充可复现数据样本，统一口径后再复核该结论。".to_string();
    }
    if lowered.contains("resource")
        || lowered.contains("budget")
        || detail.contains("预算")
        || detail.contains("资源")
        || detail.contains("成本")
    {
        return "补齐资源与预算边界，明确责任人和验收时间点。".to_string();
    }
    if lowered.contains("coercive")
        || lowered.contains("harassment")
        || detail.contains("压迫")
        || detail.contains("信任")
        || detail.contains("冲突")
    {
        return "改为自愿机制并加入保护条款，避免策略引发关系与声誉风险。".to_string();
    }

    "补充证据并安排下一轮定向复核，确认是否继续执行。".to_string()
}

fn parse_json_value_loose(raw: &str) -> Option<serde_json::Value> {
    serde_json::from_str::<serde_json::Value>(raw)
        .ok()
        .or_else(|| json5::from_str::<serde_json::Value>(raw).ok())
}

fn extract_quoted_segments(raw: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut in_quotes = false;
    let mut escape = false;
    let mut buf = String::new();

    for ch in raw.chars() {
        if !in_quotes {
            if ch == '"' {
                in_quotes = true;
                buf.clear();
            }
            continue;
        }

        if escape {
            buf.push(ch);
            escape = false;
            continue;
        }

        if ch == '\\' {
            escape = true;
            continue;
        }

        if ch == '"' {
            let text = compact_whitespace(
                buf.trim()
                    .trim_matches('"')
                    .trim_matches('“')
                    .trim_matches('”')
                    .trim_matches('\'')
                    .trim_start_matches(['-', '*', '•', ' '])
                    .trim(),
            );
            if !text.is_empty() {
                out.push(text);
            }
            in_quotes = false;
            continue;
        }

        buf.push(ch);
    }

    out
}

fn extract_objection_items_from_json_like(raw: &str) -> Vec<String> {
    let markers = ["objection_items", "objectionItems", "objections", "issues"];

    for marker in markers {
        let Some(marker_start) = raw.find(marker) else {
            continue;
        };

        let marker_tail = &raw[marker_start..];
        let Some(left_bracket_rel) = marker_tail.find('[') else {
            continue;
        };

        let array_start = marker_start + left_bracket_rel + 1;
        let array_tail = &raw[array_start..];
        let array_end_rel = array_tail.find(']').unwrap_or(array_tail.len());
        let array_inner = &array_tail[..array_end_rel];

        let mut items = extract_quoted_segments(array_inner);
        items.retain(|item| {
            let lowered = item.to_lowercase();
            !lowered.contains("has_major_objection")
                && !lowered.contains("objection_items")
                && !lowered.contains("review_summary")
        });

        if !items.is_empty() {
            items.sort();
            items.dedup();
            return items;
        }

        // 若引号提取失败，退化为逗号切分。
        let split_items = array_inner
            .split(',')
            .map(normalize_objection_text)
            .filter(|part| {
                if part.is_empty() {
                    return false;
                }
                let lowered = part.to_lowercase();
                !lowered.contains("has_major_objection")
                    && !lowered.contains("objection_items")
                    && !lowered.contains("review_summary")
            })
            .collect::<Vec<_>>();

        if !split_items.is_empty() {
            let mut dedup = split_items;
            dedup.sort();
            dedup.dedup();
            return dedup;
        }
    }

    Vec::new()
}

fn sanitize_objection_text(raw: &str) -> String {
    let cleaned = raw
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```JSON")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();

    if cleaned.is_empty() {
        return String::new();
    }

    // 如果是“看起来像 JSON 的文本”，优先抽出 objection_items / summary。
    if cleaned.starts_with('{') {
        if let Some(value) = parse_json_value_loose(cleaned) {
            let mut extracted = Vec::new();

            if let Some(obj) = value.as_object() {
                for key in [
                    "objection_items",
                    "objectionItems",
                    "objections",
                    "major_objections",
                    "majorObjections",
                    "issues",
                ] {
                    if let Some(v) = obj.get(key) {
                        collect_objection_items_from_value(v, &mut extracted);
                    }
                }

                if extracted.is_empty() {
                    for key in ["review_summary", "reviewSummary", "summary", "reason"] {
                        if let Some(v) = obj.get(key) {
                            collect_objection_items_from_value(v, &mut extracted);
                        }
                    }
                }
            }

            extracted.sort();
            extracted.dedup();

            if !extracted.is_empty() {
                let joined = extracted.join("；");
                return truncate_chars(&compact_whitespace(&joined), 220);
            }
        }

        // JSON 解析失败时，尝试从 objection_items 的数组文本做一层弱提取。
        let extracted_from_json_like = extract_objection_items_from_json_like(cleaned);
        if !extracted_from_json_like.is_empty() {
            let joined = extracted_from_json_like.join("；");
            return truncate_chars(&compact_whitespace(&joined), 220);
        }
    }

    // 兜底：即使不是完整 JSON，也尝试从“json-like 文本”里抽 objection_items。
    let extracted_from_json_like = extract_objection_items_from_json_like(cleaned);
    if !extracted_from_json_like.is_empty() {
        let joined = extracted_from_json_like.join("；");
        return truncate_chars(&compact_whitespace(&joined), 220);
    }

    let compact = compact_whitespace(cleaned).replace("```", "");
    truncate_chars(&compact, 220)
}

fn normalize_objection_text(raw: &str) -> String {
    let pre_cleaned = raw.trim().trim_start_matches(['-', '*', '•', ' ']).trim();
    sanitize_objection_text(pre_cleaned)
}

fn collect_objection_items_from_value(value: &serde_json::Value, output: &mut Vec<String>) {
    match value {
        serde_json::Value::String(s) => {
            let text = normalize_objection_text(s);
            if !text.is_empty() {
                output.push(text);
            }
        }
        serde_json::Value::Array(items) => {
            for item in items {
                collect_objection_items_from_value(item, output);
            }
        }
        serde_json::Value::Object(obj) => {
            for key in [
                "item",
                "content",
                "reason",
                "message",
                "text",
                "title",
                "detail",
                "risk_summary",
                "riskSummary",
                "evidence",
                "recommended_fix",
                "recommendedFix",
                "mitigation",
                "next_action",
                "nextAction",
            ] {
                if let Some(v) = obj.get(key) {
                    collect_objection_items_from_value(v, output);
                }
            }
        }
        _ => {}
    }
}

fn parse_examination_text_fallback(content: &str) -> (bool, Vec<String>) {
    let trimmed = content.trim();
    if trimmed.is_empty() {
        return (false, vec![]);
    }

    let lowered = trimmed.to_lowercase();
    let no_objection_markers = [
        "no_major_objection",
        "\"has_major_objection\": false",
        "\"has_major_objection\":false",
        "\"hasMajorObjection\": false",
        "\"hasMajorObjection\":false",
        "no major objection",
        "无重大异议",
        "没有重大异议",
        "无需重大修补",
        "通过审查",
        "has_major_objection\": false",
    ];
    if no_objection_markers
        .iter()
        .any(|marker| lowered.contains(&marker.to_lowercase()))
    {
        return (false, vec![]);
    }

    let objection_markers = [
        "重大异议",
        "致命缺陷",
        "fatal flaw",
        "major objection",
        "objection",
    ];
    let has_objection_signal = objection_markers
        .iter()
        .any(|marker| lowered.contains(&marker.to_lowercase()));

    // 关键修正：
    // 旧逻辑里“长度 > 60”会被当作异议，导致 has_major_objection=false 的长文本也误入风险清单。
    // 现在只在明确命中“异议信号词”时才判定为 true。
    if has_objection_signal {
        let normalized = sanitize_objection_text(trimmed);
        if normalized.is_empty() {
            return (
                true,
                vec!["模型判定存在重大异议，但未返回可读细项。".to_string()],
            );
        }
        return (true, vec![normalized]);
    }

    (false, vec![])
}

pub(crate) fn examination_parse_mode_name(mode: ExaminationParseMode) -> &'static str {
    match mode {
        ExaminationParseMode::StrictJson => "strict-json",
        ExaminationParseMode::RepairedJson => "repaired-json",
        ExaminationParseMode::TextFallback => "text-fallback",
    }
}

fn finalize_objection_decision(
    explicit_flag: Option<bool>,
    mut items: Vec<String>,
    review_summary: &str,
) -> (bool, Vec<String>) {
    items.retain(|item| !item.trim().is_empty());
    items.sort();
    items.dedup();

    if explicit_flag == Some(false) {
        // 明确声明“无重大异议”时，强制以 false 为准，避免误判进入容忍风险清单。
        return (false, vec![]);
    }

    if explicit_flag == Some(true) {
        if items.is_empty() {
            let summary = normalize_objection_text(review_summary);
            if !summary.is_empty() {
                items.push(summary);
            } else {
                items.push("模型判定存在重大异议，但未返回细项。".to_string());
            }
        }
        return (true, items);
    }

    // 未显式给布尔值时，采用“有条目即有异议”的保守规则。
    if !items.is_empty() {
        return (true, items);
    }

    let (summary_has_objection, mut summary_items) =
        parse_examination_text_fallback(review_summary);
    if summary_has_objection {
        summary_items.retain(|item| !item.trim().is_empty());
        summary_items.sort();
        summary_items.dedup();
        if summary_items.is_empty() {
            summary_items.push("模型判定存在重大异议，但未返回细项。".to_string());
        }
        return (true, summary_items);
    }

    (false, vec![])
}

pub(crate) fn parse_examination_response_with_repair(
    content: &str,
) -> (bool, Vec<String>, ExaminationParseMode) {
    let json_block = extract_json_object_block(content);

    if let Ok(parsed) = serde_json::from_str::<ExaminationStructuredResponse>(&json_block) {
        let items: Vec<String> = parsed
            .objection_items
            .iter()
            .map(|item| normalize_objection_text(item))
            .filter(|item| !item.is_empty())
            .collect();
        let (has_major_objection, final_items) =
            finalize_objection_decision(parsed.has_major_objection, items, &parsed.review_summary);
        return (
            has_major_objection,
            final_items,
            ExaminationParseMode::StrictJson,
        );
    }

    if let Some(value) = parse_json_value_loose(&json_block) {
        let mut explicit_flag: Option<bool> = None;
        let mut items = Vec::new();
        let mut review_summary = String::new();

        for key in [
            "has_major_objection",
            "hasMajorObjection",
            "major_objection",
            "majorObjection",
            "has_objection",
            "hasObjection",
        ] {
            if let Some(v) = value.get(key).and_then(|v| v.as_bool()) {
                explicit_flag = Some(match explicit_flag {
                    Some(previous) => previous || v,
                    None => v,
                });
            }
        }

        if let Some(obj) = value.as_object() {
            for key in [
                "objection_items",
                "objectionItems",
                "objections",
                "major_objections",
                "majorObjections",
                "issues",
            ] {
                if let Some(v) = obj.get(key) {
                    collect_objection_items_from_value(v, &mut items);
                }
            }

            for key in ["review_summary", "reviewSummary", "summary", "reason"] {
                if let Some(v) = obj.get(key) {
                    let mut parts = Vec::new();
                    collect_objection_items_from_value(v, &mut parts);
                    if !parts.is_empty() {
                        if !review_summary.is_empty() {
                            review_summary.push('；');
                        }
                        review_summary.push_str(&parts.join("；"));
                    } else if let Some(text) = v.as_str() {
                        let normalized = normalize_objection_text(text);
                        if !normalized.is_empty() {
                            if !review_summary.is_empty() {
                                review_summary.push('；');
                            }
                            review_summary.push_str(&normalized);
                        }
                    }
                }
            }
        }

        let (has_major_objection, final_items) =
            finalize_objection_decision(explicit_flag, items, &review_summary);

        return (
            has_major_objection,
            final_items,
            ExaminationParseMode::RepairedJson,
        );
    }

    let (has_major_objection, items) = parse_examination_text_fallback(content);
    (
        has_major_objection,
        items,
        ExaminationParseMode::TextFallback,
    )
}

/// 给“容忍风险清单”做最终展示清洗：
/// - 尽量提取 objection_items 文本
/// - 兜底时压缩空白、截断超长文本
pub(crate) fn normalize_objection_for_risk_display(raw: &str) -> Vec<RiskDisplayItem> {
    let (_, mut items, _) = parse_examination_response_with_repair(raw);
    if items.is_empty() {
        let fallback = sanitize_objection_text(raw);
        if fallback.is_empty() {
            return vec![RiskDisplayItem {
                risk_summary: "存在未收敛风险，需要人工复核".to_string(),
                evidence: "模型判定存在重大异议，但未返回可读细项。".to_string(),
                next_action: "补充证据并安排下一轮定向复核，确认是否继续执行。".to_string(),
            }];
        }
        return vec![RiskDisplayItem {
            risk_summary: build_risk_summary(&fallback),
            evidence: fallback.clone(),
            next_action: build_next_action_hint(&fallback),
        }];
    }

    for item in &mut items {
        *item = sanitize_objection_text(item);
    }
    items.retain(|item| !item.trim().is_empty());
    items.sort();
    items.dedup();

    if items.is_empty() {
        vec![RiskDisplayItem {
            risk_summary: "存在未收敛风险，需要人工复核".to_string(),
            evidence: "模型判定存在重大异议，但未返回可读细项。".to_string(),
            next_action: "补充证据并安排下一轮定向复核，确认是否继续执行。".to_string(),
        }]
    } else {
        items
            .into_iter()
            .map(|detail| RiskDisplayItem {
                risk_summary: build_risk_summary(&detail),
                evidence: detail.clone(),
                next_action: build_next_action_hint(&detail),
            })
            .collect()
    }
}
