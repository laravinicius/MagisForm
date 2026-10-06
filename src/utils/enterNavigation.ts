import React from 'react';

const FOCUSABLE_SELECTOR = [
  'input:not([type="hidden"]):not([disabled]):not([readonly])',
  'select:not([disabled])',
  'textarea:not([disabled]):not([readonly])',
  'button:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function isIconOnlyButton(el: HTMLElement): boolean {
  if (el.tagName !== 'BUTTON') return false;
  const text = (el.textContent ?? '').trim();
  return text.length === 0;
}

function isVisible(el: HTMLElement): boolean {
  if (el.hasAttribute('aria-hidden')) return false;
  if (typeof el.checkVisibility === 'function') return el.checkVisibility();
  if (el.offsetParent === null) return false;
  return true;
}

export function getFocusables(scope: HTMLElement): HTMLElement[] {
  const els = Array.from(scope.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  return els.filter(el => {
    if (el.tabIndex === -1) return false;
    if (isIconOnlyButton(el)) return false;
    if (!isVisible(el)) return false;
    if (el.hidden) return false;
    return true;
  });
}

export function handleDialogArrowNavigation(e: React.KeyboardEvent<HTMLElement>) {
  if (e.defaultPrevented || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
  if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;

  const target = e.target;
  if (!(target instanceof HTMLElement)) return;
  if (target.isContentEditable || target.matches('input, textarea, select')) return;

  const focusedButton = target.closest('button');
  if (!focusedButton || !e.currentTarget.contains(focusedButton)) return;

  const buttons: HTMLButtonElement[] = [];
  e.currentTarget.querySelectorAll('button:not(:disabled)').forEach(button => {
    if (button.tabIndex < 0 || button.hidden || button.closest('[aria-hidden="true"]')) return;
    if (!button.textContent?.trim() && !button.getAttribute('aria-label') && !button.title) return;
    const isVisible = typeof button.checkVisibility === 'function'
      ? button.checkVisibility()
      : button.offsetParent !== null;
    if (isVisible) buttons.push(button);
  });
  const index = buttons.indexOf(focusedButton);
  if (index === -1) return;

  const nextIndex = e.key === 'ArrowLeft' ? index - 1 : index + 1;
  const nextButton = buttons[nextIndex];
  if (!nextButton) return;

  e.preventDefault();
  nextButton.focus();
}

function isSubmitControl(el: HTMLElement): boolean {
  if (el.tagName === 'BUTTON') return (el as HTMLButtonElement).type === 'submit';
  if (el.tagName === 'INPUT') return (el as HTMLInputElement).type === 'submit';
  return false;
}

function sameForm(el: HTMLElement, target: HTMLElement): boolean {
  return (el as HTMLInputElement).form != null && (el as HTMLInputElement).form === (target as HTMLInputElement).form;
}

export function handleEnterAsTab(e: React.KeyboardEvent<HTMLElement>) {
  if (e.defaultPrevented) return;
  if (e.key !== 'Enter') return;
  if ((e.nativeEvent as KeyboardEvent).isComposing) return;
  const backward = e.shiftKey;
  if (backward || e.ctrlKey || e.altKey || e.metaKey) {
    if (!backward) return;
  }
  const target = e.target as HTMLElement;
  if (!(target instanceof HTMLElement)) return;
  if (target.tagName === 'TEXTAREA') return;
  if (target.tagName !== 'INPUT' && target.tagName !== 'SELECT') return;
  if (target.tagName === 'SELECT' && target.closest('[role="button"]')) return;

  const dialog = target.closest('[role="dialog"]') as HTMLElement | null;
  const scope = (dialog ?? e.currentTarget) as HTMLElement;
  const els = getFocusables(scope);
  const idx = els.indexOf(target);
  if (idx === -1) return;

  if (!backward) {
    const next = els[idx + 1];
    if (!next) return;

    const isLastFieldOfForm = (el: HTMLElement): boolean => {
      const form = (el as HTMLInputElement).form;
      if (!form) return false;
      return !els.slice(idx + 1).some(after => after !== el && sameForm(after, el) && !isSubmitControl(after));
    };

    if (target.tagName === 'INPUT' && isLastFieldOfForm(target)) {
      return;
    }

    if (target.tagName === 'SELECT' && isLastFieldOfForm(target)) {
      e.preventDefault();
      if (isSubmitControl(next)) next.focus();
      return;
    }

    e.preventDefault();
    next.focus();
    return;
  }

  const prev = els[idx - 1];
  if (!prev) return;
  e.preventDefault();
  prev.focus();
}
