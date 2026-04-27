/**
 * Lazy wrapper for MarkdownEditor.
 *
 * @mdxeditor/editor is a large library (~500 kB+). This module defers its
 * load until the first time an editor is actually rendered, keeping it out of
 * the initial bundle.
 *
 * All consumers should import from here instead of directly from MarkdownEditor.
 */
import { lazy, Suspense, forwardRef, type ElementRef, type ComponentPropsWithRef } from "react"

// Re-export types so callers don't need to reach into MarkdownEditor directly.
export type { MentionOption, MarkdownEditorRef } from "./MarkdownEditor"

const LazyImpl = lazy(() => import("./MarkdownEditor"))

// Fallback shown while the editor bundle is loading.
function EditorFallback({ className }: { className?: string }) {
  return (
    <div
      className={`min-h-[120px] animate-pulse rounded-md border border-border bg-muted/30 ${className ?? ""}`}
      aria-label="Editor loading..."
    />
  )
}

type MarkdownEditorProps = ComponentPropsWithRef<typeof LazyImpl>
type MarkdownEditorHandle = ElementRef<typeof LazyImpl>

/**
 * Drop-in replacement for MarkdownEditor that lazy-loads @mdxeditor/editor on
 * first render. Ref forwarding is preserved via forwardRef.
 */
export const MarkdownEditor = forwardRef<MarkdownEditorHandle, Omit<MarkdownEditorProps, 'ref'>>(
  function MarkdownEditor(props, ref) {
    return (
      <Suspense fallback={<EditorFallback className={props.className} />}>
        <LazyImpl {...props} ref={ref} />
      </Suspense>
    )
  }
)
