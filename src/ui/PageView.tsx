import { useState, type CSSProperties, type ReactNode } from "react";

/**
 * Hülle um den Seiteninhalt: bei jedem Seitenwechsel (neue `id`) schiebt sich der neue Inhalt
 * aus der Richtung herein, in der er in der Navigation liegt (`order`: links klein, rechts groß).
 * Der erste Aufruf der App bleibt ohne Animation, damit beim Laden nichts flackert.
 */
export function PageView({ id, order, children }: { id: string; order: number; children: ReactNode }) {
  const [state, setState] = useState({ id, order, dir: 0 });
  if (state.id !== id) setState({ id, order, dir: Math.sign(order - state.order) || 1 });
  return (
    <div
      key={id}
      className={state.dir ? "pageview in" : "pageview"}
      style={{ "--dx": `${state.dir * 24}px` } as CSSProperties}
    >
      {children}
    </div>
  );
}
