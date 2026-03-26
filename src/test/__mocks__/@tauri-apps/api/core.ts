/**
 * Mock for @tauri-apps/api/core
 * Provides a stub `invoke` that tests can override via vi.fn().
 */
import { vi } from "vitest";

export const invoke = vi.fn();
