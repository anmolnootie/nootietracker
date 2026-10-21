import { useEffect, useRef, useState } from 'react';

const TERMINAL_STATUSES = ['COMPLETED', 'COMPLETED_WITH_EXCEPTIONS', 'FAILED', 'CANCELLED'];

/**
 * Polls a background import batch (GRN/Invoice/PRN/DN/Daily Dispatch
 * Report/Sheets upload - any of them, since they all share the same
 * {status, totalRows, ...} shape) until it reaches a terminal status, so an
 * upload page can show live progress instead of a static "Processing..."
 * button with no feedback. Pass null for batchId to stop polling.
 */
export function useBatchProgress<T extends { status: string }>(
  batchId: string | null,
  getBatch: (id: string) => Promise<T>,
  onSettled?: (batch: T) => void,
  intervalMs = 1500,
): T | null {
  const [batch, setBatch] = useState<T | null>(null);
  const getBatchRef = useRef(getBatch);
  getBatchRef.current = getBatch;
  const onSettledRef = useRef(onSettled);
  onSettledRef.current = onSettled;

  useEffect(() => {
    if (!batchId) {
      setBatch(null);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const poll = async () => {
      try {
        const b = await getBatchRef.current(batchId);
        if (cancelled) return;
        setBatch(b);
        if (TERMINAL_STATUSES.includes(b.status)) {
          if (timer) clearInterval(timer);
          onSettledRef.current?.(b);
        }
      } catch {
        // Transient fetch error - keep polling, the next tick will usually recover.
      }
    };

    poll();
    timer = setInterval(poll, intervalMs);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId, intervalMs]);

  return batch;
}
