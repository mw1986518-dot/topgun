import { useTranslation } from "react-i18next";
import { Activity, AlertCircle, Save } from "lucide-react";

interface TestResult {
  success: boolean;
  message: string;
}

interface SettingsFeedbackMessagesProps {
  error: string | null;
  testResult: TestResult | null;
  success: boolean;
}

/**
 * 保存结果、连通性测试结果、错误提示统一展示区。
 */
export default function SettingsFeedbackMessages({
  error,
  testResult,
  success,
}: SettingsFeedbackMessagesProps) {
  const { t } = useTranslation("settings");
  return (
    <>
      {error && (
        <div
          className="flex items-center gap-2 p-3 rounded-lg"
          style={{
            background: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            color: "#F87171",
          }}
        >
          <AlertCircle size={20} />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {testResult && (
        <div
          className="flex items-center gap-2 p-3 rounded-lg"
          style={{
            background: testResult.success
              ? "rgba(34, 197, 94, 0.1)"
              : "rgba(239, 68, 68, 0.1)",
            border: `1px solid ${
              testResult.success ? "rgba(34, 197, 94, 0.3)" : "rgba(239, 68, 68, 0.3)"
            }`,
            color: testResult.success ? "#4ADE80" : "#F87171",
          }}
        >
          <Activity size={20} className="flex-shrink-0" />
          <span className="text-sm break-all">{testResult.message}</span>
        </div>
      )}

      {success && (
        <div
          className="flex items-center gap-2 p-3 rounded-lg"
          style={{
            background: "rgba(34, 197, 94, 0.1)",
            border: "1px solid rgba(34, 197, 94, 0.3)",
            color: "#4ADE80",
          }}
        >
          <Save size={20} className="flex-shrink-0" />
          <span className="text-sm">{t("saved")}</span>
        </div>
      )}
    </>
  );
}
