import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";

interface Props {
  label: string;
  children: ReactNode;
  defaultOpen?: boolean;
  storageKey?: string;
}

export function SidebarCollapsible({ label, children, defaultOpen = false, storageKey }: Props) {
  const [open, setOpen] = useState(() => {
    if (storageKey) {
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored !== null) return stored === "true";
      } catch { /* ignore */ }
    }
    return defaultOpen;
  });

  function toggle() {
    const next = !open;
    setOpen(next);
    if (storageKey) {
      try { localStorage.setItem(storageKey, String(next)); } catch { /* ignore */ }
    }
  }

  return (
    <div className="mt-1">
      <button
        onClick={toggle}
        className="flex items-center gap-1 w-full px-3 py-1 text-[10px] font-medium uppercase tracking-widest font-mono text-muted-foreground/60 hover:text-muted-foreground transition-colors"
      >
        <ChevronRight
          className={`h-3 w-3 shrink-0 transition-transform duration-150 ${open ? "rotate-90" : ""}`}
        />
        {label}
      </button>
      {open && (
        <div className="flex flex-col gap-0.5 mt-0.5">{children}</div>
      )}
    </div>
  );
}
