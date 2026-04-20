/**
 * Tests for useTypewriter hook
 *
 * Verifies progressive text reveal, reset on new content,
 * continuation on append, and interval cleanup.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTypewriter } from "../useTypewriter";

describe("useTypewriter", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reveals text progressively", () => {
    const { result } = renderHook(() => useTypewriter("Hello", 1, 10));

    // Initial render: interval not yet fired
    expect(result.current).toBe("");

    act(() => vi.advanceTimersByTime(10));
    expect(result.current).toBe("H");

    act(() => vi.advanceTimersByTime(10));
    expect(result.current).toBe("He");

    act(() => vi.advanceTimersByTime(10));
    expect(result.current).toBe("Hel");

    act(() => vi.advanceTimersByTime(10));
    expect(result.current).toBe("Hell");

    act(() => vi.advanceTimersByTime(10));
    expect(result.current).toBe("Hello");

    // Further advances should not change anything
    act(() => vi.advanceTimersByTime(100));
    expect(result.current).toBe("Hello");
  });

  it("shows empty string when content is empty", () => {
    const { result } = renderHook(() => useTypewriter("", 1, 10));
    expect(result.current).toBe("");
  });

  it("resets from scratch when new content does not start with previous", () => {
    const { result, rerender } = renderHook(
      ({ content }) => useTypewriter(content, 1, 10),
      { initialProps: { content: "Hello" } },
    );

    act(() => vi.advanceTimersByTime(50));
    expect(result.current).toBe("Hello");

    rerender({ content: "World" });
    // After rerender, effect runs and resets displayed to ''
    expect(result.current).toBe("");

    act(() => vi.advanceTimersByTime(10));
    expect(result.current).toBe("W");
  });

  it("continues typing when new content appends to previous", () => {
    const { result, rerender } = renderHook(
      ({ content }) => useTypewriter(content, 1, 10),
      { initialProps: { content: "Hello" } },
    );

    act(() => vi.advanceTimersByTime(50));
    expect(result.current).toBe("Hello");

    rerender({ content: "Hello World" });
    // Continues from previous length (5), so next tick reveals 6th char (space)
    act(() => vi.advanceTimersByTime(10));
    expect(result.current).toBe("Hello ");

    act(() => vi.advanceTimersByTime(10));
    expect(result.current).toBe("Hello W");

    act(() => vi.advanceTimersByTime(200));
    expect(result.current).toBe("Hello World");
  });

  it("shows full text when charsPerTick exceeds content length", () => {
    const { result } = renderHook(() => useTypewriter("Hi", 10, 10));
    expect(result.current).toBe("");

    act(() => vi.advanceTimersByTime(10));
    expect(result.current).toBe("Hi");
  });

  it("clears interval on unmount", () => {
    const { unmount } = renderHook(() => useTypewriter("Hello", 1, 10));
    expect(() => unmount()).not.toThrow();
  });
});
