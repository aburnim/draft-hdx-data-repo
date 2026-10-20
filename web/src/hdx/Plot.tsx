import { useEffect, useRef } from "react";
import Plotly from "plotly.js-dist-min";

// A thin Plotly host: react() on every data/layout change, events re-bound through refs so
// handler identity never forces a redraw. Shared look: Plex fonts, light grid, no logo.

const BASE_LAYOUT: Partial<Plotly.Layout> = {
  font: { family: '"IBM Plex Sans", system-ui, sans-serif', size: 11, color: "#3d414f" },
  margin: { l: 52, r: 12, t: 8, b: 40 },
  paper_bgcolor: "rgba(0,0,0,0)",
  plot_bgcolor: "rgba(0,0,0,0)",
  hoverlabel: { font: { family: '"IBM Plex Mono", monospace', size: 11 } },
  legend: { orientation: "h", y: -0.22, x: 0, font: { size: 10.5 } },
};

type PointHandler = (e: Plotly.PlotMouseEvent) => void;

export default function Plot({
  data,
  layout,
  height = 280,
  onHover,
  onUnhover,
  onClick,
}: {
  data: Partial<Plotly.Data>[];
  layout?: Partial<Plotly.Layout>;
  height?: number;
  onHover?: PointHandler;
  onUnhover?: () => void;
  onClick?: PointHandler;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const handlers = useRef({ onHover, onUnhover, onClick });
  handlers.current = { onHover, onUnhover, onClick };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const xaxis = { gridcolor: "#eaebf4", zerolinecolor: "#d5d7e4", ...(layout?.xaxis ?? {}) };
    const yaxis = { gridcolor: "#eaebf4", zerolinecolor: "#d5d7e4", ...(layout?.yaxis ?? {}) };
    Plotly.react(el, data as Plotly.Data[], { ...BASE_LAYOUT, ...layout, xaxis, yaxis, height, autosize: true }, {
      displaylogo: false,
      responsive: true,
      modeBarButtonsToRemove: ["select2d", "lasso2d", "autoScale2d"],
    }).then((gd) => {
      const g = gd as Plotly.PlotlyHTMLElement & { removeAllListeners?: (ev: string) => void };
      g.removeAllListeners?.("plotly_hover");
      g.removeAllListeners?.("plotly_unhover");
      g.removeAllListeners?.("plotly_click");
      g.on("plotly_hover", (e) => handlers.current.onHover?.(e));
      g.on("plotly_unhover", () => handlers.current.onUnhover?.());
      g.on("plotly_click", (e) => handlers.current.onClick?.(e));
    });
  }, [data, layout, height]);

  useEffect(() => {
    const el = ref.current;
    return () => {
      if (el) Plotly.purge(el);
    };
  }, []);

  return <div ref={ref} className="w-full" style={{ height }} />;
}
