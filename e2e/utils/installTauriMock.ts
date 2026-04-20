import type { Page } from "@playwright/test";

/**
 * 在浏览器模式下注入轻量 Tauri IPC Mock。
 * 这份 Mock 要和“当前真实主流程”一致：
 * 议题输入 -> 阶段二问题重塑对话 -> 生成专家级问题简报 -> 框架选择 -> 推演 -> 共识导出。
 */
export async function installTauriMock(page: Page) {
  await page.addInitScript(() => {
    type AnyRecord = Record<string, unknown>;
    type MockMessage = { role: string; content: string };

    const now = () => Date.now();
    const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

    const frameworks = [
      {
        id: "first_principles",
        name: "第一性原理",
        icon: "🔬",
        system_prompt: "You are a first principles thinker.",
        description: "从本质拆解问题，避免被经验噪声误导。",
        is_builtin: true,
      },
      {
        id: "systems_thinking",
        name: "系统思维",
        icon: "🌐",
        system_prompt: "You are a systems thinker.",
        description: "关注系统耦合关系和反馈回路。",
        is_builtin: true,
      },
      {
        id: "bayesian_thinking",
        name: "贝叶斯思维",
        icon: "📈",
        system_prompt: "You are a Bayesian reasoner.",
        description: "基于证据动态更新判断概率。",
        is_builtin: true,
      },
    ];

    const createInitialState = () => ({
      current_phase: "input",
      topic: "",
      clarifications: [],
      clarification_round: 1,
      selected_frameworks: [],
      agents: {},
      iteration_count: 0,
      is_reasoning_running: false,
      max_iterations: 3,
      consensus_output: "",
      tolerated_risks: [],
      ipc_logs: [],
      recommended_frameworks: [],
      reframed_issue: "",
      recommended_experts_panel: "",
      problem_brief_messages: [] as MockMessage[],
      problem_brief_ready: false,
      custom_user_prompt: "",
      diagnostics: {
        phase_durations_ms: {
          divergence_ms: 0,
          examination_ms: 0,
          patch_ms: 0,
          consensus_ms: 0,
          total_ms: 0,
        },
        failure_counts: {
          divergence: 0,
          examination: 0,
          patch: 0,
          consensus: 0,
          total: 0,
        },
        fallback_counts: {
          examination_parser_repair: 0,
          examination_text_fallback: 0,
          consensus_synthesizer_fallback: 0,
          total: 0,
        },
        reasoning_runs: 0,
      },
      // 落地方案相关字段
      action_plan_questions: [] as Array<{
        key: string;
        question: string;
        reason: string;
        related_action: string;
      }>,
      action_plan_answers: {} as Record<string, string>,
      current_action_plan_question_index: 0,
      action_plan: "",
      action_plan_in_progress: false,
    });

    type MockState = ReturnType<typeof createInitialState>;

    let state: MockState = createInitialState();
    let historyEntries: Array<{
      id: string;
      created_at: number;
      model: string;
      state: MockState;
    }> = [];

    const callbacks = new Map<number, (payload: unknown) => void>();
    let callbackSeq = 1;

    const eventBindings = new Map<number, { event: string; handlerId: number }>();
    let eventBindingSeq = 1;

    const emitEvent = (event: string, payload: unknown) => {
      for (const [bindingId, binding] of eventBindings.entries()) {
        if (binding.event !== event) continue;
        const cb = callbacks.get(binding.handlerId);
        if (!cb) continue;
        cb({ id: bindingId, event, payload });
      }
    };

    const emitStateUpdate = () => {
      state.ipc_logs.push({
        timestamp: now(),
        level: "info",
        source: "MockIPC",
        message: `state-update emitted (phase=${state.current_phase})`,
      });
      emitEvent("state-update", clone(state));
    };

    const getArg = (args: AnyRecord | undefined, key: string) =>
      (args?.[key] as unknown) ?? (args?.[camelToSnake(key)] as unknown);

    const camelToSnake = (input: string) =>
      input.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);

    const buildAgents = (ids: string[]) => {
      const agents: Record<
        string,
        {
          framework_id: string;
          status: string;
          content: string;
          version: number;
          objections: string[];
        }
      > = {};

      for (const id of ids) {
        agents[id] = {
          framework_id: id,
          status: "idle",
          content: "",
          version: 1,
          objections: [],
        };
      }
      return agents;
    };

    const persistHistory = () => {
      if (!state.consensus_output?.trim()) return;
      const entry = {
        id: `session-${now()}`,
        created_at: now(),
        model: "mock-gpt",
        state: clone(state),
      };
      historyEntries = [entry, ...historyEntries].slice(0, 50);
    };

    const buildFollowUpReply = (userMessage: string) => {
      return [
        "收到，我继续深挖这个问题。",
        `你刚提到：${userMessage.slice(0, 24)}${userMessage.length > 24 ? "..." : ""}`,
        "请再补充 2 点：",
        "1) 绝对不能触碰的红线是什么？",
        "2) 你希望最晚什么时候看到可验证结果？",
      ].join("\n");
    };

    const handleBusinessCommand = async (
      cmd: string,
      args?: AnyRecord,
    ): Promise<unknown> => {
      if (cmd === "get_state") return clone(state);
      if (cmd === "get_frameworks") return clone(frameworks);

      if (cmd === "start_session") {
        const topic = String(getArg(args, "topic") ?? "").trim();
        state = createInitialState();
        state.topic = topic;
        state.current_phase = "frameworkselection";
        state.problem_brief_messages = [
          {
            role: "assistant",
            content:
              "我们先不急着给方案。请先告诉我：\n1) 你最想达成的可量化结果是什么？\n2) 当前最硬的资源或时间约束是什么？",
          },
        ];
        emitStateUpdate();
        return null;
      }

      if (cmd === "continue_problem_brief_dialogue") {
        if (state.current_phase !== "frameworkselection") {
          throw new Error("当前阶段不支持 Problem Brief 对话。");
        }
        if (state.problem_brief_ready) {
          throw new Error("简报已生成，你可以直接进入下一步框架选择。");
        }

        const userMessage = String(
          getArg(args, "userMessage") ?? getArg(args, "user_message") ?? "",
        ).trim();
        if (!userMessage) {
          throw new Error("请输入内容后再发送。");
        }

        state.problem_brief_messages = [
          ...state.problem_brief_messages,
          { role: "user", content: userMessage },
          { role: "assistant", content: buildFollowUpReply(userMessage) },
        ];
        emitStateUpdate();
        return null;
      }

      if (cmd === "generate_problem_brief_delivery") {
        if (state.current_phase !== "frameworkselection") {
          throw new Error("当前阶段不支持生成专家级问题简报。");
        }

        if (state.problem_brief_messages.length === 0) {
          throw new Error("请先进行至少一轮问题重塑对话，再生成专家级问题简报。");
        }

        state.problem_brief_ready = true;
        state.reframed_issue = [
          "# 📑 专家级问题简报 (The Problem Brief)",
          "",
          "**1. 🎯 核心意图与真实需求 (Core Intent)**",
          "* **表面议题：** 提升成交率，但不希望走单纯降价路线。",
          "* **本质需求：** 在约束条件内提升签约效率并保持利润健康。",
          "",
          "**2. 🧭 核心上下文与变量 (Context & Variables)**",
          "* **关键背景：** 客户决策周期拉长，季度签约压力上升。",
          "* **利益相关者：** 销售团队、管理层、关键客户。",
        ].join("\n");

        state.recommended_experts_panel = [
          "# 🧠 推荐解答专家 (Expert Panel)",
          "",
          "**1. 第一性原理**",
          "* **推荐理由：** 先拆解客户迟迟不签约的真实阻塞点。",
          "* **核心发问：** 哪些条件才是成交必需条件？",
          "",
          "**2. 系统思维**",
          "* **推荐理由：** 识别报价、审批、交付承诺之间的联动影响。",
          "* **核心发问：** 哪个环节是当前转化瓶颈？",
          "",
          "**3. 贝叶斯思维**",
          "* **推荐理由：** 用新增证据持续修正策略，而非一次拍板。",
          "* **核心发问：** 哪些信号能证明策略正在变好？",
        ].join("\n");

        state.recommended_frameworks = [
          "first_principles",
          "systems_thinking",
          "bayesian_thinking",
        ];

        state.custom_user_prompt =
          "Please output a structured plan under your framework. Include assumptions, risks, and execution steps.";

        state.problem_brief_messages = [
          ...state.problem_brief_messages,
          {
            role: "assistant",
            content:
              "最终输出\n```markdown\n# 📑 专家级问题简报\n...\n```\n\n推荐专家\n```markdown\n# 🧠 推荐解答专家\n...\n```",
          },
        ];

        emitStateUpdate();
        return null;
      }

      if (cmd === "submit_clarifications") {
        throw new Error(
          "当前版本已取消固定两轮澄清，请直接在阶段二对话区继续补充信息，并在准备好后点击“生成专家级问题简报”。",
        );
      }

      if (cmd === "select_frameworks") {
        if (!state.problem_brief_ready) {
          throw new Error(
            "请先在阶段二点击“生成专家级问题简报”，拿到“简报+推荐专家”双代码块后再锁定框架。",
          );
        }

        const frameworkIds =
          (getArg(args, "frameworkIds") as string[]) ??
          (getArg(args, "framework_ids") as string[]) ??
          [];

        const validIds = frameworkIds.filter((id) =>
          frameworks.some((item) => item.id === id),
        );

        if (validIds.length === 0) {
          throw new Error("至少选择一个框架。");
        }

        state.selected_frameworks = validIds;
        state.agents = buildAgents(validIds);
        state.current_phase = "divergence";
        state.custom_user_prompt = String(getArg(args, "customUserPrompt") ?? "");
        emitStateUpdate();
        return null;
      }

      if (cmd === "run_reasoning") {
        state.is_reasoning_running = true;
        state.diagnostics.reasoning_runs += 1;
        state.diagnostics.last_run_started_at = now();
        emitStateUpdate();

        for (const frameworkId of Object.keys(state.agents)) {
          state.agents[frameworkId] = {
            ...state.agents[frameworkId],
            status: "pass",
            content: `基于 ${frameworkId} 的方案草稿已生成。`,
            version: 2,
            objections: [],
          };
        }

        state.current_phase = "consensus";
        state.iteration_count = 1;
        state.consensus_output = [
          "### 一句话结论",
          "建议先做低风险试点，再按验证数据扩大执行范围。",
          "",
          "### 核心共识",
          "- 先明确验收标准，再推进资源投入。",
          "- 用分阶段里程碑降低执行不确定性。",
        ].join("\n");

        state.diagnostics.phase_durations_ms = {
          divergence_ms: 1200,
          examination_ms: 900,
          patch_ms: 600,
          consensus_ms: 1100,
          total_ms: 3800,
        };
        state.diagnostics.failure_counts = {
          divergence: 0,
          examination: 0,
          patch: 0,
          consensus: 0,
          total: 0,
        };
        state.diagnostics.fallback_counts = {
          examination_parser_repair: 1,
          examination_text_fallback: 0,
          consensus_synthesizer_fallback: 0,
          total: 1,
        };
        state.diagnostics.last_run_completed_at = now();
        state.is_reasoning_running = false;
        persistHistory();
        emitStateUpdate();
        return null;
      }

      if (cmd === "reset_session") {
        state = createInitialState();
        emitStateUpdate();
        return null;
      }

      if (cmd === "get_history_entries") return clone(historyEntries);

      if (cmd === "load_history_entry") {
        const id = String(getArg(args, "id") ?? "");
        const found = historyEntries.find((entry) => entry.id === id);
        if (!found) throw new Error(`History entry not found: ${id}`);
        state = clone(found.state);
        emitStateUpdate();
        return clone(state);
      }

      if (cmd === "delete_history_entry") {
        const id = String(getArg(args, "id") ?? "");
        historyEntries = historyEntries.filter((entry) => entry.id !== id);
        return null;
      }

      if (cmd === "clear_history_entries") {
        historyEntries = [];
        return null;
      }

      if (cmd === "export_consensus_markdown") {
        return "C:/mock/consensus.md";
      }

      if (cmd === "get_settings") {
        return {
          base_url: "https://mock.local",
          api_key: "mock-key",
          model: "mock-gpt",
          timeout_seconds: 60,
          enable_retry: true,
          max_retries: 3,
          retry_delay_ms: 1000,
          max_iterations: 3,
          enable_fallback: true,
          fallback_base_url: "https://mock-fallback.local",
          fallback_api_key: "mock-fallback-key",
          fallback_model: "mock-gpt-fallback",
        };
      }

      if (cmd === "save_settings") return null;
      if (cmd === "test_llm_connection") return "主模型连通性测试成功";
      if (cmd === "test_fallback_connection") return "备选模型连通性测试成功";

      if (cmd === "add_custom_framework") return null;
      if (cmd === "update_custom_framework") return null;
      if (cmd === "delete_custom_framework") return null;

      // ========== 落地方案相关命令 ==========
      if (cmd === "start_action_plan") {
        if (!state.consensus_output?.trim()) {
          throw new Error("请先生成共识报告后再生成落地方案。");
        }
        state.action_plan_questions = [
          {
            key: "budget",
            question: "预期的预算范围是多少？",
            reason: "薪酬方案需要具体数字才能计算各项比例",
            related_action: "激励重构",
          },
          {
            key: "team_size",
            question: "团队目前几人？",
            reason: "SOP分工需要明确人员配置",
            related_action: "SOP降维",
          },
        ];
        state.action_plan_answers = {};
        state.current_action_plan_question_index = 0;
        state.action_plan = "";
        state.action_plan_in_progress = true;
        emitStateUpdate();
        return clone(state.action_plan_questions);
      }

      if (cmd === "answer_action_plan_question") {
        const key = String(getArg(args, "key") ?? "");
        const answer = String(getArg(args, "answer") ?? "");
        state.action_plan_answers[key] = answer;
        state.current_action_plan_question_index += 1;
        emitStateUpdate();
        if (
          state.current_action_plan_question_index < state.action_plan_questions.length
        ) {
          return clone(
            state.action_plan_questions[state.current_action_plan_question_index],
          );
        }
        return null;
      }

      if (cmd === "generate_action_plan") {
        if (Object.keys(state.action_plan_answers).length === 0) {
          throw new Error("请先回答问题后再生成落地方案。");
        }
        state.action_plan = [
          "# 📋 落地方案",
          "",
          "## 一、方案概述",
          "基于共识报告，细化可执行的行动计划。",
          "",
          "## 二、行动清单",
          "| 序号 | 行动项 | 具体内容 | 负责人 | 时间节点 | 验收标准 |",
          "|------|--------|----------|--------|----------|----------|",
          "| 1 | 激励重构 | 底薪调整 + 过程奖励 | 创始人 | 本周内 | 方案确认 |",
          "| 2 | SOP降维 | 简化审批流程 | 合伙人 | 下周一 | 流程上线 |",
          "",
          "## 三、风险兜底",
          "| 风险项 | 触发条件 | 兜底方案 | 截止日期 |",
          "|--------|----------|----------|----------|",
          "| 预算超支 | 实际支出 > 预算 20% | 削减非核心项 | 季度末 |",
          "",
          "## 四、下一步立即行动",
          "今天就可以做的第一件事：召开团队会议，同步激励调整方案。",
        ].join("\n");
        state.action_plan_in_progress = false;
        emitStateUpdate();
        return state.action_plan;
      }

      if (cmd === "get_action_plan_state") {
        return {
          in_progress: state.action_plan_in_progress,
          questions: clone(state.action_plan_questions),
          current_index: state.current_action_plan_question_index,
          answers: clone(state.action_plan_answers),
          action_plan: state.action_plan || null,
        };
      }

      if (cmd === "cancel_action_plan") {
        state.action_plan_in_progress = false;
        state.action_plan_questions = [];
        state.current_action_plan_question_index = 0;
        emitStateUpdate();
        return null;
      }

      throw new Error(`Unhandled mock command: ${cmd}`);
    };

    const unregisterEventBinding = (event: string, eventId: number) => {
      const existing = eventBindings.get(eventId);
      if (!existing) return;
      if (existing.event !== event) return;
      eventBindings.delete(eventId);
    };

    (window as unknown as { isTauri?: boolean }).isTauri = true;
    (
      window as unknown as {
        __TAURI_EVENT_PLUGIN_INTERNALS__?: {
          unregisterListener: typeof unregisterEventBinding;
        };
      }
    ).__TAURI_EVENT_PLUGIN_INTERNALS__ = {
      unregisterListener: unregisterEventBinding,
    };

    (
      window as unknown as {
        __TAURI_INTERNALS__?: {
          transformCallback: (cb: (payload: unknown) => void) => number;
          unregisterCallback: (callbackId: number) => void;
          invoke: (cmd: string, args?: AnyRecord) => Promise<unknown>;
          convertFileSrc: (filePath: string, protocol?: string) => string;
        };
      }
    ).__TAURI_INTERNALS__ = {
      transformCallback: (cb: (payload: unknown) => void) => {
        const id = callbackSeq++;
        callbacks.set(id, cb);
        return id;
      },
      unregisterCallback: (callbackId: number) => {
        callbacks.delete(callbackId);
      },
      invoke: async (cmd: string, args?: AnyRecord) => {
        if (cmd === "plugin:event|listen") {
          const event = String(getArg(args, "event") ?? "");
          const handlerId = Number(getArg(args, "handler"));
          const bindingId = eventBindingSeq++;
          eventBindings.set(bindingId, { event, handlerId });
          return bindingId;
        }

        if (cmd === "plugin:event|unlisten") {
          const event = String(getArg(args, "event") ?? "");
          const eventId = Number(getArg(args, "eventId"));
          unregisterEventBinding(event, eventId);
          return null;
        }

        if (cmd === "plugin:event|emit") return null;
        if (cmd === "plugin:event|emit_to") return null;
        return handleBusinessCommand(cmd, args);
      },
      convertFileSrc: (filePath: string, protocol = "asset") =>
        `${protocol}://${filePath}`,
    };
  });
}
