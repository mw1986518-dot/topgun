import { expect, test } from "@playwright/test";
import { installTauriMock } from "./utils/installTauriMock";

test.beforeEach(async ({ page }) => {
  await installTauriMock(page);
});

async function runToConsensus(page: import("@playwright/test").Page) {
  await page.goto("/");

  await page
    .getByPlaceholder(
      "例如：两个客户都不愿意签年度保底协议，如何在不让利过多的前提下推进成交？",
    )
    .fill("两个核心客户都拖延决策，如何提高季度签约率？");
  await page.getByRole("button", { name: "开始深度分析" }).click();

  // 第一步：确认已经进入“问题重塑对话”面板，而不是旧版“需求澄清”。
  await expect(page.getByText("阶段 2：问题重塑对话")).toBeVisible();
  await expect(page.getByRole("button", { name: "生成专家级问题简报" })).toBeEnabled();

  await page
    .getByPlaceholder("继续补充你的上下文、约束和真实目标...")
    .fill("目标是本季度新增 2 个签约客户，红线是不能直接打价格战。");
  await page.getByRole("button", { name: "发送" }).click();
  await expect(page.getByText("收到，我继续深挖这个问题。")).toBeVisible();

  await page.getByRole("button", { name: "生成专家级问题简报" }).click();

  // 第二步：确认“简报 + 推荐专家”已产出，并进入框架选择页。
  await expect(page.getByText("阶段 2：框架选择")).toBeVisible();
  await expect(page.getByText("重塑议题")).toBeVisible();
  await expect(page.getByText("推荐解答专家")).toBeVisible();

  // 第三步：锁定框架后直接进入推演与最终共识。
  await page.getByRole("button", { name: "锁定阵容并推演" }).click();

  await expect(page.getByText("阶段 4：最终共识与交付")).toBeVisible();
}

test("@smoke 工作台主流程可完整走通", async ({ page }) => {
  await runToConsensus(page);

  await expect(page.getByText("会话诊断")).toBeVisible();
  await expect(page.getByText("推演次数: 1")).toBeVisible();

  await page.getByRole("button", { name: "历史记录" }).click();
  await expect(page.getByRole("heading", { name: "历史记录" })).toBeVisible();
  await expect(page.getByText("1 / 1 条")).toBeVisible();
  await page.getByRole("button", { name: "加载" }).first().click();
  await expect(page.getByRole("heading", { name: "历史记录" })).toHaveCount(0);
});

test("@smoke 共识导出按钮可调用后端命令", async ({ page }) => {
  await runToConsensus(page);

  await page.getByRole("button", { name: "导出 Markdown" }).click();
  await expect(page.getByText("已导出到：C:/mock/consensus.md")).toBeVisible();
});
