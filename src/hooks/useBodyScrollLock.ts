import { useEffect } from "react";

/**
 * Locks body scroll when `locked` is true.
 * Prevents background scrolling while a modal/popup is open,
 * while allowing the modal content itself to scroll.
 *
 * Uses a reference-counted approach so nested modals work correctly
 * (e.g., a popup inside another popup).
 */
let lockCount = 0;
let originalOverflow = "";
let originalPaddingRight = "";

function acquireLock() {
  if (lockCount === 0) {
    originalOverflow = document.body.style.overflow;
    originalPaddingRight = document.body.style.paddingRight;
    // Calculate scrollbar width to prevent layout shift
    const scrollbarWidth =
      window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
  }
  lockCount++;
}

function releaseLock() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) {
    document.body.style.overflow = originalOverflow;
    document.body.style.paddingRight = originalPaddingRight;
    originalOverflow = "";
    originalPaddingRight = "";
  }
}

export function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (locked) {
      acquireLock();
      return releaseLock;
    }
  }, [locked]);
}
