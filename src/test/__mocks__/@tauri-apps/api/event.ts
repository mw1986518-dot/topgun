/**
 * Mock for @tauri-apps/api/event
 * Provides stubs for listen and event types.
 */
import { vi } from "vitest";

export const listen = vi.fn().mockResolvedValue(() => { });
export type UnlistenFn = () => void;
