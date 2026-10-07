import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

type MessageVirtualizerOptions<T> = {
  items: T[];
  getKey: (item: T) => string;
  estimateSize?: number;
  overscan?: number;
};

type ScrollSnapshot = {
  firstKey: string | undefined;
  lastKey: string | undefined;
  anchorKey: string | undefined;
  offsetWithinAnchor: number;
  nearBottom: boolean;
};

export function useMessageVirtualizer<T>({
  items,
  getKey,
  estimateSize = 96,
  overscan = 6,
}: MessageVirtualizerOptions<T>) {
  const parentRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);
  const snapshotRef = useRef<ScrollSnapshot | null>(null);
  const keys = useMemo(() => items.map(getKey), [getKey, items]);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    getItemKey: (index) => keys[index] ?? index,
    overscan,
  });

  const captureSnapshot = useCallback((): ScrollSnapshot | null => {
    const element = parentRef.current;
    if (!element) return null;
    const scrollTop = element.scrollTop;
    const anchor = virtualizer.getVirtualItems().find(({ end }) => end >= scrollTop);
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
      const prepended = previous.firstKey !== keys[0] && previous.anchorKey !== undefined;
      const appended = previous.lastKey !== keys.at(-1) && previous.firstKey === keys[0];

      if (prepended) {
        const anchorIndex = keys.indexOf(previous.anchorKey!);
        if (anchorIndex >= 0) {
          virtualizer.scrollToIndex(anchorIndex, { align: 'start' });
          parentRef.current.scrollTop += previous.offsetWithinAnchor;
        }
      } else if (appended && previous.nearBottom) {
        virtualizer.scrollToIndex(items.length - 1, { align: 'end' });
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
