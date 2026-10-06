import { useId, useLayoutEffect, useRef, useState, type ComponentProps } from 'react';

// Mantém o foco no diálogo e o devolve ao controle que o abriu.
export function DialogSurface({ children, onKeyDown, ...props }: ComponentProps<'div'>) {
  const ref = useRef<HTMLDivElement>(null);
  const generatedId = useId();
  const [headingId, setHeadingId] = useState<string>();

  useLayoutEffect(() => {
    const surface = ref.current;
    if (!surface) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const heading = surface.querySelector('h2, h3');
    if (heading) {
      if (!heading.id) heading.id = generatedId;
      setHeadingId(heading.id);
    }
    if (!surface.contains(document.activeElement)) {
      const first = surface.querySelector<HTMLElement>('input:not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled)');
      (first ?? surface).focus();
    }
    return () => { if (previous?.isConnected) previous.focus(); };
  }, [generatedId]);

  return (
    <div {...props} ref={ref} tabIndex={-1} role="dialog" aria-modal="true"
      aria-labelledby={props['aria-labelledby'] ?? headingId}
      onKeyDown={event => {
        onKeyDown?.(event);
        if (event.defaultPrevented || event.key !== 'Tab') return;
        const controls = Array.from<HTMLElement>(ref.current?.querySelectorAll<HTMLElement>(
          'input:not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled), [tabindex="0"]',
        ) ?? []).filter(element => element.tabIndex >= 0 && element.checkVisibility());
        const first = controls[0];
        const last = controls.at(-1);
        if (!first) { event.preventDefault(); ref.current?.focus(); return; }
        if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) {
          event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first.focus();
        }
      }}>
      {children}
    </div>
  );
}
