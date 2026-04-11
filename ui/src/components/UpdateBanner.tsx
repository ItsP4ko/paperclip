import { useEffect, useState } from "react";

function isTauriEnv() {
  return typeof window !== "undefined" && ("__TAURI__" in window || "__TAURI_INTERNALS__" in window);
}

export function UpdateBanner() {
  const [version, setVersion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  const [autoInstallFailed, setAutoInstallFailed] = useState(false);

  useEffect(() => {
    if (!isTauriEnv()) return;
    const cleanups: (() => void)[] = [];
    import("@tauri-apps/api/event").then(({ listen }) => {
      // Auto-install in progress — just show progress
      listen<{ version: string }>("update-installing", (e) => {
        setError(null);
        setVersion(e.payload.version);
        setInstalling(true);
        setAutoInstallFailed(false);
      }).then((fn) => { cleanups.push(fn); });

      // Auto-install failed — fall back to manual button
      listen<{ version: string }>("update-available", (e) => {
        setError(null);
        setVersion(e.payload.version);
        setInstalling(false);
        setAutoInstallFailed(true);
      }).then((fn) => { cleanups.push(fn); });

      listen<{ error: string }>("update-error", (e) => {
        setError(e.payload.error);
      }).then((fn) => { cleanups.push(fn); });
    });
    return () => { cleanups.forEach((fn) => fn()); };
  }, []);

  if (!version && !error) return null;

  async function handleInstall() {
    setInstalling(true);
    setAutoInstallFailed(false);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("install_update");
    } catch {
      setInstalling(false);
      setAutoInstallFailed(true);
    }
  }

  if (error) {
    return (
      <div className="shrink-0 flex items-center gap-2 bg-destructive/10 border-b border-destructive/20 px-4 py-1.5 text-xs">
        <span className="text-destructive">
          Error al buscar actualizaciones: {error}
        </span>
        <button
          onClick={() => setError(null)}
          className="text-destructive/60 font-medium hover:underline ml-auto"
        >
          Cerrar
        </button>
      </div>
    );
  }

  // Auto-installing — no button needed
  if (installing && !autoInstallFailed) {
    return (
      <div className="shrink-0 flex items-center gap-2 bg-primary/10 border-b border-primary/20 px-4 py-1.5 text-xs">
        <svg className="animate-spin h-3 w-3 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span className="text-foreground">
          Actualizando a <strong>v{version}</strong>... se reiniciará automáticamente
        </span>
      </div>
    );
  }

  // Auto-install failed — show manual retry button
  return (
    <div className="shrink-0 flex items-center justify-between gap-2 bg-primary/10 border-b border-primary/20 px-4 py-1.5 text-xs">
      <span className="text-foreground">
        Nueva versión <strong>v{version}</strong> disponible
      </span>
      <button
        onClick={handleInstall}
        disabled={installing}
        className="text-primary font-medium hover:underline disabled:opacity-50"
      >
        {installing ? "Instalando..." : "Instalar y reiniciar"}
      </button>
    </div>
  );
}
