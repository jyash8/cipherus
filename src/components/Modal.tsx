"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  initialFocusSelector?: string;
  className?: string;
}

/**
 * Accessible dialog shell used by the credential and settings forms.
 *
 * Handles initial focus, Escape, a Tab focus loop, scrim dismissal, and
 * restoring focus to the trigger when it closes.
 */
export default function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  initialFocusSelector,
  className,
}: ModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;

    returnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const dialog = dialogRef.current;
    const target =
      (initialFocusSelector
        ? dialog?.querySelector<HTMLElement>(initialFocusSelector)
        : null) ??
      dialog?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);

    const focusTimer = window.setTimeout(() => target?.focus(), 0);

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab" || !dialog) return;

      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((element) => element.offsetParent !== null);

      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleKeyDown);

      const previous = returnFocusRef.current;
      if (previous && document.contains(previous)) {
        previous.focus();
      }
    };
  }, [open, initialFocusSelector]);

  if (!open) return null;

  return createPortal(
    <div
      className="m-scrim"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className={className ? `m-dialog ${className}` : "m-dialog"}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="dialog-title">
          <h2 id={titleId}>{title}</h2>
          <button
            type="button"
            className="m-iconbtn dialog-close"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M18.3 5.71 12 12.01l-6.3-6.3-1.41 1.41 6.3 6.3-6.3 6.3 1.41 1.41 6.3-6.3 6.3 6.3 1.41-1.41-6.3-6.3 6.3-6.3-1.41-1.41Z" />
            </svg>
          </button>
        </div>

        <div className="dialog-content">{children}</div>

        {footer ? <div className="dialog-actions">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
