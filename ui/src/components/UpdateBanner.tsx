import { useEffect, useState } from "react";

function isTauriEnv() {
  return typeof window !== "undefined" && ("__TAURI__" in window || "__TAURI_INTERNALS__" in window);
}

export function UpdateBanner() {
  const [version, setVersion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (!isTauriEnv()) return;
    const cleanups: (() => void)[] = [];
    import("@tauri-apps/api/event").then(({ listen }) => {
      listen<{ version: string }>("update-available", (e) => {
        setError(null);
        setVersion(e.payload.version);
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
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("install_update");
    } catch {
      setInstalling(false);
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
        {installing ? "Instalando…" : "Instalar y reiniciar"}
      </button>
    </div>
  );
}
