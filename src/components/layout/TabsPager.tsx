import { ReactNode, useEffect, useMemo, useRef, useState } from "react";

type TabId = "home" | "insights" | "library" | "profile";

export function TabsPager({
  pages,
  activeId,
  onActiveChange,
}: {
  pages: { id: TabId; node: ReactNode }[];
  activeId: TabId;
  onActiveChange: (id: TabId) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);

  const activeIndex = useMemo(() => {
    const idx = pages.findIndex((p) => p.id === activeId);
    return idx >= 0 ? idx : 0;
  }, [pages, activeId]);

  const [dragging, setDragging] = useState(false);
  const startRef = useRef({ x: 0, y: 0, t: 0 });
  const dxRef = useRef(0);
  const lockRef = useRef<"none" | "horizontal" | "vertical">("none");

  const getWidth = () => containerRef.current?.clientWidth ?? 1;

  // Snap to active index when activeId changes (tap on BottomNav or programmatic)
  useEffect(() => {
    const w = getWidth();
    const x = -activeIndex * w;
    const track = trackRef.current;
    if (!track) return;

    // animate unless currently dragging
    track.style.transition = dragging ? "none" : "transform 260ms cubic-bezier(.2,.8,.2,1)";
    track.style.transform = `translate3d(${x}px,0,0)`;
  }, [activeIndex, dragging]);

  const setTrackX = (x: number, withTransition: boolean) => {
    const track = trackRef.current;
    if (!track) return;
    track.style.transition = withTransition ? "transform 260ms cubic-bezier(.2,.8,.2,1)" : "none";
    track.style.transform = `translate3d(${x}px,0,0)`;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    // Only left click/touch
    if (e.pointerType === "mouse" && e.button !== 0) return;

    setDragging(true);
    lockRef.current = "none";
    dxRef.current = 0;
    startRef.current = { x: e.clientX, y: e.clientY, t: performance.now() };

    // capture pointer so we keep receiving move events
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;

    const dx = e.clientX - startRef.current.x;
    const dy = e.clientY - startRef.current.y;

    // Decide lock once
    if (lockRef.current === "none") {
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
        lockRef.current = Math.abs(dx) > 1.2 * Math.abs(dy) ? "horizontal" : "vertical";
      } else {
        return;
      }
    }

    // If vertical scroll intent, do nothing (let lists scroll)
    if (lockRef.current === "vertical") return;

    dxRef.current = dx;

    const w = getWidth();
    const baseX = -activeIndex * w;
    let x = baseX + dx;

    // Resistance on edges
    const maxLeft = 0;
    const maxRight = -(pages.length - 1) * w;
    if (x > maxLeft) x = maxLeft + (x - maxLeft) * 0.25;
    if (x < maxRight) x = maxRight + (x - maxRight) * 0.25;

    setTrackX(x, false);
    e.preventDefault();
  };

  const onPointerUp = () => {
    if (!dragging) return;

    const w = getWidth();
    const dx = dxRef.current;

    const dt = Math.max(1, performance.now() - startRef.current.t);
    const vx = dx / dt; // px/ms

    // threshold: distance OR velocity
    const distanceThreshold = w * 0.22;
    const velocityThreshold = 0.6; // ~600px/s

    let nextIndex = activeIndex;

    if (lockRef.current === "horizontal") {
      if (dx > distanceThreshold || vx > velocityThreshold) nextIndex = Math.max(0, activeIndex - 1);
      if (dx < -distanceThreshold || vx < -velocityThreshold) nextIndex = Math.min(pages.length - 1, activeIndex + 1);
    }

    setDragging(false);
    lockRef.current = "none";
    dxRef.current = 0;

    // Snap
    const targetId = pages[nextIndex].id;
    onActiveChange(targetId);

    // ensure snap animation immediately even if id is same
    const x = -nextIndex * w;
    setTrackX(x, true);
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full min-h-0 overflow-hidden"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div ref={trackRef} className="h-full min-h-0 flex" style={{ width: `${pages.length * 100}%` }}>
        {pages.map((p) => (
          <div key={p.id} className="h-full min-h-0 w-full shrink-0 overflow-hidden">
            {/* IMPORTANT: on ne scroll PAS ici. La page gère son scroll */}
            {p.node}
          </div>
        ))}
      </div>
    </div>
  );
}

