use super::analysis::{
    examination_parse_mode_name, parse_examination_response_with_repair, truncate_context,
    ExaminationParseMode,
};
use crate::error::AppResult;
use crate::framework::Framework;
use crate::llm::{self, LLMClient};
use crate::state::{AgentStatus, Phase, StateMachine, ToleratedRiskItem};
use std::time::Instant;
use tauri::{AppHandle, Emitter, Manager};

fn elapsed_ms(start_at: Instant) -> u64 {
    start_at.elapsed().as_millis() as u64
}

fn build_default_divergence_user_prompt(context: &str) -> String {
    format!(
        "Please output a structured plan under your framework. Include assumptions, risks, and execution steps.\n\n{}",
        context
    )
}

pub(crate) async fn run_divergence(
    app: &AppHandle,
    round: u32,
    frameworks: &[Framework],
    client: &std::sync::Arc<LLMClient>,
    model_name: &str,
    prompt_ctx: &str,
    custom_user_prompt: Option<&str>,
) -> AppResult<()> {
    let phase_started_at = Instant::now();
    {
        let state_machine = app.state::<tokio::sync::Mutex<StateMachine>>();
        let mut sm = state_machine.lock().await;
        sm.current_phase = Phase::Divergence;
        sm.log_info("Engine", &format!("Divergence round {} started", round));
        let _ = app.emit("state-update", &*sm);
    }

    let mut futures = Vec::new();

    for framework in frameworks {
        let app_clone = app.clone();
        let client_clone = client.clone();
        let model = model_name.to_string();
        let framework_id = framework.id.clone();
        let framework_name = framework.name.clone();
        let system_prompt = framework.system_prompt.clone();
        let context = prompt_ctx.to_string();
        let user_prompt = custom_user_prompt
            .map(|s| s.to_string())
            .unwrap_or_else(|| build_default_divergence_user_prompt(&context));

        {
            let state_machine = app_clone.state::<tokio::sync::Mutex<StateMachine>>();
            let mut sm = state_machine.lock().await;
            sm.update_agent_status(&framework_id, AgentStatus::Thinking);
            let _ = app_clone.emit("state-update", &*sm);
        }

        futures.push(tokio::spawn(async move {
            let messages = vec![
                llm::Message::system(system_prompt),
                llm::Message::user(user_prompt),
            ];

            match client_clone
                .generate_content(&model, messages, Some(0.7), Some(2000))
                .await
            {
                Ok(response) => {
                    let content = response
                        .choices
                        .first()
                        .and_then(|c| c.message.as_ref())
                        .map(|m| m.content.clone())
                        .unwrap_or_default();

                    let state_machine = app_clone.state::<tokio::sync::Mutex<StateMachine>>();
                    let mut sm = state_machine.lock().await;
                    sm.update_agent_content(&framework_id, content);
                    sm.update_agent_status(&framework_id, AgentStatus::Pass);
                    sm.log_info("Agent", &format!("{} divergence finished", framework_name));
                    let _ = app_clone.emit("state-update", &*sm);
                    Ok(())
                }
                Err(error) => {
                    let state_machine = app_clone.state::<tokio::sync::Mutex<StateMachine>>();
                    let mut sm = state_machine.lock().await;
                    sm.record_phase_failure(Phase::Divergence);
                    sm.update_agent_content(
                        &framework_id,
                        format!("### Reasoning failed\n\n```\n{}\n```", error),
                    );
                    sm.update_agent_status(&framework_id, AgentStatus::Objection);
                    sm.log_warn(
                        "Agent",
                        &format!("{} divergence failed: {}", framework_name, error),
                    );
                    let _ = app_clone.emit("state-update", &*sm);
                    Err(format!("{}: {}", framework_name, error))
                }
            }
        }));
    }

    let mut errors = Vec::new();
    for task in futures {
        match task.await {
            Ok(Ok(())) => {}
            Ok(Err(msg)) => errors.push(msg),
            Err(join_err) => errors.push(format!("Task panicked: {}", join_err)),
        }
    }
    if !errors.is_empty() {
        let state_machine = app.state::<tokio::sync::Mutex<StateMachine>>();
        let mut sm = state_machine.lock().await;
        sm.log_error(
            "Engine",
            &format!("Divergence had {} failures", errors.len()),
        );
    }

    let state_machine = app.state::<tokio::sync::Mutex<StateMachine>>();
    let mut sm = state_machine.lock().await;
    sm.record_phase_duration(Phase::Divergence, elapsed_ms(phase_started_at));
    let _ = app.emit("state-update", &*sm);

    Ok(())
}

pub(crate) async fn run_examination(
    app: &AppHandle,
    frameworks: &[Framework],
    client: &std::sync::Arc<LLMClient>,
    model_name: &str,
) -> AppResult<bool> {
    let phase_started_at = Instant::now();
    {
        let state_machine = app.state::<tokio::sync::Mutex<StateMachine>>();
        let mut sm = state_machine.lock().await;
        sm.current_phase = Phase::Examination;
        sm.log_info("Engine", "Starting phase 2: examination");
        let _ = app.emit("state-update", &*sm);
    }

    let phase_outputs = {
        let state_machine = app.state::<tokio::sync::Mutex<StateMachine>>();
        let sm = state_machine.lock().await;
        frameworks
            .iter()
            .map(|f| {
                let content = sm
                    .agents
                    .get(&f.id)
                    .map(|a| truncate_context(&a.content))
                    .unwrap_or_default();
                format!("## [{}]\n{}", f.name, content)
            })
            .collect::<Vec<_>>()
            .join("\n\n")
    };

    if frameworks.len() <= 1 {
        let state_machine = app.state::<tokio::sync::Mutex<StateMachine>>();
        let mut sm = state_machine.lock().await;
        for framework in frameworks {
            sm.update_agent_status(&framework.id, AgentStatus::Pass);
        }
        sm.record_phase_duration(Phase::Examination, elapsed_ms(phase_started_at));
        let _ = app.emit("state-update", &*sm);
        return Ok(false);
    }

    let mut futures = Vec::new();

    for framework in frameworks {
        let app_clone = app.clone();
        let client_clone = client.clone();
        let model = model_name.to_string();
        let framework_id = framework.id.clone();
        let framework_name = framework.name.clone();
        let outputs = phase_outputs.clone();

        {
            let state_machine = app_clone.state::<tokio::sync::Mutex<StateMachine>>();
            let mut sm = state_machine.lock().await;
            sm.update_agent_status(&framework_id, AgentStatus::Thinking);
            let _ = app_clone.emit("state-update", &*sm);
        }

        futures.push(tokio::spawn(async move {
            let messages = vec![
                llm::Message::system(format!(
                    "你是来自“{}”视角的严苛评审专家。你只能输出 JSON 对象，不能输出 Markdown、解释文本或代码块围栏。",
                    framework_name
                )),
                llm::Message::user(format!(
                    "请评审以下候选方案，判断是否存在“重大异议”（会导致方案无法安全落地）。\n\n硬性规则（必须全部满足）：\n1) 仅输出 JSON 对象，不得包含任何额外文字。\n2) 严格使用以下结构：\n{{\"has_major_objection\": true|false, \"objection_items\": [\"...\"], \"review_summary\": \"...\"}}\n3) 如果没有重大异议，必须返回 has_major_objection=false 且 objection_items=[]。\n4) objection_items 最多 3 条，每条必须为中文、单句、可执行（例如：\"关键指标口径不一致，无法验证成效\"）。\n5) 禁止把布尔值为 false 的结论写成长文本风险描述。\n\n候选方案如下：\n{}",
                    outputs
                )),
            ];

            match client_clone
                .generate_content(&model, messages, Some(0.6), Some(1500))
                .await
            {
                Ok(response) => {
                    let content = response
                        .choices
                        .first()
                        .and_then(|c| c.message.as_ref())
                        .map(|m| m.content.clone())
                        .unwrap_or_default();

                    let state_machine = app_clone.state::<tokio::sync::Mutex<StateMachine>>();
                    let mut sm = state_machine.lock().await;
                    let (has_objection, objection_items, parse_mode) =
                        parse_examination_response_with_repair(&content);

                    if parse_mode == ExaminationParseMode::RepairedJson {
                        sm.record_examination_parser_repair();
                    } else if parse_mode == ExaminationParseMode::TextFallback {
                        sm.record_examination_text_fallback();
                    }

                    sm.log_info(
                        "Arbitrator",
                        &format!(
                            "{} examination parsed with protocol={}, has_objection={}",
                            framework_name,
                            examination_parse_mode_name(parse_mode),
                            has_objection
                        ),
                    );

                    if has_objection {
                        if objection_items.is_empty() {
                            sm.add_objection(&framework_id, content);
                        } else {
                            for item in &objection_items {
                                sm.add_objection(&framework_id, item.clone());
                            }
                        }
                        sm.update_agent_status(&framework_id, AgentStatus::Objection);
                        sm.log_warn(
                            "Arbitrator",
                            &format!(
                                "{} raised an objection (protocol={})",
                                framework_name,
                                examination_parse_mode_name(parse_mode)
                            ),
                        );
                    } else {
                        sm.update_agent_status(&framework_id, AgentStatus::Pass);
                    }

                    let _ = app_clone.emit("state-update", &*sm);
                    Ok(())
                }
                Err(error) => {
                    let state_machine = app_clone.state::<tokio::sync::Mutex<StateMachine>>();
                    let mut sm = state_machine.lock().await;
                    sm.record_phase_failure(Phase::Examination);
                    sm.add_objection(&framework_id, format!("Examination failed: {}", error));
                    sm.update_agent_status(&framework_id, AgentStatus::Objection);
                    let _ = app_clone.emit("state-update", &*sm);
                    Err(format!("{}: {}", framework_name, error))
                }
            }
        }));
    }

    let mut errors = Vec::new();
    for task in futures {
        match task.await {
            Ok(Ok(())) => {}
            Ok(Err(msg)) => errors.push(msg),
            Err(join_err) => errors.push(format!("Task panicked: {}", join_err)),
        }
    }
    if !errors.is_empty() {
        let state_machine = app.state::<tokio::sync::Mutex<StateMachine>>();
        let mut sm = state_machine.lock().await;
        sm.log_error(
            "Engine",
            &format!("Examination had {} failures", errors.len()),
        );
    }

    let state_machine = app.state::<tokio::sync::Mutex<StateMachine>>();
    let mut sm = state_machine.lock().await;
    sm.record_phase_duration(Phase::Examination, elapsed_ms(phase_started_at));
    let _ = app.emit("state-update", &*sm);
    Ok(sm.has_objections())
}

pub(crate) async fn run_patching(
    app: &AppHandle,
    frameworks: &[Framework],
    client: &std::sync::Arc<LLMClient>,
    model_name: &str,
) -> AppResult<()> {
    let phase_started_at = Instant::now();
    {
        let state_machine = app.state::<tokio::sync::Mutex<StateMachine>>();
        let mut sm = state_machine.lock().await;
        sm.current_phase = Phase::Patch;
        sm.log_info("Engine", "Starting phase 3: patching");
        let _ = app.emit("state-update", &*sm);
    }

    let objections_text = {
        let state_machine = app.state::<tokio::sync::Mutex<StateMachine>>();
        let sm = state_machine.lock().await;
        sm.get_all_objections()
            .iter()
            .map(|(id, objection)| format!("[{}] {}", id, objection))
            .collect::<Vec<_>>()
            .join("\n\n")
    };

    if objections_text.is_empty() {
        let state_machine = app.state::<tokio::sync::Mutex<StateMachine>>();
        let mut sm = state_machine.lock().await;
        sm.record_phase_duration(Phase::Patch, elapsed_ms(phase_started_at));
        let _ = app.emit("state-update", &*sm);
        return Ok(());
    }

    let mut futures = Vec::new();

    for framework in frameworks {
        let app_clone = app.clone();
        let client_clone = client.clone();
        let model = model_name.to_string();
        let framework_id = framework.id.clone();
        let framework_name = framework.name.clone();
        let system_prompt = framework.system_prompt.clone();
        let objections = objections_text.clone();

        let original = {
            let state_machine = app_clone.state::<tokio::sync::Mutex<StateMachine>>();
            let sm = state_machine.lock().await;
            sm.agents
                .get(&framework_id)
                .map(|a| truncate_context(&a.content))
                .unwrap_or_default()
        };

        {
            let state_machine = app_clone.state::<tokio::sync::Mutex<StateMachine>>();
            let mut sm = state_machine.lock().await;
            sm.update_agent_status(&framework_id, AgentStatus::Patching);
            let _ = app_clone.emit("state-update", &*sm);
        }

        futures.push(tokio::spawn(async move {
            let messages = vec![
                llm::Message::system(system_prompt),
                llm::Message::user(format!(
                    "Revise your plan based on objections. Keep correct parts, patch weak points, and return a complete revised version.\n\nObjections:\n{}\n\nOriginal draft:\n{}",
                    objections, original
                )),
            ];

            match client_clone
                .generate_content(&model, messages, Some(0.7), Some(2000))
                .await
            {
                Ok(response) => {
                    let content = response
                        .choices
                        .first()
                        .and_then(|c| c.message.as_ref())
                        .map(|m| m.content.clone())
                        .unwrap_or_default();

                    let state_machine = app_clone.state::<tokio::sync::Mutex<StateMachine>>();
                    let mut sm = state_machine.lock().await;
                    sm.update_agent_content(&framework_id, content);
                    sm.update_agent_status(&framework_id, AgentStatus::Pass);

                    if let Some(agent) = sm.agents.get_mut(&framework_id) {
                        agent.version += 1;
                        agent.objections.clear();
                    }

                    sm.log_info("Agent", &format!("{} patching finished", framework_name));
                    let _ = app_clone.emit("state-update", &*sm);
                    Ok(())
                }
                Err(error) => {
                    let state_machine = app_clone.state::<tokio::sync::Mutex<StateMachine>>();
                    let mut sm = state_machine.lock().await;
                    sm.record_phase_failure(Phase::Patch);
                    sm.update_agent_status(&framework_id, AgentStatus::Complete);
                    sm.log_warn(
                        "Patcher",
                        &format!("{} patching failed, keep original: {}", framework_name, error),
                    );
                    let _ = app_clone.emit("state-update", &*sm);
                    Err(format!("{}: {}", framework_name, error))
                }
            }
        }));
    }

    let mut errors = Vec::new();
    for task in futures {
        match task.await {
            Ok(Ok(())) => {}
            Ok(Err(msg)) => errors.push(msg),
            Err(join_err) => errors.push(format!("Task panicked: {}", join_err)),
        }
    }
    if !errors.is_empty() {
        let state_machine = app.state::<tokio::sync::Mutex<StateMachine>>();
        let mut sm = state_machine.lock().await;
        sm.log_error("Engine", &format!("Patching had {} failures", errors.len()));
    }

    let state_machine = app.state::<tokio::sync::Mutex<StateMachine>>();
    let mut sm = state_machine.lock().await;
    sm.record_phase_duration(Phase::Patch, elapsed_ms(phase_started_at));
    let _ = app.emit("state-update", &*sm);

    Ok(())
}

pub(crate) async fn run_consensus(
    app: &AppHandle,
    client: &std::sync::Arc<LLMClient>,
    model_name: &str,
) -> AppResult<()> {
    let phase_started_at = Instant::now();
    let (topic, reframed_issue, agent_outputs_text, risks) = {
        let state_machine = app.state::<tokio::sync::Mutex<StateMachine>>();
        let mut sm = state_machine.lock().await;

        sm.current_phase = Phase::Consensus;
        sm.log_info("Engine", "Starting phase 4: consensus");
        let _ = app.emit("state-update", &*sm);

        let topic = sm.topic.clone();
        let reframed_issue = sm.reframed_issue.clone().unwrap_or_default();
        let risks = sm.tolerated_risks.clone();

        let outputs = sm
            .agents
            .iter()
            .map(|(id, agent)| {
                format!(
                    "## [{}] v{}\n\n{}",
                    id,
                    agent.version,
                    truncate_context(&agent.content)
                )
            })
            .collect::<Vec<_>>()
            .join("\n\n---\n\n");

        (topic, reframed_issue, outputs, risks)
    };

    let system_prompt = r#"你是”首席战略咨询与决策合成专家”（Chief Strategy Synthesizer）。

# Context & Mission
客户提出了一项商业决策、执行落地、原因分析或沟通协商问题。
你将收到以下输入：
1) 原始问题
2) 重塑问题
3) 多框架详细回复
4) 容忍风险清单（若有）

你的任务是深度吸收并交叉比对这些信息，为客户输出一份结构清晰、逻辑严密、具备落地指导意义的”战略决策综合报告”。

# Constraints
- 语气受众：直接面向客户，专业、客观、务实。
- 一句话结论：必须是总结型，概括核心矛盾与整体解法方向。
- 客观诚实：若存在根本冲突，必须明确指出并解释底层原因。
- 信息黑盒：不要暴露思考过程，不输出 <Thinking_Process> 等过程内容。
- 若输入中存在”Temporary tolerated unresolved risks”，必须在”风险与缓解对策”中明确标注它们是”临时容忍项（未收敛，非最终共识）”。
- **弥合共识与落地割裂**：共识部分必须使用客户能理解的具体语言，避免抽象概念；每个核心观点要说明”落地意味着什么”。

# Workflow
Step 1（后台静默执行，不对客户展示）：
- 意图对齐：对比原始问题与重塑问题，锁定真实痛点。
- 共识提取：找出不同框架共同指向的策略点。
- 分歧锚定：识别可控分歧与致命风险，并与容忍风险清单对齐。
- 路径规划：基于共识与风险缓解，推导下一步路径。

Step 2（仅输出最终报告，严格使用以下结构）：

---

【本报告定位】
- **共识部分**：回答”做什么、为什么”——战略方向与决策依据
- **落地方案**（如需生成）：回答”怎么做、谁来做、何时做完”——执行细节

---

### 💡 一句话结论
[总结型结论，用具体语言概括核心矛盾与解法方向]

### 🤝 核心共识
*共识是多个思维框架共同指向的战略方向。以下是必须坚持的原则：*

**[共识主题 1]**
- 战略方向：[用具体语言说明要做什么]
- 落地意味着：[这个原则在执行层面具体要做什么事，用例子说明]
- 为什么重要：[简要说明坚持这个方向的原因]

**[共识主题 2]**
- 战略方向：[用具体语言说明要做什么]
- 落地意味着：[这个原则在执行层面具体要做什么事，用例子说明]
- 为什么重要：[简要说明坚持这个方向的原因]

### ⚖️ 主要分歧
*分歧是需要客户做出选择的决策点，不同选择各有利弊：*

**[分歧点 1]**
- 选项 A：[具体做法] → 优势：... / 风险：...
- 选项 B：[具体做法] → 优势：... / 风险：...
- 建议：[给出倾向性建议及理由，或说明需要客户提供更多信息才能判断]

### 🚨 风险与缓解对策
- **[风险名称]**：[触发条件与影响]
  - **缓解策略**：[具体防范措施]
- **[风险名称]**：[触发条件与影响]
  - **缓解策略**：[具体防范措施]
*(若该风险来自 Temporary tolerated unresolved risks，必须在风险名称后标注”【临时容忍项】”。)*

### 🗺️ 决策要点
*以下是需要客户亲自判断的关键决策点，不涉及具体执行时间线：*
- [决策点 1：需要客户拍板的选择]
- [决策点 2：需要客户确认的边界条件]

*(具体执行时间线、分工、验收标准将在”落地方案”中详细展开，本共识报告不重复列出。)*

# Self-Check（内部执行，不对外展示）
- 一句话结论是否是总结型而非简单是非判断。
- 核心共识是否用了具体语言，每个共识是否说明了”落地意味着什么”。
- 风险与缓解是否呼应容忍风险清单。
- 是否避免了在共识中重复列出执行时间线（时间线留给落地方案）。"#;

    let mut user_content = format!("Topic:\n{}\n\n", topic);
    if !reframed_issue.is_empty() {
        user_content.push_str(&format!("Reframed issue:\n{}\n\n", reframed_issue));
    }
    user_content.push_str(&format!(
        "Multi-framework outputs:\n{}\n",
        agent_outputs_text
    ));

    if !risks.is_empty() {
        user_content
            .push_str("\nTemporary tolerated unresolved risks (非最终共识，仅临时挂起项):\n");
        for risk in &risks {
            user_content.push_str(&format!(
                "- [framework={}] 风险摘要：{}；证据：{}；建议后续动作：{}\n",
                risk.framework_id, risk.risk_summary, risk.evidence, risk.next_action
            ));
        }
    }

    let messages = vec![
        llm::Message::system(system_prompt),
        llm::Message::user(user_content),
    ];

    let mut used_consensus_fallback = false;
    let mut consensus_failed = false;
    let consensus = match client
        .generate_content(model_name, messages, Some(0.5), Some(4096))
        .await
    {
        Ok(response) => response
            .choices
            .first()
            .and_then(|c| c.message.as_ref())
            .map(|m| m.content.clone())
            .filter(|text| !text.is_empty())
            .unwrap_or_else(|| {
                used_consensus_fallback = true;
                Synthesizer::fallback_synthesize(&agent_outputs_text, &risks)
            }),
        Err(_) => {
            used_consensus_fallback = true;
            consensus_failed = true;
            Synthesizer::fallback_synthesize(&agent_outputs_text, &risks)
        }
    };

    let state_machine = app.state::<tokio::sync::Mutex<StateMachine>>();
    let mut sm = state_machine.lock().await;
    if consensus_failed {
        sm.record_phase_failure(Phase::Consensus);
    }
    if used_consensus_fallback {
        sm.record_consensus_fallback();
    }
    sm.set_consensus(consensus);
    sm.record_phase_duration(Phase::Consensus, elapsed_ms(phase_started_at));
    sm.log_info("Engine", "Phase 4 complete: consensus generated");
    let _ = app.emit("state-update", &*sm);
    Ok(())
}

pub(crate) struct Synthesizer;

impl Synthesizer {
    pub(crate) fn fallback_synthesize(agent_outputs: &str, risks: &[ToleratedRiskItem]) -> String {
        let mut md = String::new();
        md.push_str("### 💡 一句话结论\n");
        md.push_str("本次自动整合触发降级流程，当前先基于各框架原始输出来支持决策判断，建议人工复核后再进入执行。\n\n");

        md.push_str("### 🤝 核心共识\n");
        md.push_str("- 系统已保留全部多框架原始结果与风险清单，信息可追溯。\n");
        md.push_str("- 当前结果以“保真可读”为优先，避免因整合失败导致信息丢失。\n\n");

        md.push_str("### ⚖️ 主要分歧\n");
        md.push_str(
            "- 由于整合模型失败，分歧点未自动归并，请结合下方“多框架原始输出”人工判读。\n\n",
        );

        md.push_str("### 🚨 风险与缓解对策\n");
        if risks.is_empty() {
            md.push_str("- **暂无新增风险条目**：本轮未记录容忍风险清单。\n");
            md.push_str("  - **缓解策略**：建议人工复核各框架输出，补充潜在风险后再决策。\n\n");
        } else {
            for risk in risks {
                md.push_str(&format!(
                    "- **[{}][临时容忍项] {}**：{}\n",
                    risk.framework_id, risk.risk_summary, risk.evidence
                ));
                md.push_str(&format!("  - **缓解策略**：{}\n", risk.next_action));
            }
            md.push('\n');
        }

        md.push_str("### 🗺️ 下一步的行动方案（按需输出）\n");
        md.push_str("- 当前以决策判断为主，建议先完成人工复核，再决定是否进入执行动作。\n");
        md.push_str("- 若需推进执行，请先从低风险试点启动，并明确验收标准与止损条件。\n\n");

        md.push_str("### 📎 多框架原始输出（降级保留）\n\n");
        md.push_str(agent_outputs);
        md
    }
}
