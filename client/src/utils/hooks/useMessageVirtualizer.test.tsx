// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMessageVirtualizer } from './useMessageVirtualizer';

const keyFor = (item: number) => String(item);
function History({ items, target, variableHeight = false }: { items: number[]; target?: number; variableHeight?: boolean }) {
  const list = useMessageVirtualizer({ items, getKey: keyFor });
  return <>
    <button onClick={() => list.scrollToIndex(items.indexOf(target ?? -1))}>Jump</button>
    <div ref={list.parentRef} data-testid="viewport" data-total={list.totalSize} onScroll={list.onScroll}>
      {list.virtualItems.map(row => <div key={row.key} data-index={row.index} data-key={row.key}
        data-start={row.start} data-size={row.size} data-height={variableHeight ? (Number(row.key) % 3 === 0 ? 168 : 72) : 96}
        ref={list.measureElement}>
        Message {items[row.index]}
      </div>)}
    </div>
  </>;
}
const range = (first: number, last: number) => Array.from({ length: last - first + 1 }, (_, i) => i + first);

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return this.hasAttribute('data-index') ? Number(this.getAttribute('data-height')) : 600;
  });
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(800);
  vi.spyOn(Element.prototype, 'clientHeight', 'get').mockReturnValue(600);
  vi.spyOn(Element.prototype, 'scrollHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return Number(this.getAttribute('data-total') ?? 0);
  });
  HTMLElement.prototype.scrollTo = function (options?: ScrollToOptions | number, y?: number) {
    this.scrollTop = typeof options === 'number' ? y ?? options : options?.top ?? this.scrollTop;
  };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('real TanStack virtualizer with simulated DOM dimensions', () => {
  it('follows the bottom at 499 → 500 → 501 and keeps a bounded rendered range', () => {
    const view = render(<History items={range(1, 499)} />);
    const viewport = view.getByTestId('viewport');
    fireEvent.scroll(viewport);
    view.rerender(<History items={range(1, 500)} />);
    fireEvent.scroll(viewport);
    expect(viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight).toBeLessThan(2);
    view.rerender(<History items={range(2, 501)} />);
    fireEvent.scroll(viewport);
    expect(viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight).toBeLessThan(2);
    expect(view.getByText('Message 501')).toBeDefined();
    expect(viewport.children.length).toBeLessThan(40);
  });

  it('keeps the archive anchor while the capped window shifts and older history is prepended', () => {
    const view = render(<History items={range(1, 500)} />);
    const viewport = view.getByTestId('viewport');
    viewport.scrollTop = 200 * 96 + 10;
    fireEvent.scroll(viewport);
    view.rerender(<History items={range(2, 501)} />);
    expect(viewport.scrollTop).toBe(199 * 96 + 10);
    fireEvent.scroll(viewport);
    view.rerender(<History items={range(1, 500)} />);
    expect(viewport.scrollTop).toBe(200 * 96 + 10);
  });

  it('jumps from the end to an old target after the caller loads its context', async () => {
    const view = render(<History items={range(501, 1000)} />);
    const viewport = view.getByTestId('viewport');
    fireEvent.scroll(viewport);
    view.rerender(<History items={range(1, 50)} target={10} />);
    fireEvent.click(view.getByText('Jump'));
    await act(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    fireEvent.scroll(viewport);
    expect(view.getByText('Message 10')).toBeDefined();
    expect(viewport.scrollTop).toBeLessThan(10 * 96);
  });

  it('preserves the visible row with measured messages of different heights', () => {
    const view = render(<History items={range(1, 500)} variableHeight />);
    const viewport = view.getByTestId('viewport');
    viewport.scrollTop = 200 * 96 + 10;
    fireEvent.scroll(viewport);
    fireEvent.scroll(viewport);
    const anchor = [...viewport.children].find(row => Number(row.getAttribute('data-start')) <= viewport.scrollTop
      && Number(row.getAttribute('data-start')) + Number(row.getAttribute('data-size')) > viewport.scrollTop)!;
    const key = anchor.getAttribute('data-key');
    const offset = viewport.scrollTop - Number(anchor.getAttribute('data-start'));
    view.rerender(<History items={range(2, 501)} variableHeight />);
    fireEvent.scroll(viewport);
    const same = [...viewport.children].find(row => row.getAttribute('data-key') === key)!;
    expect(same).toBeDefined();
    expect(viewport.scrollTop - Number(same.getAttribute('data-start'))).toBeCloseTo(offset);
  });
});
