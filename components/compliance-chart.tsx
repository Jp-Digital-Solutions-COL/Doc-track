"use client";

import { useState } from "react";

type Point = { date: string; pct: number };

const WIDTH = 560;
const HEIGHT = 220;
const PAD_LEFT = 34;
const PAD_RIGHT = 12;
const PAD_TOP = 12;
const PAD_BOTTOM = 28;
const TARGET_PCT = 90;

function scaleX(i: number, count: number) {
  if (count <= 1) return PAD_LEFT;
  return PAD_LEFT + (i / (count - 1)) * (WIDTH - PAD_LEFT - PAD_RIGHT);
}

function scaleY(pct: number) {
  const usable = HEIGHT - PAD_TOP - PAD_BOTTOM;
  return PAD_TOP + usable - (pct / 100) * usable;
}

export function ComplianceChart({ data }: { data: Point[] }) {
  const [hover, setHover] = useState<number | null>(null);

  if (data.length === 0) {
    return (
      <p className="py-16 text-center text-sm text-muted-foreground">
        Todavía no hay historial — el primer punto aparece después de la próxima corrida diaria.
      </p>
    );
  }

  const linePath = data.map((d, i) => `${i === 0 ? "M" : "L"} ${scaleX(i, data.length)} ${scaleY(d.pct)}`).join(" ");
  const targetY = scaleY(TARGET_PCT);
  const gridPcts = [0, 25, 50, 75, 100];

  return (
    <div>
      <div className="mb-2 flex items-center gap-4 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full bg-primary" /> Cumplimiento (%)
        </span>
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <span className="h-0.5 w-4 rounded-full border-t-2 border-dashed border-muted-foreground" /> Meta ({TARGET_PCT}%)
        </span>
      </div>

      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full overflow-visible" role="img" aria-label="Cumplimiento en el tiempo">
        {gridPcts.map((p) => (
          <g key={p}>
            <line
              x1={PAD_LEFT}
              x2={WIDTH - PAD_RIGHT}
              y1={scaleY(p)}
              y2={scaleY(p)}
              stroke="var(--border)"
              strokeWidth={1}
            />
            <text x={PAD_LEFT - 8} y={scaleY(p)} textAnchor="end" dominantBaseline="middle" className="fill-muted-foreground text-[9px]">
              {p}%
            </text>
          </g>
        ))}

        <line
          x1={PAD_LEFT}
          x2={WIDTH - PAD_RIGHT}
          y1={targetY}
          y2={targetY}
          stroke="var(--muted-foreground)"
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />

        <path d={linePath} fill="none" stroke="var(--primary)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

        {data.map((d, i) => (
          <g key={d.date}>
            {/* zona de hover invisible, más grande que el punto visible */}
            <rect
              x={scaleX(i, data.length) - (WIDTH / data.length) / 2}
              y={PAD_TOP}
              width={WIDTH / data.length}
              height={HEIGHT - PAD_TOP - PAD_BOTTOM}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover((h) => (h === i ? null : h))}
            />
            <circle
              cx={scaleX(i, data.length)}
              cy={scaleY(d.pct)}
              r={hover === i ? 5 : 3}
              fill="var(--primary)"
              className="transition-all"
            />
            <text
              x={scaleX(i, data.length)}
              y={HEIGHT - PAD_BOTTOM + 14}
              textAnchor="middle"
              className="fill-muted-foreground text-[9px]"
            >
              {new Date(`${d.date}T00:00:00Z`).toLocaleDateString("es-CO", { month: "short" })}
            </text>
          </g>
        ))}
      </svg>

      {hover !== null ? (
        <div className="mt-1 text-xs text-muted-foreground">
          {new Date(`${data[hover].date}T00:00:00Z`).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" })}
          {" — "}
          <span className="font-medium text-foreground">{data[hover].pct}% de cumplimiento</span>
        </div>
      ) : null}
    </div>
  );
}
