//! Utility functions for the TopGun backend.
//!
//! Contains pure helper functions for text processing and
//! question generation that are shared across command handlers.

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

// ─── JSON Extraction ─────────────────────────────────────────────────────────

/// 尝试从模型输出中截取 JSON 数组片段。
/// 即使模型在 JSON 前后加了解释文本，也能尽量把可解析部分提取出来。
pub fn extract_json_array_block(content: &str) -> String {
    let cleaned = content
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();

    if let (Some(start), Some(end)) = (cleaned.find('['), cleaned.rfind(']')) {
        if start < end {
            return cleaned[start..=end].trim().to_string();
        }
    }

    cleaned.to_string()
}

/// 尝试从模型输出中截取 JSON 对象片段。
/// 用于"第2轮完成后"的结构化结果解析。
pub fn extract_json_object_block(content: &str) -> String {
    let cleaned = content
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();

    if let (Some(start), Some(end)) = (cleaned.find('{'), cleaned.rfind('}')) {
        if start < end {
            return cleaned[start..=end].trim().to_string();
        }
    }

    cleaned.to_string()
}

// ─── CJK / Language Detection ────────────────────────────────────────────────

/// 判断字符是否为常见 CJK 范围，用于"中英混杂"质量判断。
pub fn is_cjk_char(ch: char) -> bool {
    ('\u{4E00}'..='\u{9FFF}').contains(&ch)
}

/// 若一条问题几乎全为英文字母（且无中文），则认为不合格。
pub fn looks_non_chinese_question(text: &str) -> bool {
    let ascii_letters = text.chars().filter(|c| c.is_ascii_alphabetic()).count();
    let cjk_count = text.chars().filter(|c| is_cjk_char(*c)).count();
    ascii_letters >= 6 && cjk_count == 0
}

// ─── Question Text Normalization ─────────────────────────────────────────────

/// 去掉模型常见的 "For topic ..." 机械前缀和前导编号。
pub fn normalize_question_text(raw: &str, topic: &str) -> String {
    let mut q = raw.replace(['\n', '\r'], " ");
    q = q.trim().to_string();

    let prefixes = vec![
        format!("For topic \"{}\",", topic),
        format!("For topic \"{}\":", topic),
        format!("For topic \"{}\" ", topic),
        format!("For topic '{}',", topic),
        format!("For topic '{}':", topic),
        format!("For topic '{}'", topic),
        format!("关于\"{}\"，", topic),
        format!("围绕\"{}\"，", topic),
    ];

    for prefix in prefixes {
        if q.starts_with(&prefix) {
            q = q[prefix.len()..]
                .trim_start_matches(&[':', '：', ',', '，', ' '][..])
                .trim()
                .to_string();
            break;
        }
    }

    // 兜底去掉通用英文前缀：For topic ... : / ,
    if q.to_lowercase().starts_with("for topic ") {
        if let Some(pos) = q.find(':').or_else(|| q.find(',')) {
            q = q[pos + 1..].trim().to_string();
        }
    }

    // 去掉前导编号，例如 "1. xxx" / "Q2: xxx"
    loop {
        let old = q.clone();
        q = q
            .trim_start_matches(|c: char| {
                c.is_ascii_digit() || matches!(c, ' ' | '.' | '。' | ')' | '）' | '-' | ':' | '：')
            })
            .trim_start()
            .to_string();

        if q.to_lowercase().starts_with('q') {
            q = q[1..]
                .trim_start_matches(|c: char| {
                    c.is_ascii_digit() || matches!(c, ' ' | '.' | ':' | '：' | ')' | '）')
                })
                .trim_start()
                .to_string();
        }

        if q == old {
            break;
        }
    }

    q.trim_matches('"')
        .trim_matches('\u{201C}')
        .trim_matches('\u{201D}')
        .trim()
        .to_string()
}

// ─── Fallback Question Builders ───────────────────────────────────────────────

use crate::state::ClarificationQuestion;

/// 澄清问题轨道：
/// - Practical: 面向业务落地、执行与风险控制
/// - Conceptual: 面向原理、概念边界、逻辑一致性
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ClarificationTrack {
    Practical,
    Conceptual,
}

/// 基于议题文本做轻量轨道识别。
/// 这是启发式规则：用于避免把“原理/逻辑类问题”强行按执行落地方式追问。
pub fn detect_clarification_track(topic: &str) -> ClarificationTrack {
    let conceptual_markers = [
        "原理", "逻辑", "本质", "定义", "理论", "哲学", "推导", "证明", "判据", "概念", "范式",
        "语义", "原音", "机制",
    ];
    let practical_markers = [
        "执行", "落地", "预算", "客户", "成交", "增长", "上线", "项目", "团队", "排期", "交付",
        "指标", "营收", "成本", "流程",
    ];

    let conceptual_hits = conceptual_markers
        .iter()
        .filter(|marker| topic.contains(**marker))
        .count();
    let practical_hits = practical_markers
        .iter()
        .filter(|marker| topic.contains(**marker))
        .count();

    if conceptual_hits > practical_hits {
        ClarificationTrack::Conceptual
    } else {
        ClarificationTrack::Practical
    }
}

/// 构造第一轮稳定兜底问题（中文 + 不重复贴标签）。
pub fn build_round1_fallback_questions(topic: &str) -> Vec<ClarificationQuestion> {
    match detect_clarification_track(topic) {
        ClarificationTrack::Practical => vec![
            ClarificationQuestion::new(
                "q1",
                "你这次讨论最希望达成的结果是什么？请给出可被验证的标准。",
            ),
            ClarificationQuestion::new(
                "q2",
                "当前场景涉及哪些关键人和资源？你手里已具备什么、最缺什么？",
            ),
            ClarificationQuestion::new(
                "q3",
                "在推进时有哪些绝对不能触碰的红线？若失败，最大失控点会在哪里？",
            ),
        ],
        ClarificationTrack::Conceptual => vec![
            ClarificationQuestion::new(
                "q1",
                "你希望这次讨论最终澄清什么：概念定义、判断标准，还是推理框架？",
            ),
            ClarificationQuestion::new(
                "q2",
                "你目前最困惑或最容易混淆的概念边界是什么？请给出一个具体例子。",
            ),
            ClarificationQuestion::new(
                "q3",
                "有哪些前提是你默认成立但尚未被验证的？若前提不成立会导致什么误判？",
            ),
        ],
    }
}

/// 从第一轮答案提取短语，生成更贴合上下文的第二轮兜底问题。
pub fn build_round2_fallback_questions(
    answered_insights: &[String],
    topic: &str,
) -> Vec<ClarificationQuestion> {
    let mut cleaned_insights: Vec<String> = answered_insights
        .iter()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(|s| {
            let max_chars = 26usize;
            let mut out = String::new();
            for ch in s.chars().take(max_chars) {
                out.push(ch);
            }
            if s.chars().count() > max_chars {
                out.push_str("...");
            }
            out
        })
        .collect();

    cleaned_insights.truncate(2);

    let track = detect_clarification_track(topic);
    if cleaned_insights.is_empty() {
        return match track {
            ClarificationTrack::Practical => vec![
                ClarificationQuestion::new(
                    "r2_q1",
                    "如果要在现实场景推进，这件事的最小可执行路径是什么？每一步的负责人、截止时间和验收标准分别是什么？",
                ),
                ClarificationQuestion::new(
                    "r2_q2",
                    "除了已知风险外，最可能导致整体失控的隐藏风险是什么？它的预警信号和兜底动作分别是什么？",
                ),
            ],
            ClarificationTrack::Conceptual => vec![
                ClarificationQuestion::new(
                    "r2_q1",
                    "为了避免概念混淆，你希望用哪些必要且充分的判据来界定这个命题是否成立？",
                ),
                ClarificationQuestion::new(
                    "r2_q2",
                    "有哪些常见解释应被明确排除？若不排除，最可能造成的误判或推理偏差是什么？",
                ),
            ],
        };
    }

    let insight_1 = cleaned_insights[0].clone();
    let insight_2 = cleaned_insights
        .get(1)
        .cloned()
        .unwrap_or_else(|| insight_1.clone());

    match track {
        ClarificationTrack::Practical => vec![
            ClarificationQuestion::new(
                "r2_q1",
                format!(
                    "你上一轮提到\"{}\"。若要落地，请补充最小执行路径：先做什么、谁负责、何时验收？",
                    insight_1
                ),
            ),
            ClarificationQuestion::new(
                "r2_q2",
                format!(
                    "你还提到\"{}\"。这里最容易被忽略的失败触发点是什么？一旦触发，你的止损和兜底动作是什么？",
                    insight_2
                ),
            ),
        ],
        ClarificationTrack::Conceptual => vec![
            ClarificationQuestion::new(
                "r2_q1",
                format!(
                    "你上一轮提到\"{}\"。请进一步说明它在你语境中的定义边界，以及与相近概念的关键区别。",
                    insight_1
                ),
            ),
            ClarificationQuestion::new(
                "r2_q2",
                format!(
                    "你还提到\"{}\"。若该前提不成立，哪条推理链会先失效？你希望如何检验这条链路？",
                    insight_2
                ),
            ),
        ],
    }
}

// ─── Topic Fragment / Round-2 Relevance ──────────────────────────────────────

/// 提取议题中的关键词碎片，用来判断第二轮问题是否"至少沾边"。
pub fn topic_fragments(topic: &str) -> Vec<String> {
    let compact: Vec<char> = topic
        .chars()
        .filter(|c| is_cjk_char(*c) || c.is_ascii_alphanumeric())
        .collect();

    let mut fragments = Vec::new();
    for n in 2..=4 {
        if compact.len() < n {
            continue;
        }
        for i in 0..=compact.len() - n {
            let frag: String = compact[i..i + n].iter().collect();
            if frag.chars().any(|c| c.is_ascii_digit()) {
                continue;
            }
            fragments.push(frag);
        }
    }

    fragments.sort();
    fragments.dedup();
    fragments
}

/// 第二轮问题至少要满足：
/// 1) 中文；
/// 2) 有"深化"语义（风险/约束/验证/里程碑等）；
/// 3) 与议题关键词或"这件事/当前议题"表述存在连接。
pub fn is_round2_question_relevant(question: &str, topic: &str) -> bool {
    if looks_non_chinese_question(question) {
        return false;
    }

    // 这一组词用于识别“实操深化追问”：
    // 不要求命中所有词，只要命中一个即可，避免过滤过严导致总走兜底模板。
    let practical_depth_markers = [
        "风险",
        "约束",
        "验证",
        "里程碑",
        "资源",
        "执行",
        "兜底",
        "预警",
        "失败",
        "负责人",
        "截止",
        "验收",
        "底线",
        "让步",
        "条件",
        "路径",
        "步骤",
        "阻力",
        "依赖",
        "触发",
        "止损",
        "阈值",
        "优先级",
        "取舍",
        "窗口",
        "信号",
    ];
    // 这一组词用于识别“概念深化追问”。
    let conceptual_depth_markers = [
        "定义",
        "边界",
        "概念",
        "本质",
        "逻辑",
        "前提",
        "假设",
        "判据",
        "反例",
        "推导",
        "误判",
        "语境",
        "解释",
        "条件",
        "区分",
        "歧义",
        "一致性",
        "冲突",
    ];

    let has_depth_signal = match detect_clarification_track(topic) {
        ClarificationTrack::Practical => practical_depth_markers
            .iter()
            .any(|marker| question.contains(marker)),
        ClarificationTrack::Conceptual => conceptual_depth_markers
            .iter()
            .any(|marker| question.contains(marker)),
    };
    if !has_depth_signal {
        return false;
    }

    // 除了“当前议题”这类指代词，也接受“上一轮回答/刚才提到”的上下文承接词，
    // 这样模型生成的自然追问不会被误判为不相关。
    let has_context_reference = question.contains("这件事")
        || question.contains("当前议题")
        || question.contains("这个方案")
        || question.contains("上一轮")
        || question.contains("上轮")
        || question.contains("你提到")
        || question.contains("你刚才")
        || question.contains("前面提到")
        || question.contains("基于你");
    if has_context_reference {
        return true;
    }

    let fragments = topic_fragments(topic);
    fragments.iter().any(|frag| question.contains(frag))
}

// ─── Timestamp ───────────────────────────────────────────────────────────────

/// 生成用于文件名的时间戳字符串。
pub fn file_timestamp() -> String {
    chrono::Local::now().format("%Y-%m-%d_%H-%M-%S").to_string()
}

/// 以“临时文件写入 -> fsync -> rename”的方式写入文本文件。
/// 这样即使中途中断，也尽量避免把目标文件写成半截内容。
pub fn atomic_write_text_file(path: &Path, content: &str) -> std::io::Result<()> {
    let parent = path.parent().unwrap_or_else(|| Path::new("."));
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("data.json");
    let tmp_path = parent.join(format!(
        ".{}.tmp-{}-{}",
        file_name,
        std::process::id(),
        chrono::Utc::now().timestamp_millis()
    ));

    let mut file = OpenOptions::new()
        .create(true)
        .truncate(true)
        .write(true)
        .open(&tmp_path)?;
    file.write_all(content.as_bytes())?;
    file.sync_all()?;
    drop(file);

    match fs::rename(&tmp_path, path) {
        Ok(_) => Ok(()),
        Err(rename_err) => {
            // 在 Windows 上，目标存在时 rename 可能失败，这里做一次替换式重试。
            if path.exists() {
                let _ = fs::remove_file(path);
                let retry_result = fs::rename(&tmp_path, path);
                if retry_result.is_ok() {
                    return Ok(());
                }
                let _ = fs::remove_file(&tmp_path);
                return retry_result;
            }

            let _ = fs::remove_file(&tmp_path);
            Err(rename_err)
        }
    }
}

/// 备份损坏文件并移走原文件，返回备份路径。
/// 备份命名形如：`history.json.corrupt-history-json-2026-03-04_12-00-00`
pub fn move_corrupt_file(path: &Path, tag: &str) -> std::io::Result<Option<PathBuf>> {
    if !path.exists() {
        return Ok(None);
    }

    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("data.json");
    let backup_path = path.with_file_name(format!(
        "{}.corrupt-{}-{}",
        file_name,
        tag,
        file_timestamp()
    ));

    match fs::rename(path, &backup_path) {
        Ok(_) => Ok(Some(backup_path)),
        Err(_) => {
            fs::copy(path, &backup_path)?;
            fs::remove_file(path)?;
            Ok(Some(backup_path))
        }
    }
}

#[cfg(test)]
mod tests;
