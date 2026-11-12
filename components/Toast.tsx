"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { errorMessage } from "@/lib/errors";

type Tone = "ok" | "error";
type Toast = { id: number; text: string; tone: Tone };
type Show = (text: string, tone?: Tone) => void;

const ToastContext = createContext<Show>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const show = useCallback<Show>((text, tone = "ok") => {
    const id = nextId.current++;
    setToasts((current) => [...current, { id, text, tone }]);
    setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 4500);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-center gap-2"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`rounded-lg px-4 py-2.5 text-sm font-medium shadow-lg ${
              toast.tone === "ok" ? "bg-ink text-card" : "bg-rust text-card"
            }`}
          >
            {toast.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): Show {
  return useContext(ToastContext);
}

/** Runs a mutation and reports the outcome. Returns whether it succeeded. */
export function useRunner() {
  const show = useToast();
  return useCallback(
    async (action: () => Promise<unknown>, success?: string) => {
      try {
        await action();
        if (success) show(success);
        return true;
      } catch (error) {
        show(errorMessage(error), "error");
        return false;
      }
    },
    [show],
  );
}
