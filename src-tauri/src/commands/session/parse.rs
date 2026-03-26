use crate::llm::{LLMClient, Message};
use crate::state::ClarificationQuestion;
use crate::utils::{
    extract_json_array_block, extract_json_object_block, looks_non_chinese_question,
    normalize_question_text, ClarificationTrack,
};
use serde_json::Value;
use std::collections::HashSet;

#[derive(serde::Deserialize)]
#[allow(dead_code)]
struct ClarificationResponse {
    recommended_frameworks: Vec<String>,
    reframed_issue: String,
}

fn extract_fenced_code_blocks(content: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut remaining = content;

    loop {
        let Some(start) = remaining.find("```") else {
            break;
        };
        let after_tick = &remaining[start + 3..];
        let Some(first_newline) = after_tick.find('\n') else {
            break;
        };
        let payload = &after_tick[first_newline + 1..];
        let Some(end) = payload.find("```") else {
            break;
        };
        let block = payload[..end].trim();
        if !block.is_empty() {
            out.push(block.to_string());
        }
        remaining = &payload[end + 3..];
    }

    out
}

/// 阶段二最终输出（问题简报）。
pub(crate) struct CompletedProblemDelivery {
    pub(crate) brief_markdown: String,
}

/// 判断是否已经进入“最终交付”响应并抽取问题简报代码块。
pub(crate) fn detect_problem_brief_completion(content: &str) -> Option<CompletedProblemDelivery> {
    let has_trigger = content.contains("最终输出") || content.contains("专家级问题简报");
    if !has_trigger {
        return None;
    }

    let blocks = extract_fenced_code_blocks(content);
    let brief_markdown = if let Some(hit) = blocks
        .iter()
        .find(|block| block.contains("专家级问题简报"))
        .cloned()
    {
        hit
    } else if let Some(first) = blocks.first() {
        first.clone()
    } else {
        let trimmed = content.trim();
        if trimmed.is_empty() {
            return None;
        }
        trimmed.to_string()
    };

    Some(CompletedProblemDelivery {
        brief_markdown,
    })
}

/// 把框架 ID 列表渲染成“推荐专家（人的身份）”说明文本（给 UI 展示用，不下发给各框架 Agent）。
pub(crate) fn build_identity_experts_panel_from_frameworks(framework_ids: &[String]) -> String {
    let mut lines = vec![
        "# 推荐专家（人的身份）".to_string(),
        "".to_string(),
        "建议你分别从以下身份视角审视同一问题：".to_string(),
    ];

    for (idx, id) in framework_ids.iter().enumerate() {
        let identity = match id.as_str() {
            "first_principles" => "老板 / 创业者（看本质目标和底层约束）",
            "systems_thinking" => "组织负责人（看系统联动和长期反馈）",
            "game_theory" => "谈判负责人（看各方策略与博弈平衡）",
            "behavioral_econ" => "一线员工（看激励、心理和行为反应）",
            "design_thinking" => "用户/客户（看真实体验与痛点）",
            "lean_startup" => "产品经理（看小步试错与快速验证）",
            "theory_of_constraints" => "运营经理（看瓶颈与吞吐）",
            "value_proposition" => "客户成功经理（看价值匹配）",
            "bayesian_thinking" => "数据分析师（看概率与证据更新）",
            "second_order" => "风险负责人（看二阶影响与副作用）",
            "complex_adaptive" => "变革管理者（看复杂系统涌现）",
            _ => "关键利益相关者（从不同角色立场补全盲区）",
        };
        lines.push(format!("{}. {}（{}）", idx + 1, id, identity));
    }

    lines.join("\n")
}

/// 从 JSON 值中提取问题文本。
/// 兼容多种模型常见字段，尽量避免“字段名稍有变化就整组回退”。
#[allow(dead_code)]
fn extract_question_text_from_value(value: &Value) -> Option<String> {
    match value {
        Value::String(text) => Some(text.to_string()),
        Value::Object(obj) => {
            let keys = ["question", "q", "text", "prompt", "问题", "内容"];
            for key in keys {
                if let Some(Value::String(text)) = obj.get(key) {
                    return Some(text.to_string());
                }
            }
            None
        }
        _ => None,
    }
}

/// 从 JSON 值中提取问题 ID（可选）。
#[allow(dead_code)]
fn extract_question_id_from_value(value: &Value) -> Option<String> {
    let obj = value.as_object()?;
    let keys = ["id", "qid", "question_id", "questionId"];
    for key in keys {
        if let Some(Value::String(id)) = obj.get(key) {
            let trimmed = id.trim();
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }
    }
    None
}

#[allow(dead_code)]
fn is_short_q_style_key(lower_key: &str) -> bool {
    if let Some(rest) = lower_key.strip_prefix("r2_q") {
        return !rest.is_empty()
            && rest
                .chars()
                .all(|c| c.is_ascii_digit() || c == '_' || c == '-');
    }

    if let Some(rest) = lower_key.strip_prefix('q') {
        return !rest.is_empty()
            && rest
                .chars()
                .all(|c| c.is_ascii_digit() || c == '_' || c == '-');
    }

    false
}

#[allow(dead_code)]
fn looks_like_question_key(key: &str) -> bool {
    let lower = key.to_lowercase();
    lower.contains("question")
        || lower.contains("问题")
        || lower.contains("追问")
        || lower == "q"
        || is_short_q_style_key(&lower)
}

#[allow(dead_code)]
fn collect_question_candidates_from_json(
    value: &Value,
    output: &mut Vec<(Option<String>, String)>,
) {
    match value {
        Value::String(text) => {
            let trimmed = text.trim();
            if !trimmed.is_empty() {
                output.push((None, trimmed.to_string()));
            }
        }
        Value::Array(items) => {
            for item in items {
                collect_question_candidates_from_json(item, output);
            }
        }
        Value::Object(obj) => {
            let maybe_id = extract_question_id_from_value(value);
            let direct_keys = ["question", "q", "text", "prompt", "问题", "内容"];
            let container_keys = [
                "questions",
                "question_list",
                "questionList",
                "follow_up_questions",
                "followUpQuestions",
                "followups",
                "items",
                "list",
                "追问列表",
            ];

            let mut pushed_direct = false;
            for key in direct_keys {
                if let Some(Value::String(text)) = obj.get(key) {
                    let trimmed = text.trim();
                    if !trimmed.is_empty() {
                        output.push((maybe_id.clone(), trimmed.to_string()));
                        pushed_direct = true;
                    }
                }
            }

            if !pushed_direct {
                for (key, value) in obj {
                    if looks_like_question_key(key) {
                        match value {
                            Value::String(text) => {
                                let trimmed = text.trim();
                                if !trimmed.is_empty() {
                                    output.push((maybe_id.clone(), trimmed.to_string()));
                                }
                            }
                            Value::Array(_) | Value::Object(_) => {
                                collect_question_candidates_from_json(value, output);
                            }
                            _ => {}
                        }
                    }
                }
            }

            for key in container_keys {
                if let Some(v) = obj.get(key) {
                    collect_question_candidates_from_json(v, output);
                }
            }
        }
        _ => {}
    }
}

/// 从纯文本里提取“像问题”的候选句子。
/// 目的：当模型没有按 JSON 返回时，仍尽量复用它的真实提问，避免直接落到固定兜底模板。
#[allow(dead_code)]
fn extract_plain_text_question_candidates(content: &str) -> Vec<String> {
    let cleaned = strip_markdown_code_fence(content).replace('\r', "\n");
    let mut out = Vec::new();
    let interrogative_markers = [
        "什么",
        "如何",
        "哪些",
        "哪种",
        "哪类",
        "是否",
        "谁",
        "何时",
        "多久",
        "哪里",
        "为何",
        "为什么",
        "怎样",
        "怎么",
        "请补充",
        "请说明",
        "请明确",
        "请给出",
        "请量化",
        "请界定",
        "请展开",
    ];

    for line in cleaned.lines() {
        let mut candidate = line.trim().to_string();
        if candidate.is_empty() {
            continue;
        }

        // 去掉常见列表前缀，避免把“1.”、“- ”等噪音保留到问题文本里。
        candidate = candidate
            .trim_start_matches(|c: char| {
                c.is_ascii_digit()
                    || matches!(
                        c,
                        ' ' | '.' | '。' | ')' | '）' | '-' | ':' | '：' | '*' | '•'
                    )
            })
            .trim_start()
            .to_string();

        let question_end = candidate
            .char_indices()
            .find(|(_, ch)| *ch == '？' || *ch == '?')
            .map(|(idx, ch)| idx + ch.len_utf8());

        if let Some(end_idx) = question_end {
            let sliced = candidate[..end_idx].trim();
            if sliced.chars().count() >= 8 {
                out.push(sliced.to_string());
            }
            continue;
        }

        // 有些模型会把追问写成“请补充xxx。”而不是问号结尾，这里用疑问词做兜底识别。
        if candidate.chars().count() >= 10
            && interrogative_markers
                .iter()
                .any(|marker| candidate.contains(marker))
        {
            out.push(candidate.to_string());
        }
    }

    // 兼容“单行多问”场景：按问号切句，避免整行只识别第一问。
    let compact = cleaned.replace('\n', " ");
    let mut current = String::new();
    for ch in compact.chars() {
        current.push(ch);
        if ch == '？' || ch == '?' {
            let candidate = current.trim();
            if candidate.chars().count() >= 8 {
                out.push(candidate.to_string());
            }
            current.clear();
        }
    }
    let tail = current.trim();
    if tail.chars().count() >= 10
        && interrogative_markers
            .iter()
            .any(|marker| tail.contains(marker))
    {
        out.push(tail.to_string());
    }

    out
}

/// 把模型返回的问题列表做“容错解析 + 质量清洗”。
/// `require_round2_relevance = true` 时会额外执行第二轮相关性校验。
#[allow(dead_code)]
pub(crate) fn parse_questions_with_repair(
    content: &str,
    topic: &str,
    id_prefix: &str,
    max_count: usize,
) -> Vec<ClarificationQuestion> {
    let json_block = extract_json_array_block(content);
    let mut json_candidates: Vec<(Option<String>, String)> = Vec::new();
    if let Some(value) = parse_json_value_with_repair(content) {
        collect_question_candidates_from_json(&value, &mut json_candidates);
    }
    if json_candidates.is_empty() {
        if let Some(value) = parse_json_value_with_repair(&json_block) {
            collect_question_candidates_from_json(&value, &mut json_candidates);
        }
    }
    let plain_text_candidates = extract_plain_text_question_candidates(content);

    let mut questions = Vec::new();
    let mut seen_questions: HashSet<String> = HashSet::new();

    // 优先使用 JSON 候选（支持对象/数组/嵌套字段），兼容更多供应商输出形态。
    for (index, (candidate_id, raw_question)) in json_candidates.into_iter().enumerate() {
        let question = normalize_question_text(&raw_question, topic);
        if question.is_empty() || looks_non_chinese_question(&question) {
            continue;
        }

        let dedup_key = question.replace(' ', "");
        if !seen_questions.insert(dedup_key) {
            continue;
        }

        let id = candidate_id.unwrap_or_else(|| {
            if id_prefix == "q" {
                format!("q{}", index + 1)
            } else {
                format!("r2_q{}", index + 1)
            }
        });
        questions.push(ClarificationQuestion::new(id, question));
    }

    // 如果 JSON 提取不够，再补充纯文本候选，尽量保留模型本意。
    if questions.len() < max_count {
        for candidate in plain_text_candidates {
            let question = normalize_question_text(&candidate, topic);
            if question.is_empty() || looks_non_chinese_question(&question) {
                continue;
            }

            let dedup_key = question.replace(' ', "");
            if !seen_questions.insert(dedup_key) {
                continue;
            }

            let id = if id_prefix == "q" {
                format!("q{}", questions.len() + 1)
            } else {
                format!("r2_q{}", questions.len() + 1)
            };
            questions.push(ClarificationQuestion::new(id, question));
            if questions.len() >= max_count {
                break;
            }
        }
    }

    questions.truncate(max_count);
    questions
}

/// 当首轮解析失败时，额外调用一次模型做“结构修复 + 质量重写”。
/// 这样能把“模型已生成但格式有误”的内容救回来，减少本地固定模板的出现。
#[allow(clippy::too_many_arguments)]
#[allow(dead_code)]
pub(crate) async fn regenerate_questions_via_model(
    client: &LLMClient,
    model: &str,
    topic: &str,
    track: ClarificationTrack,
    round_label: &str,
    round1_qa: &str,
    raw_content: &str,
    id_prefix: &str,
    required_count: usize,
) -> Vec<ClarificationQuestion> {
    let track_hint = match track {
        ClarificationTrack::Practical => "实操轨：追问执行路径、责任、验收、风险触发与止损。",
        ClarificationTrack::Conceptual => "概念轨：追问定义边界、前提、判据、反例与逻辑一致性。",
    };

    let system_prompt = format!(
        r##"你是 Problem Definer 的输出修复器。
任务：基于给定议题、上下文和失败样本，重新生成 {} 个高质量澄清问题。

硬约束：
1) 只提问题，不给建议或结论。
2) 问题必须紧扣上下文、可直接回答、具备深挖价值。
3) 问法自然，避免机械模板句式。
4) 只输出 JSON 数组，不输出解释文字。
5) 每项结构：{{"id":"{}1","question":"..."}}。

轨道提示：{}"##,
        required_count, id_prefix, track_hint
    );

    let user_prompt = format!(
        "当前轮次：{}\n\n原始议题：\n{}\n\n第一轮问答：\n{}\n\n失败样本（格式或质量不达标）：\n{}",
        round_label,
        topic,
        if round1_qa.trim().is_empty() {
            "(empty)"
        } else {
            round1_qa
        },
        if raw_content.trim().is_empty() {
            "(empty)"
        } else {
            raw_content
        }
    );

    let messages = vec![Message::system(system_prompt), Message::user(user_prompt)];
    let response = client
        .generate_content(model, messages, Some(0.4), Some(900))
        .await;

    let Ok(response) = response else {
        return Vec::new();
    };

    let content = response
        .choices
        .first()
        .and_then(|c| c.message.as_ref())
        .map(|m| m.content.clone())
        .unwrap_or_default();

    parse_questions_with_repair(&content, topic, id_prefix, required_count)
}

fn normalize_framework_candidate(raw: &str) -> String {
    raw.trim()
        .trim_matches('`')
        .to_lowercase()
        .replace(['-', ' ', '/'], "_")
}

fn push_framework_candidate(
    frameworks: &mut Vec<String>,
    raw: &str,
    valid_framework_ids: &HashSet<String>,
) {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return;
    }

    if valid_framework_ids.contains(trimmed) && !frameworks.iter().any(|f| f == trimmed) {
        frameworks.push(trimmed.to_string());
        return;
    }

    let normalized = normalize_framework_candidate(trimmed);
    if valid_framework_ids.contains(&normalized) && !frameworks.iter().any(|f| f == &normalized) {
        frameworks.push(normalized);
    }
}

fn collect_framework_candidates(
    value: &Value,
    frameworks: &mut Vec<String>,
    valid_framework_ids: &HashSet<String>,
) {
    match value {
        Value::String(s) => {
            for token in s.split([',', '，', '、', '\n', ';', '；', '|']) {
                push_framework_candidate(frameworks, token, valid_framework_ids);
            }
        }
        Value::Array(items) => {
            for item in items {
                match item {
                    Value::String(s) => {
                        push_framework_candidate(frameworks, s, valid_framework_ids)
                    }
                    Value::Object(obj) => {
                        if let Some(Value::String(id)) = obj
                            .get("id")
                            .or_else(|| obj.get("framework_id"))
                            .or_else(|| obj.get("framework"))
                            .or_else(|| obj.get("name"))
                        {
                            push_framework_candidate(frameworks, id, valid_framework_ids);
                        }
                    }
                    _ => {}
                }
            }
        }
        Value::Object(obj) => {
            if let Some(Value::String(id)) = obj
                .get("id")
                .or_else(|| obj.get("framework_id"))
                .or_else(|| obj.get("framework"))
                .or_else(|| obj.get("name"))
            {
                push_framework_candidate(frameworks, id, valid_framework_ids);
            }
        }
        _ => {}
    }
}

fn default_recommended_frameworks(valid_framework_ids: &HashSet<String>) -> Vec<String> {
    let preferred = ["first_principles", "systems_thinking", "bayesian_thinking"];
    let mut result = Vec::new();

    for id in preferred {
        if valid_framework_ids.contains(id) {
            result.push(id.to_string());
        }
    }

    if result.is_empty() {
        // HashSet is unordered; sort first so the default result is stable between runs.
        let mut sorted_ids: Vec<String> = valid_framework_ids.iter().cloned().collect();
        sorted_ids.sort();
        result.extend(sorted_ids.into_iter().take(3));
    }

    result
}

/// 基于最终 Problem Brief 生成推荐框架列表。
/// 说明：阶段二最终输出只要求“指令+代码块”，因此框架推荐在这里单独做一次模型调用。
pub(crate) async fn generate_framework_recommendations_from_brief(
    client: &LLMClient,
    model: &str,
    topic: &str,
    qa: &str,
    brief: &str,
    valid_framework_ids: &HashSet<String>,
) -> Vec<String> {
    let mut sorted_ids: Vec<String> = valid_framework_ids.iter().cloned().collect();
    sorted_ids.sort();
    let allowed_frameworks = sorted_ids.join(", ");

    let system_prompt = format!(
        r##"你是“框架匹配器”。
你的任务：基于议题上下文与 Problem Brief，推荐最合适的 3-5 个思维框架 ID。

硬约束：
1) 只能从以下 ID 中选择：{}
2) 只输出 JSON 数组，例如 ["first_principles","systems_thinking"]。
3) 不要输出解释文字。"##,
        allowed_frameworks
    );

    let user_prompt = format!(
        "原始议题：\n{}\n\n澄清问答：\n{}\n\nProblem Brief：\n{}",
        topic,
        if qa.trim().is_empty() { "(empty)" } else { qa },
        if brief.trim().is_empty() {
            "(empty brief)"
        } else {
            brief
        }
    );

    let response = client
        .generate_content(
            model,
            vec![Message::system(system_prompt), Message::user(user_prompt)],
            Some(0.3),
            Some(600),
        )
        .await;
    let Ok(response) = response else {
        return default_recommended_frameworks(valid_framework_ids);
    };

    let content = response
        .choices
        .first()
        .and_then(|c| c.message.as_ref())
        .map(|m| m.content.clone())
        .unwrap_or_default();

    let mut frameworks = Vec::new();
    if let Some(value) = parse_json_value_with_repair(&content) {
        collect_framework_candidates(&value, &mut frameworks, valid_framework_ids);
    }
    if frameworks.is_empty() {
        let block = extract_json_array_block(&content);
        if let Some(value) = parse_json_value_with_repair(&block) {
            collect_framework_candidates(&value, &mut frameworks, valid_framework_ids);
        }
    }
    if frameworks.is_empty() {
        frameworks = infer_frameworks_from_text(&content, valid_framework_ids);
    }
    if frameworks.is_empty() {
        frameworks = default_recommended_frameworks(valid_framework_ids);
    }
    frameworks.truncate(5);
    frameworks
}

/// 把阶段二最终交付转成阶段三可直接使用的 user 指令正文。
///
/// 这里故意做成“纯上下文正文”，不再加任何“请你严格基于以下上下文...”这种前置指挥语，
/// 让用户在前端看到、编辑和提交的文本与后端真正发送给 Agent 的内容保持一致。
pub(crate) fn build_divergence_user_prompt_from_delivery(
    topic: &str,
    brief_markdown: &str,
) -> String {
    let sections = [
        format!("原始问题：\n{}", topic.trim()),
        format!("AI 生成的重塑议题：\n{}", brief_markdown.trim()),
    ];

    sections.join("\n\n")
}

fn strip_markdown_code_fence(raw: &str) -> String {
    raw.trim()
        .trim_start_matches("```markdown")
        .trim_start_matches("```md")
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim()
        .to_string()
}

#[allow(dead_code)]
fn decode_common_escaped_sequences(text: &str) -> String {
    text.replace("\\r\\n", "\n")
        .replace("\\n", "\n")
        .replace("\\r", "\n")
        .replace("\\t", "    ")
        .replace("\\\"", "\"")
        .replace("\\/", "/")
}

#[allow(dead_code)]
fn normalize_reframed_issue_text(raw: &str) -> String {
    let cleaned = strip_markdown_code_fence(raw);
    let cleaned = cleaned.trim().trim_matches('"').trim_matches('\'').trim();
    decode_common_escaped_sequences(cleaned).trim().to_string()
}

#[allow(dead_code)]
fn truncate_chars(input: &str, max_chars: usize) -> String {
    let mut out = String::new();
    for (idx, ch) in input.chars().enumerate() {
        if idx >= max_chars {
            out.push_str("...");
            break;
        }
        out.push(ch);
    }
    out
}

#[allow(dead_code)]
fn build_stable_reframed_issue(topic: &str, questions: &str, raw_content: &str) -> String {
    let clarification_context = truncate_chars(questions.trim(), 2200);
    let model_hint = normalize_reframed_issue_text(raw_content);
    let model_hint = if model_hint.starts_with('{') {
        String::new()
    } else {
        truncate_chars(model_hint.trim(), 1200)
    };

    let mut md = String::new();
    // 兜底文案也按“专家级问题简报”结构输出，保证交付一致性。
    md.push_str("📑 专家级问题简报 (The Problem Brief)\n\n");
    md.push_str("1. 🎯 核心意图与真实需求 (Core Intent)\n");
    md.push_str(&format!("- 表面议题：{}\n", topic.trim()));
    md.push_str("- 本质需求：在边界清晰的前提下，明确真正要达成的结果与衡量标准。\n\n");
    md.push_str("2. 🧭 核心上下文与变量 (Context & Variables)\n");
    md.push_str("- 关键背景：\n");
    if clarification_context.is_empty() {
        md.push_str("  暂无额外澄清记录。\n");
    } else {
        md.push_str(&format!(
            "  基于当前澄清信息（节选）：\n{}\n",
            clarification_context
        ));
    }
    md.push_str("- 利益相关者：请结合一线角色、管理者及受影响团队进一步确认各自诉求。\n\n");
    md.push_str("3. 🚧 边界与约束条件 (Boundaries & Constraints)\n");
    md.push_str("- 硬性约束：资源、时间、组织流程与合规要求需明确。\n");
    md.push_str("- 绝对红线与排除项：需列出不可触碰动作，以及本轮无需讨论范围。\n\n");
    md.push_str("4. 🔦 盲区与潜在风险 (Blind Spots & Risks)\n");
    md.push_str("- 已识别盲区：需进一步确认关键失败触发点与隐性成本。\n");
    md.push_str("- 防范提示：要求后续方案必须包含预警信号、止损动作与替代路径。\n\n");
    md.push_str("5. 📥 对解答专家的交付要求 (Deliverable Expectations)\n");
    md.push_str("- 期待输出类型：优先输出“可执行决策简报 + 分阶段行动建议 + 风险应对说明”。\n");
    md.push_str("- 建议视角：以业务目标、组织稳定、合规边界三者平衡的视角给出解答。\n\n");

    md.push_str("#### 附：执行关注点（系统补充）\n");
    md.push_str(&format!(
        "- 围绕议题“{}”，形成可执行且可验证的推进方案。\n",
        topic.trim()
    ));
    md.push_str("- 明确本次推演的成功标准（可量化或可观察）。\n\n");

    if !model_hint.is_empty() {
        md.push_str("#### 模型参考片段\n");
        md.push_str(&model_hint);
        md.push('\n');
    }

    md
}

pub(crate) fn infer_frameworks_from_text(
    content: &str,
    valid_framework_ids: &HashSet<String>,
) -> Vec<String> {
    let mut frameworks = Vec::new();
    let lowered = content.to_lowercase();
    let priority = [
        "first_principles",
        "systems_thinking",
        "bayesian_thinking",
        "theory_of_constraints",
        "design_thinking",
        "game_theory",
    ];

    for id in priority {
        if lowered.contains(id) {
            push_framework_candidate(&mut frameworks, id, valid_framework_ids);
        }
    }

    // 一些模型会返回中文框架名，这里做轻量别名映射，避免“明明命中了却被当空结果”。
    let aliases = [
        ("第一性原理", "first_principles"),
        ("极限反脆弱", "anti_fragility"),
        ("反脆弱", "anti_fragility"),
        ("系统动力学", "systems_thinking"),
        ("系统思维", "systems_thinking"),
        ("水平跨界思维", "lateral_thinking"),
        ("行为经济学", "behavioral_econ"),
        ("演化博弈论", "evolutionary_game"),
        ("约束理论", "theory_of_constraints"),
        ("价值主张", "value_proposition"),
        ("贝叶斯思维", "bayesian_thinking"),
        ("设计思维", "design_thinking"),
        ("博弈战略", "game_theory"),
        ("精益创业", "lean_startup"),
        ("复杂适应系统", "complex_adaptive"),
        ("现象学还原", "phenomenology"),
        ("二阶思维", "second_order"),
    ];
    for (alias, id) in aliases {
        if content.contains(alias) {
            push_framework_candidate(&mut frameworks, id, valid_framework_ids);
        }
    }

    frameworks
}

#[allow(dead_code)]
fn extract_reframed_issue_from_value(value: &Value) -> Option<String> {
    fn compact_value_text(value: &Value) -> String {
        match value {
            Value::String(s) => normalize_reframed_issue_text(s),
            Value::Number(n) => n.to_string(),
            Value::Bool(b) => b.to_string(),
            Value::Null => "null".to_string(),
            Value::Array(items) => items
                .iter()
                .map(compact_value_text)
                .filter(|s| !s.is_empty())
                .collect::<Vec<_>>()
                .join("；"),
            Value::Object(obj) => obj
                .iter()
                .map(|(k, v)| format!("{}：{}", k, compact_value_text(v)))
                .collect::<Vec<_>>()
                .join("；"),
        }
    }

    fn normalize_issue_lines(value: &Value) -> Vec<String> {
        match value {
            Value::String(text) => normalize_reframed_issue_text(text)
                .replace('\r', "\n")
                .split(['\n', ';', '；'])
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
                .map(|s| {
                    s.trim_start_matches(|c: char| {
                        matches!(c, '-' | '*' | '•' | '1' | '2' | '3' | '4' | '5' | '.' | ' ')
                    })
                    .trim()
                    .to_string()
                })
                .filter(|s| !s.is_empty())
                .collect(),
            Value::Array(items) => items
                .iter()
                .flat_map(normalize_issue_lines)
                .collect::<Vec<_>>(),
            Value::Object(obj) => obj
                .iter()
                .map(|(k, v)| {
                    let v_text = compact_value_text(v);
                    if v_text.is_empty() {
                        k.to_string()
                    } else {
                        format!("{}：{}", k, v_text)
                    }
                })
                .collect(),
            _ => {
                let plain = compact_value_text(value);
                if plain.is_empty() {
                    Vec::new()
                } else {
                    vec![plain]
                }
            }
        }
    }

    fn render_issue_object_markdown(obj: &serde_json::Map<String, Value>) -> String {
        let mut md = String::from("### 重塑后的问题定义\n");

        let sections: [(&str, &[&str]); 4] = [
            (
                "目标",
                &[
                    "核心目标",
                    "目标",
                    "goal",
                    "core_goal",
                    "intent",
                    "本质需求",
                ],
            ),
            (
                "关键约束",
                &[
                    "约束条件",
                    "约束",
                    "constraints",
                    "constraint",
                    "边界",
                    "红线",
                ],
            ),
            ("主要风险", &["主要风险", "风险", "risks", "risk", "盲区"]),
            (
                "验收标准",
                &["验收标准", "验收", "acceptance", "acceptance_criteria"],
            ),
        ];

        let mut rendered_any = false;
        for (title, aliases) in sections {
            let candidate = aliases.iter().find_map(|alias| obj.get(*alias));
            if let Some(value) = candidate {
                let lines = normalize_issue_lines(value);
                if !lines.is_empty() {
                    md.push_str(&format!("#### {}\n", title));
                    for line in lines {
                        md.push_str(&format!("- {}\n", line));
                    }
                    md.push('\n');
                    rendered_any = true;
                }
            }
        }

        if rendered_any {
            return md.trim().to_string();
        }

        // 如果不是标准四段结构，就把对象所有字段按“键值要点”输出。
        md.push_str("#### 关键信息\n");
        for (k, v) in obj {
            let lines = normalize_issue_lines(v);
            if lines.is_empty() {
                continue;
            }
            for line in lines {
                md.push_str(&format!("- {}：{}\n", k, line));
            }
        }
        md.trim().to_string()
    }

    fn normalize_reframed_issue_candidate(value: &Value) -> Option<String> {
        match value {
            Value::String(text) => {
                let cleaned = normalize_reframed_issue_text(text);
                if cleaned.trim().is_empty() {
                    None
                } else {
                    Some(cleaned)
                }
            }
            Value::Object(obj) => {
                if obj.is_empty() {
                    None
                } else {
                    Some(render_issue_object_markdown(obj))
                }
            }
            Value::Array(items) => {
                let lines = normalize_issue_lines(&Value::Array(items.clone()));
                if lines.is_empty() {
                    None
                } else {
                    let mut md = String::from("### 重塑后的问题定义\n#### 关键信息\n");
                    for line in lines {
                        md.push_str(&format!("- {}\n", line));
                    }
                    Some(md.trim().to_string())
                }
            }
            _ => None,
        }
    }

    let obj = value.as_object()?;
    let keys = [
        "reframed_issue",
        "reframedIssue",
        "reframed_topic",
        "reframedTopic",
        "issue",
        "problem_definition",
        "problemDefinition",
    ];

    for key in keys {
        if let Some(candidate) = obj.get(key) {
            if let Some(normalized) = normalize_reframed_issue_candidate(candidate) {
                return Some(normalized);
            }
        }
    }

    // 有些模型会直接把问题重塑字段平铺在顶层对象里（没有 reframed_issue 包裹）。
    let top_level_markers = [
        "目标",
        "核心目标",
        "约束",
        "约束条件",
        "风险",
        "主要风险",
        "验收",
        "验收标准",
    ];
    let looks_like_top_level_issue = obj
        .keys()
        .any(|k| top_level_markers.iter().any(|marker| k.contains(marker)));
    if looks_like_top_level_issue {
        return Some(render_issue_object_markdown(obj));
    }

    None
}

/// 删除 JSON 里常见的“尾逗号”错误（例如 `{"a":1,}` 或 `[1,2,]`）。
/// 这是为了提高跨模型/跨供应商兼容性，避免因为小语法问题整段回退。
fn remove_json_trailing_commas(input: &str) -> String {
    let chars: Vec<char> = input.chars().collect();
    let mut out = String::with_capacity(input.len());
    let mut in_string = false;
    let mut escaped = false;

    for (i, ch) in chars.iter().enumerate() {
        if in_string {
            out.push(*ch);
            if escaped {
                escaped = false;
            } else if *ch == '\\' {
                escaped = true;
            } else if *ch == '"' {
                in_string = false;
            }
            continue;
        }

        if *ch == '"' {
            in_string = true;
            out.push(*ch);
            continue;
        }

        if *ch == ',' {
            let mut j = i + 1;
            while j < chars.len() && chars[j].is_whitespace() {
                j += 1;
            }
            if j < chars.len() && (chars[j] == '}' || chars[j] == ']') {
                continue;
            }
        }

        out.push(*ch);
    }

    out
}

/// 用“严格 JSON -> JSON5 -> 去尾逗号再重试”三层策略解析对象文本。
fn parse_json_value_with_repair(raw: &str) -> Option<Value> {
    if let Ok(value) = serde_json::from_str::<Value>(raw) {
        return Some(value);
    }
    if let Ok(value) = json5::from_str::<Value>(raw) {
        return Some(value);
    }

    let sanitized = remove_json_trailing_commas(raw);
    if sanitized != raw {
        if let Ok(value) = serde_json::from_str::<Value>(&sanitized) {
            return Some(value);
        }
        if let Ok(value) = json5::from_str::<Value>(&sanitized) {
            return Some(value);
        }
    }

    None
}

/// 判断一段文本是否“像问题重塑结果”，用于 JSON 彻底失败时的文本兜底提取。
#[allow(dead_code)]
fn looks_like_reframed_issue_markdown(text: &str) -> bool {
    let trimmed = text.trim();
    if trimmed.starts_with('{') || trimmed.starts_with('[') {
        return false;
    }
    let has_goal = text.contains("目标") || text.to_lowercase().contains("goal");
    let has_constraint = text.contains("约束") || text.to_lowercase().contains("constraint");
    let has_risk = text.contains("风险") || text.to_lowercase().contains("risk");
    let has_acceptance = text.contains("验收") || text.to_lowercase().contains("acceptance");
    let has_structured_shape = text.contains("###") || text.contains("####") || text.contains("- ");

    has_structured_shape && ((has_goal && has_constraint) || (has_risk && has_acceptance))
}

/// 从“非标准 JSON”文本中尽量提取重塑议题内容。
#[allow(dead_code)]
fn extract_reframed_issue_from_loose_text(content: &str) -> Option<String> {
    let cleaned = strip_markdown_code_fence(content);
    let trimmed = cleaned.trim();
    if trimmed.is_empty() {
        return None;
    }

    // 先尝试当作 JSON 解析，避免把整段 JSON 误当成重塑议题正文。
    if let Some(value) = parse_json_value_with_repair(trimmed) {
        if let Some(issue) = extract_reframed_issue_from_value(&value) {
            return Some(issue);
        }
    }

    if looks_like_reframed_issue_markdown(trimmed) {
        return Some(trimmed.to_string());
    }

    let lower = trimmed.to_lowercase();
    let markers = [
        "reframed_issue",
        "reframed issue",
        "reframed_topic",
        "reframed topic",
        "重塑议题",
        "重塑问题",
        "问题重塑",
        "问题定义",
    ];

    for marker in markers {
        if let Some(start) = lower.find(marker) {
            let source = &trimmed[start..];
            let value_start = source.find(':').or_else(|| source.find('：'));
            let Some(pos) = value_start else {
                continue;
            };

            let candidate = source[pos + 1..]
                .trim()
                .trim_matches('"')
                .trim_matches('\'')
                .trim();
            if candidate.chars().count() >= 30 {
                return Some(normalize_reframed_issue_text(candidate));
            }
        }
    }

    None
}

#[allow(dead_code)]
pub(crate) fn parse_clarification_response_with_repair(
    content: &str,
    topic: &str,
    questions: &str,
    valid_framework_ids: &HashSet<String>,
) -> (Vec<String>, String, bool) {
    let json_block = extract_json_object_block(content);

    if let Ok(parsed) = serde_json::from_str::<ClarificationResponse>(&json_block) {
        let mut frameworks = Vec::new();
        for fw in parsed.recommended_frameworks {
            push_framework_candidate(&mut frameworks, &fw, valid_framework_ids);
        }
        if frameworks.is_empty() {
            frameworks = default_recommended_frameworks(valid_framework_ids);
        }

        let reframed_issue = normalize_reframed_issue_text(&parsed.reframed_issue);
        let reframed_issue = if reframed_issue.trim().is_empty() {
            build_stable_reframed_issue(topic, questions, content)
        } else {
            reframed_issue
        };

        return (frameworks, reframed_issue, true);
    }

    if let Some(value) = parse_json_value_with_repair(&json_block) {
        let mut frameworks = Vec::new();
        if let Some(obj) = value.as_object() {
            let keys = [
                "recommended_frameworks",
                "recommendedFrameworks",
                "frameworks",
                "framework_ids",
                "frameworkIds",
                "recommended",
            ];
            for key in keys {
                if let Some(v) = obj.get(key) {
                    collect_framework_candidates(v, &mut frameworks, valid_framework_ids);
                }
            }

            if frameworks.is_empty() {
                for (key, v) in obj {
                    if key.to_lowercase().contains("framework") {
                        collect_framework_candidates(v, &mut frameworks, valid_framework_ids);
                    }
                }
            }
        }

        if frameworks.is_empty() {
            frameworks = infer_frameworks_from_text(content, valid_framework_ids);
        }
        if frameworks.is_empty() {
            frameworks = default_recommended_frameworks(valid_framework_ids);
        }

        let reframed_issue = extract_reframed_issue_from_value(&value)
            .or_else(|| extract_reframed_issue_from_loose_text(content))
            .or_else(|| {
                let text = normalize_reframed_issue_text(content);
                if text.is_empty() {
                    None
                } else {
                    Some(text)
                }
            })
            .unwrap_or_else(|| build_stable_reframed_issue(topic, questions, content));
        return (frameworks, reframed_issue, false);
    }

    let mut frameworks = infer_frameworks_from_text(content, valid_framework_ids);
    if frameworks.is_empty() {
        frameworks = default_recommended_frameworks(valid_framework_ids);
    }

    let fallback_reframed_issue = extract_reframed_issue_from_loose_text(content)
        .or_else(|| {
            let text = normalize_reframed_issue_text(content);
            if text.is_empty() {
                None
            } else {
                Some(text)
            }
        })
        .unwrap_or_else(|| build_stable_reframed_issue(topic, questions, content));

    (frameworks, fallback_reframed_issue, false)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mock_framework_ids() -> HashSet<String> {
        [
            "first_principles",
            "systems_thinking",
            "game_theory",
            "bayesian_thinking",
        ]
        .into_iter()
        .map(|s| s.to_string())
        .collect()
    }

    #[test]
    fn divergence_prompt_from_delivery_uses_plain_editable_sections() {
        let prompt = build_divergence_user_prompt_from_delivery(
            "原始议题：提升续约率",
            "### 重塑议题\n- 聚焦关键决策链路",
        );

        assert!(prompt.contains("原始问题："));
        assert!(prompt.contains("AI 生成的重塑议题："));
        assert!(!prompt.contains("推荐专家（人的身份）："));
        assert!(!prompt.contains("请你严格基于以下上下文输出结构化方案"));
    }

    #[test]
    fn identity_experts_panel_is_generated_from_framework_ids() {
        let panel = build_identity_experts_panel_from_frameworks(&vec![
            "first_principles".to_string(),
            "systems_thinking".to_string(),
        ]);

        assert!(panel.contains("推荐专家（人的身份）"));
        assert!(panel.contains("first_principles"));
        assert!(panel.contains("systems_thinking"));
    }

    #[test]
    fn parse_round2_questions_accepts_missing_id_and_alt_question_key() {
        let topic = "两个客户都不愿意签年度保底协议，怎么推进成交";
        let content = r#"[
            {"question":"你上一轮提到客户预算很紧，基于这件事可接受的让步底线条件是什么？"},
            {"q":"若对方继续反对保底，谁负责推进替代方案、何时验收结果？"}
        ]"#;

        let questions = parse_questions_with_repair(content, topic, "r2_q", 2);
        assert_eq!(questions.len(), 2);
        assert_eq!(questions[0].id, "r2_q1");
        assert_eq!(questions[1].id, "r2_q2");
    }

    #[test]
    fn parse_clarification_response_supports_json5_shape() {
        let ids = mock_framework_ids();
        let content = r#"{
            recommended_frameworks: ['first_principles', 'systems_thinking',],
            reframed_issue: '### 目标\n- 提升成交率\n### 约束\n- 客户预算受限\n### 风险\n- 大客户流失\n### 验收标准\n- 30天内签约率提升'
        }"#;

        let (frameworks, reframed_issue, strict) =
            parse_clarification_response_with_repair(content, "涨价推进", "Q/A", &ids);
        assert!(!strict);
        assert!(frameworks.iter().any(|f| f == "first_principles"));
        assert!(frameworks.iter().any(|f| f == "systems_thinking"));
        assert!(reframed_issue.contains("### 目标"));
    }

    #[test]
    fn parse_clarification_response_extracts_loose_markdown_and_cn_aliases() {
        let ids = mock_framework_ids();
        let content = r#"推荐框架：第一性原理、系统动力学、博弈战略

重塑问题：
### 目标
- 兼顾成交推进与客户关系稳定。
### 约束
- 不签年度保底、预算窗口有限。
### 风险
- 谈判拉长导致机会流失。
### 验收标准
- 在可接受折扣范围内拿到可执行承诺。"#;

        let (frameworks, reframed_issue, strict) =
            parse_clarification_response_with_repair(content, "保底协议推进", "Q/A", &ids);
        assert!(!strict);
        assert!(frameworks.iter().any(|f| f == "first_principles"));
        assert!(frameworks.iter().any(|f| f == "systems_thinking"));
        assert!(frameworks.iter().any(|f| f == "game_theory"));
        assert!(reframed_issue.contains("### 目标"));
        assert!(reframed_issue.contains("### 验收标准"));
    }

    #[test]
    fn parse_clarification_response_handles_object_reframed_issue() {
        let ids = mock_framework_ids();
        let content = r#"{
            "recommended_frameworks": ["game_theory", "systems_thinking"],
            "reframed_issue": {
                "核心目标": "在合规前提下推动签署保底协议",
                "约束条件": "不能违法强迫签署；预算有限",
                "主要风险": "员工消极对抗与团队摩擦",
                "验收标准": "在约定周期内完成签署并保持团队稳定"
            }
        }"#;

        let (frameworks, reframed_issue, strict) =
            parse_clarification_response_with_repair(content, "议题", "Q/A", &ids);
        assert!(!strict);
        assert!(frameworks.iter().any(|f| f == "game_theory"));
        assert!(frameworks.iter().any(|f| f == "systems_thinking"));
        assert!(reframed_issue.contains("### 重塑后的问题定义"));
        assert!(reframed_issue.contains("#### 目标"));
        assert!(reframed_issue.contains("#### 关键约束"));
        assert!(reframed_issue.contains("#### 主要风险"));
        assert!(reframed_issue.contains("#### 验收标准"));
        assert!(!reframed_issue.contains("recommended_frameworks"));
    }
}
