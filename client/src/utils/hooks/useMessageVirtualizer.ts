import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { resolveMessageListUpdate, type MessageScrollSnapshot } from '@utils/messageVirtualization';

type MessageVirtualizerOptions<T> = {
  items: T[];
  getKey: (item: T) => string;
  estimateSize?: number;
  overscan?: number;
};

export function useMessageVirtualizer<T>({
  items,
  getKey,
  estimateSize = 96,
  overscan = 6,
}: MessageVirtualizerOptions<T>) {
  const parentRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);
  const snapshotRef = useRef<MessageScrollSnapshot | null>(null);
  const keys = useMemo(() => items.map(getKey), [getKey, items]);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    getItemKey: (index) => keys[index] ?? index,
    overscan,
  });

  const captureSnapshot = useCallback((): MessageScrollSnapshot | null => {
    const element = parentRef.current;
    if (!element) return null;
    const scrollTop = element.scrollTop;
    // React's scroll handler can run before TanStack updates its rendered range.
    // The full measurement cache already contains the row at the new offset.
    const anchor = virtualizer.getVirtualItemForOffset(scrollTop);
    return {
      firstKey: keys[0],
      lastKey: keys.at(-1),
      anchorKey: anchor ? keys[anchor.index] : undefined,
      offsetWithinAnchor: anchor ? scrollTop - anchor.start : 0,
      nearBottom: element.scrollHeight - scrollTop - element.clientHeight < 80,
    };
  }, [keys, virtualizer]);

  const onScroll = useCallback(() => {
    snapshotRef.current = captureSnapshot();
  }, [captureSnapshot]);

  useLayoutEffect(() => {
    if (items.length === 0 || !parentRef.current) return;
    const previous = snapshotRef.current;

    if (!initializedRef.current) {
      initializedRef.current = true;
      virtualizer.scrollToIndex(items.length - 1, { align: 'end' });
    } else if (previous) {
      const update = resolveMessageListUpdate(previous, keys[0], keys.at(-1));

      if (update === 'follow-end') {
        virtualizer.scrollToIndex(items.length - 1, { align: 'end' });
      } else if (update === 'preserve-anchor') {
        const anchorIndex = keys.indexOf(previous.anchorKey!);
        if (anchorIndex >= 0) {
          virtualizer.scrollToIndex(anchorIndex, { align: 'start' });
          parentRef.current.scrollTop += previous.offsetWithinAnchor;
        }
      }
    }

    snapshotRef.current = captureSnapshot();
  }, [captureSnapshot, items.length, keys, virtualizer]);

  const scrollToIndex = useCallback((index: number) => {
    if (index < 0 || index >= items.length) return;
    virtualizer.scrollToIndex(index, { align: 'center' });
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      virtualizer.scrollToIndex(index, { align: 'center' });
      snapshotRef.current = captureSnapshot();
    }));
  }, [captureSnapshot, items.length, virtualizer]);

  return {
    parentRef,
    measureElement: virtualizer.measureElement,
    onScroll,
    scrollToIndex,
    totalSize: virtualizer.getTotalSize(),
    virtualItems: virtualizer.getVirtualItems(),
  };
}
