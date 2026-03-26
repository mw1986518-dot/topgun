import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Plus, Edit2, Trash2, X, Check } from "lucide-react";
import type { Framework } from "../../types";

export default function FrameworksView() {
  const [frameworks, setFrameworks] = useState<Framework[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingFramework, setEditingFramework] = useState<Framework | null>(null);
  const [showEditor, setShowEditor] = useState(false);

  useEffect(() => {
    loadFrameworks();
  }, []);

  async function loadFrameworks() {
    try {
      const result = await invoke<Framework[]>("get_frameworks");
      setFrameworks(result);
    } catch (e) {
      console.error("Failed to load frameworks:", e);
    } finally {
      setLoading(false);
    }
  }

  function handleNewFramework() {
    setEditingFramework({
      id: `custom-${Date.now()}`,
      name: "",
      icon: "🎯",
      description: "",
      system_prompt: "",
      is_builtin: false,
    });
    setShowEditor(true);
  }

  function handleEditFramework(framework: Framework) {
    if (framework.is_builtin) return;
    setEditingFramework({ ...framework });
    setShowEditor(true);
  }

  async function handleSaveFramework() {
    if (!editingFramework) return;
    try {
      const isNew = !frameworks.some((f) => f.id === editingFramework.id);
      if (isNew) {
        await invoke("add_custom_framework", {
          framework: { ...editingFramework, is_builtin: false },
        });
      } else {
        await invoke("update_custom_framework", { framework: editingFramework });
      }
      await loadFrameworks();
      setShowEditor(false);
      setEditingFramework(null);
    } catch (e) {
      console.error("Failed to save framework:", e);
      alert(String(e));
    }
  }

  async function handleDeleteFramework(id: string) {
    if (!confirm("确定要删除这个自定义框架吗？")) return;
    try {
      await invoke("delete_custom_framework", { id });
      await loadFrameworks();
    } catch (e) {
      console.error("Failed to delete framework:", e);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-notion-text-gray">加载中...</div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-notion-text">思维框架库</h1>
            <p className="text-notion-text-gray mt-1">管理内置和自定义的思维框架</p>
          </div>

          <button
            onClick={handleNewFramework}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-[var(--text-primary)] hover:opacity-90 cursor-pointer"
            style={{ background: "var(--bg-hover)", border: "1px solid var(--border-color)", color: "var(--text-primary)" }}
          >
            <Plus size={18} />
            新建框架
          </button>
        </div>

        <section>
          <h2 className="text-sm font-medium text-notion-text-gray uppercase tracking-wide mb-4">
            系统内置框架
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {frameworks
              .filter((f) => f.is_builtin)
              .map((framework) => (
                <div
                  key={framework.id}
                  className="p-4 rounded-xl transition-all hover:scale-[1.01] cursor-default"
                  style={{
                    background: "var(--color-bg-secondary)",
                    border: "1px solid var(--color-border)",
                  }}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{framework.icon}</span>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-notion-text">{framework.name}</h3>
                      <p className="text-sm text-notion-text-gray mt-1">{framework.description}</p>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </section>

        <section>
          <h2 className="text-sm font-medium text-notion-text-gray uppercase tracking-wide mb-4">
            用户自定义框架
          </h2>
          {frameworks.filter((f) => !f.is_builtin).length === 0 ? (
            <div
              className="text-center py-12 rounded-lg"
              style={{ border: "2px dashed var(--color-border)" }}
            >
              <p className="text-notion-text-gray">暂无自定义框架</p>
              <button
                onClick={handleNewFramework}
                className="mt-4 hover:underline cursor-pointer"
                style={{ color: "var(--color-accent)" }}
              >
                创建第一个框架
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {frameworks
                .filter((f) => !f.is_builtin)
                .map((framework) => (
                  <div
                    key={framework.id}
                    className="p-4 rounded-xl group transition-all hover:scale-[1.01]"
                    style={{
                      background: "var(--color-bg-secondary)",
                      border: "1px solid var(--color-border)",
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-2xl">{framework.icon}</span>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-notion-text">{framework.name}</h3>
                        <p className="text-sm text-notion-text-gray mt-1">{framework.description}</p>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleEditFramework(framework)}
                          className="p-1 rounded hover:bg-notion-hover text-notion-text-gray cursor-pointer"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleDeleteFramework(framework.id)}
                          className="p-1 rounded hover:bg-red-500/10 text-red-400 cursor-pointer"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </section>
      </div>

      {showEditor && editingFramework && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div
            className="rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[80vh] overflow-y-auto"
            style={{
              background: "var(--color-bg-secondary)",
              border: "1px solid var(--color-border)",
            }}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-notion-border">
              <h2 className="text-xl font-semibold text-notion-text">
                {editingFramework.id.startsWith("custom-") ? "新建框架" : "编辑框架"}
              </h2>
              <button
                onClick={() => setShowEditor(false)}
                className="p-1 rounded hover:bg-notion-hover text-notion-text-gray cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-notion-text mb-1">名称</label>
                  <input
                    type="text"
                    value={editingFramework.name}
                    onChange={(e) =>
                      setEditingFramework({ ...editingFramework, name: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg focus:outline-none"
                    style={{
                      background: "var(--color-bg-tertiary)",
                      border: "1px solid var(--color-border)",
                      color: "var(--color-text-primary)",
                    }}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-notion-text mb-1">图标</label>
                  <input
                    type="text"
                    value={editingFramework.icon}
                    onChange={(e) =>
                      setEditingFramework({ ...editingFramework, icon: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg focus:outline-none"
                    style={{
                      background: "var(--color-bg-tertiary)",
                      border: "1px solid var(--color-border)",
                      color: "var(--color-text-primary)",
                    }}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-notion-text mb-1">描述</label>
                <input
                  type="text"
                  value={editingFramework.description}
                  onChange={(e) =>
                    setEditingFramework({ ...editingFramework, description: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg focus:outline-none"
                  style={{
                    background: "var(--color-bg-tertiary)",
                    border: "1px solid var(--color-border)",
                    color: "var(--color-text-primary)",
                  }}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-notion-text mb-1">系统提示词</label>
                <textarea
                  value={editingFramework.system_prompt}
                  onChange={(e) =>
                    setEditingFramework({ ...editingFramework, system_prompt: e.target.value })
                  }
                  rows={8}
                  className="w-full px-3 py-2 rounded-lg font-mono text-sm focus:outline-none"
                  style={{
                    background: "var(--color-bg-tertiary)",
                    border: "1px solid var(--color-border)",
                    color: "var(--color-text-primary)",
                  }}
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-notion-border">
              <button
                onClick={() => setShowEditor(false)}
                className="px-4 py-2 rounded-lg border border-notion-border text-notion-text-gray hover:bg-notion-hover cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={handleSaveFramework}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-[var(--text-primary)] hover:opacity-90 cursor-pointer"
                style={{ background: "var(--bg-hover)", border: "1px solid var(--border-color)", color: "var(--text-primary)" }}
              >
                <Check size={18} />
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

