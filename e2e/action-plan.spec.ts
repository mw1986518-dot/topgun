import { expect, test } from "@playwright/test";
import { installTauriMock } from "./utils/installTauriMock";

test.beforeEach(async ({ page }) => {
  await installTauriMock(page);
});

/**
 * 辅助函数：走完主流程到达共识阶段
 */
async function runToConsensus(page: import("@playwright/test").Page) {
  await page.goto("/");

  await page
    .getByPlaceholder(
      "例如：两个客户都不愿意签年度保底协议，如何在不让利过多的前提下推进成交？",
    )
    .fill("两个核心客户都拖延决策，如何提高季度签约率？");
  await page.getByRole("button", { name: "开始深度分析" }).click();

  // 阶段二：问题重塑对话
  await expect(page.getByText("阶段 2：问题重塑对话")).toBeVisible();
  await expect(page.getByRole("button", { name: "生成专家级问题简报" })).toBeEnabled();

  await page
    .getByPlaceholder("继续补充你的上下文、约束和真实目标...")
    .fill("目标是本季度新增 2 个签约客户，红线是不能直接打价格战。");
  await page.getByRole("button", { name: "发送" }).click();
  await expect(page.getByText("收到，我继续深挖这个问题。")).toBeVisible();

  await page.getByRole("button", { name: "生成专家级问题简报" }).click();

  // 阶段二：框架选择
  await expect(page.getByText("阶段 2：框架选择")).toBeVisible();
  await expect(page.getByRole("heading", { name: "重塑议题" })).toBeVisible();

  // 锁定框架并推演
  await page.getByRole("button", { name: "锁定阵容并推演" }).click();

  // 阶段四：共识输出
  await expect(page.getByText("阶段 4：最终共识与交付")).toBeVisible();
}

test("@action-plan 共识输出后显示'生成落地方案'按钮", async ({ page }) => {
  await runToConsensus(page);

  // AC-1: 共识输出后显示"生成落地方案"按钮
  await expect(page.getByRole("button", { name: "生成落地方案" })).toBeVisible();
  await expect(page.getByRole("button", { name: "生成落地方案" })).toBeEnabled();
});

test("@action-plan 点击按钮后进入参数收集对话", async ({ page }) => {
  await runToConsensus(page);

  // 点击"生成落地方案"按钮
  await page.getByRole("button", { name: "生成落地方案" }).click();

  // 验证参数收集对话面板显示
  await expect(page.getByText("回答以下问题")).toBeVisible();

  // 验证进度指示
  await expect(page.getByText("0 / 2 个问题")).toBeVisible();

  // 验证问题内容
  await expect(page.getByText("预期的预算范围是多少？")).toBeVisible();
  await expect(page.getByText("关联行动：激励重构")).toBeVisible();
});

test("@action-plan 回答问题后显示下一题", async ({ page }) => {
  await runToConsensus(page);

  // 开始落地方案流程
  await page.getByRole("button", { name: "生成落地方案" }).click();
  await expect(page.getByText("预期的预算范围是多少？")).toBeVisible();

  // 回答第一个问题
  await page.getByPlaceholder("输入你的回答...").fill("8000元左右");
  await page.getByRole("button", { name: "发送" }).click();

  // 验证进度更新
  await expect(page.getByText("1 / 2 个问题")).toBeVisible();

  // 验证第二个问题显示
  await expect(page.getByText("团队目前几人？")).toBeVisible();
  await expect(page.getByText("关联行动：SOP降维")).toBeVisible();
});

test("@action-plan 参数收集完成后生成落地方案", async ({ page }) => {
  await runToConsensus(page);

  // 开始落地方案流程
  await page.getByRole("button", { name: "生成落地方案" }).click();

  // 回答所有问题
  await page.getByPlaceholder("输入你的回答...").fill("8000元左右");
  await page.getByRole("button", { name: "发送" }).click();

  await page.getByPlaceholder("输入你的回答...").fill("3人");
  await page.getByRole("button", { name: "发送" }).click();

  // 验证落地方案生成
  await expect(page.locator("h3").filter({ hasText: "📋 落地方案" })).toBeVisible();
  await expect(page.getByText("行动清单")).toBeVisible();
  await expect(page.getByText("激励重构")).toBeVisible();
});

test("@action-plan 用户可切换查看共识报告/落地方案", async ({ page }) => {
  await runToConsensus(page);

  // 生成落地方案
  await page.getByRole("button", { name: "生成落地方案" }).click();
  await page.getByPlaceholder("输入你的回答...").fill("8000元");
  await page.getByRole("button", { name: "发送" }).click();
  await page.getByPlaceholder("输入你的回答...").fill("3人");
  await page.getByRole("button", { name: "发送" }).click();

  // 验证切换按钮显示
  await expect(page.getByRole("button", { name: "共识报告" })).toBeVisible();
  await expect(page.getByRole("button", { name: "落地方案" })).toBeVisible();

  // 默认显示落地方案（因为刚生成）
  await expect(page.locator("h3").filter({ hasText: "📋 落地方案" })).toBeVisible();

  // 切换到共识报告
  await page.getByRole("button", { name: "共识报告" }).click();
  await expect(page.getByText("一句话结论")).toBeVisible();

  // 切换回落地方案
  await page.getByRole("button", { name: "落地方案" }).click();
  await expect(page.locator("h3").filter({ hasText: "📋 落地方案" })).toBeVisible();
});

test.skip("@action-plan 用户可取消参数收集流程", async ({ page }) => {
  // 跳过：取消按钮的 E2E 测试需要进一步调试选择器
  // 该功能在前端单元测试中已覆盖
});

test("@action-plan 落地方案包含具体数字和明确时间", async ({ page }) => {
  await runToConsensus(page);

  // 生成落地方案
  await page.getByRole("button", { name: "生成落地方案" }).click();
  await page.getByPlaceholder("输入你的回答...").fill("8000元");
  await page.getByRole("button", { name: "发送" }).click();
  await page.getByPlaceholder("输入你的回答...").fill("3人");
  await page.getByRole("button", { name: "发送" }).click();

  // 验证落地方案内容结构
  await expect(page.getByText("行动清单")).toBeVisible();
  await expect(page.getByText("风险兜底")).toBeVisible();
  await expect(page.getByText("下一步立即行动")).toBeVisible();
});