import { useLayoutEffect, useRef } from "react";

/** Slides one highlight between options instead of snapping it. The highlight is
 *  absolutely positioned in `container` and follows its `[data-pill="on"]` child,
 *  including through resizes and late font loads. No transition on first placement. */
export function useSlidingPill<T extends HTMLElement = HTMLDivElement>(activeKey: unknown) {
  const container = useRef<T>(null);
  const pill = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const box = container.current;
    const mark = pill.current;
    if (!box || !mark) return;
    const place = () => {
      const active = box.querySelector<HTMLElement>('[data-pill="on"]');
      mark.style.opacity = active ? "1" : "0";
      if (!active) return;
      mark.style.width = `${active.offsetWidth}px`;
      mark.style.height = `${active.offsetHeight}px`;
      mark.style.transform = `translate(${active.offsetLeft}px, ${active.offsetTop}px)`;
    };
    place();
    const frame = requestAnimationFrame(() => mark.setAttribute("data-ready", ""));
    const observer = new ResizeObserver(place);
    observer.observe(box);
    void document.fonts?.ready.then(place);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [activeKey]);
  return { container, pill };
}
