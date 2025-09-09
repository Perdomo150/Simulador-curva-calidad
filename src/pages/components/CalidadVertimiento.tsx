import React, { useMemo, useState } from "react";
import { Bar, Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement, PointElement, LineElement,
  Title, Tooltip, Legend,
} from "chart.js";

ChartJS.register(
  CategoryScale, LinearScale, BarElement, PointElement, LineElement,
  Title, Tooltip, Legend
);

// ======== Tema de colores ========
const theme = {
  bg: "#0b1220",
  card: "#121a2a",
  border: "#223252",
  text: "#e6eefc",
  sub: "#9fb3d9",
  gradA: "#3b82f6",
  gradB: "#06b6d4",
  ok: "#22c55e",
  warn: "#f59e0b",
  bad: "#ef4444",
  info: "#60a5fa",
};
const mono = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
const font = "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif";

// ======== Modelo de parámetros ========
// direction:
//  - "down": se espera reducción (S <= E)
//  - "up":   se espera aumento (S >= E)
//  - "range": valor dentro de un rango absoluto (min..max)
export type Direccion = "down" | "up" | "range";

interface ReglaParametro {
  id: string;
  nombre: string;
  unidad?: string;
  direction: Direccion;
  min?: number; // para "range"
  max?: number; // para "range"
  limit?: number; // umbral absoluto (ej. "< 20000")
  nota?: string;
}

interface FilaDato {
  id: string;
  E: number | null;
  S: number | null;
}

const PARAMS_BASE: ReglaParametro[] = [
  { id: "coliformes", nombre: "Coliformes Totales", unidad: "NMP/100mL", direction: "down", limit: 20000, nota: "Dato < 20.000" },
  { id: "dbo5",       nombre: "DBO5", unidad: "mg/L", direction: "down", nota: "Se espera reducción" },
  { id: "grasas",     nombre: "Grasas y Aceites", unidad: "mg/L", direction: "down" },
  { id: "sst",        nombre: "Sólidos Suspendidos Totales (SST)", unidad: "mg/L", direction: "down" },
  { id: "st",         nombre: "Sólidos Totales (ST)", unidad: "mg/L", direction: "down" },
  { id: "ph",         nombre: "pH", direction: "range", min: 5, max: 9, nota: "Rango 5 – 9" },
  { id: "od",         nombre: "Oxígeno Disuelto (OD)", unidad: "mg/L", direction: "up", nota: "Se espera aumento" },
];

const numerosSeguros = (v: number | null | undefined) => (typeof v === "number" && !Number.isNaN(v) ? v : null);

// Regla genérica de evaluación tipo Excel
function evaluar(
  regla: ReglaParametro,
  E: number | null,
  S: number | null
) {
  const e = numerosSeguros(E);
  const s = numerosSeguros(S);

  // Razón R y porcentaje RP (si hay E y S)
  const R = e && s ? s / e : null;
  const RP = R !== null ? R * 100 : null;

  // Mensajes y banderas
  let cumple = true;
  const observaciones: string[] = [];

  // Validaciones por tipo
  if (regla.direction === "down") {
    if (e === null || s === null) {
      cumple = false;
      observaciones.push("Falta E o S");
    } else {
      if (!(s <= e)) {
        cumple = false;
        observaciones.push("No hay reducción (S <= E)");
      }
    }
    if (regla.limit !== undefined && s !== null && !(s < regla.limit)) {
      cumple = false;
      observaciones.push(`No cumple límite: S < ${regla.limit}`);
    }
  }

  if (regla.direction === "up") {
    if (e === null || s === null) {
      cumple = false;
      observaciones.push("Falta E o S");
    } else {
      if (!(s >= e)) {
        cumple = false;
        observaciones.push("No hay incremento (S >= E)");
      }
    }
  }

  if (regla.direction === "range") {
    if (s === null) {
      cumple = false;
      observaciones.push("Falta S");
    } else {
      if (regla.min !== undefined && s < regla.min) {
        cumple = false;
        observaciones.push(`S < ${regla.min}`);
      }
      if (regla.max !== undefined && s > regla.max) {
        cumple = false;
        observaciones.push(`S > ${regla.max}`);
      }
    }
  }

  // Etiqueta cualitativa inicial
  let cualitativa: "ACEPTABLE" | "INSUFICIENTE" | "DEFICIENTE" = cumple ? "ACEPTABLE" : "INSUFICIENTE";

  // Si hay RP y es muy desfavorable, marcamos DEFICIENTE como ejemplo
  if (RP !== null && regla.direction === "down" && RP > 100) {
    cualitativa = "DEFICIENTE";
    if (!observaciones.includes("S > E")) observaciones.push("S > E");
  }
  if (RP !== null && regla.direction === "up" && RP < 100) {
    cualitativa = "DEFICIENTE";
    if (!observaciones.includes("S < E")) observaciones.push("S < E");
  }

  return { R, RP, cumple, cualitativa, observaciones };
}

export default function CalidadVertimiento() {
  // Estado editable que simula la tabla del Excel (E/S por parámetro)
  const [parametros, setParametros] = useState<ReglaParametro[]>(PARAMS_BASE);

  const [datos, setDatos] = useState<Record<string, FilaDato>>(() => {
    const seed: Record<string, FilaDato> = {};
    for (const p of PARAMS_BASE) {
      seed[p.id] = { id: p.id, E: null, S: null };
    }
    return seed;
  });

  const resultados = useMemo(() => {
    const r: Record<
      string,
      ReturnType<typeof evaluar> & { meta: ReglaParametro; fila: FilaDato }
    > = {};
    for (const p of parametros) {
      const fila = datos[p.id];
      r[p.id] = { ...evaluar(p, fila?.E ?? null, fila?.S ?? null), meta: p, fila };
    }
    return r;
  }, [parametros, datos]);

  // ======== Gráficas (E vs S y RP%) ========
  const labels = useMemo(() => parametros.map((p) => p.nombre), [parametros]);

  const dataBar = useMemo(() => {
    const E = parametros.map((p) => (datos[p.id]?.E ?? null) ?? 0);
    const S = parametros.map((p) => (datos[p.id]?.S ?? null) ?? 0);
    return {
      labels,
      datasets: [
        { label: "Entrada (E)", data: E, backgroundColor: "rgba(96, 165, 250, 0.6)", borderColor: "#60a5fa" },
        { label: "Salida (S)", data: S, backgroundColor: "rgba(34, 197, 94, 0.6)", borderColor: "#22c55e" },
      ],
    };
  }, [labels, parametros, datos]);

  const dataLine = useMemo(() => {
    const RP = parametros.map((p) => {
      const rr = resultados[p.id]?.RP;
      return rr !== null && rr !== undefined ? Number(rr.toFixed(2)) : null;
    });
    return {
      labels,
      datasets: [
        {
          label: "RP (%) = (S/E)*100",
          data: RP,
          borderColor: "#06b6d4",
          backgroundColor: "rgba(6, 182, 212, 0.25)",
          pointRadius: 4,
        },
      ],
    };
  }, [labels, parametros, resultados]);

  const handleChangeNumero = (id: string, campo: "E" | "S", v: string) => {
    setDatos((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        [campo]: v.trim() === "" ? null : Number(v),
      },
    }));
  };

  const chip = (estado: string) => {
    if (estado === "ACEPTABLE") return { bg: "rgba(34,197,94,.15)", bd: "#22c55e", fg: "#dcfce7" };
    if (estado === "INSUFICIENTE") return { bg: "rgba(245,158,11,.15)", bd: "#f59e0b", fg: "#fef3c7" };
    return { bg: "rgba(239,68,68,.15)", bd: "#ef4444", fg: "#fee2e2" }; // DEFICIENTE
  };

  const colorFila = (i: number) => (i % 2 === 0 ? "rgba(255,255,255,.02)" : "rgba(255,255,255,.05)");

  return (
    <div style={{
      fontFamily: font,
      color: theme.text,
      background: `radial-gradient(1000px 600px at 10% -10%, rgba(59,130,246,.22), transparent),
                   radial-gradient(800px 500px at 100% 0%, rgba(6,182,212,.16), transparent),
                   ${theme.bg}`,
      minHeight: "100vh",
      padding: 16,
    }}>
      {/* Header */}
      <div style={{
        background: `linear-gradient(90deg, ${theme.gradA}, ${theme.gradB})`,
        padding: "16px 20px",
        borderRadius: 14,
        boxShadow: "0 10px 30px rgba(0,0,0,.25)",
        marginBottom: 18,
      }}>
        <div style={{ fontSize: 12, letterSpacing: 2, textTransform: "uppercase", opacity: .95 }}>
          CURVAS DE CALIDAD AMBIENTAL
        </div>
        <div style={{ fontSize: 22, fontWeight: 800 }}>
          Curvas de calidad de un vertimiento
        </div>
        <div style={{ fontSize: 13, color: "#eaf6ff" }}>
          Ingrese E y S. El sistema calcula <b>R</b>, <b>RP</b>, cumplimiento y grafica.
        </div>
      </div>

      {/* Tabla de entrada estilo Excel */}
      <section>
        <div style={{
          background: theme.card,
          border: `1px solid ${theme.border}`,
          borderRadius: 14,
          overflow: "hidden",
          boxShadow: "0 12px 30px rgba(0,0,0,.25)",
        }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "separate",
              borderSpacing: 0,
              minWidth: 980,
            }}
          >
            <thead>
              <tr style={{ background: "rgba(255,255,255,0.05)" }}>
                <th style={th}>#</th>
                <th style={th}>Parámetro</th>
                <th style={th} colSpan={2}>Datos de Entrada y Salida</th>
                <th style={th}>Unidad</th>
                <th style={th}>Regla</th>
                <th style={th}>R = S/E</th>
                <th style={th}>RP (%)</th>
                <th style={th}>Cumple</th>
                <th style={th}>Eval.</th>
                <th style={th}>Obs.</th>
              </tr>
              <tr style={{ background: "rgba(255,255,255,0.03)" }}>
                <th style={th}></th>
                <th style={th}></th>
                <th style={th}>E</th>
                <th style={th}>S</th>
                <th style={th}></th>
                <th style={th}></th>
                <th style={th}></th>
                <th style={th}></th>
                <th style={th}></th>
                <th style={th}></th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {parametros.map((p, idx) => {
                const r = resultados[p.id];
                const fila = datos[p.id];
                const reglaTxt =
                  p.direction === "down"
                    ? `↓ S ≤ E${p.limit ? ` y S < ${p.limit}` : ""}`
                    : p.direction === "up"
                    ? "↑ S ≥ E"
                    : `Rango ${p.min ?? "?"}–${p.max ?? "?"}`;
                const obs = r.observaciones.join("; ");
                const chipCfg = chip(r.cualitativa);

                return (
                  <tr key={p.id} style={{ background: colorFila(idx), transition: "background .2s" }}>
                    <td style={tdCenter}>{idx + 1}</td>
                    <td style={{ ...td, fontWeight: 700 }}>{p.nombre}</td>
                    <td style={tdNum}>
                      <input
                        type="number"
                        step="any"
                        value={fila.E ?? ""}
                        onChange={(e) => handleChangeNumero(p.id, "E", e.target.value)}
                        style={input}
                        placeholder="E"
                      />
                    </td>
                    <td style={tdNum}>
                      <input
                        type="number"
                        step="any"
                        value={fila.S ?? ""}
                        onChange={(e) => handleChangeNumero(p.id, "S", e.target.value)}
                        style={input}
                        placeholder="S"
                      />
                    </td>
                    <td style={{ ...tdCenter, color: theme.sub }}>{p.unidad ?? "—"}</td>
                    <td style={{ ...tdSmall, color: theme.text }}>
                      {reglaTxt}
                      {p.nota ? <div style={{ color: theme.sub, fontSize: 12 }}>{p.nota}</div> : null}
                    </td>
                    <td style={tdNumMono}>
                      {r.R !== null && r.R !== undefined ? r.R.toFixed(4) : "—"}
                    </td>
                    <td style={tdNumMono}>
                      {r.RP !== null && r.RP !== undefined ? r.RP.toFixed(2) : "—"}
                    </td>
                    <td style={tdCenter}>
                      <span style={{
                        display: "inline-block",
                        padding: "3px 8px",
                        borderRadius: 999,
                        border: `1px solid ${r.cumple ? theme.ok : theme.bad}`,
                        background: r.cumple ? "rgba(34,197,94,.15)" : "rgba(239,68,68,.15)",
                        color: r.cumple ? "#dcfce7" : "#fee2e2",
                        fontWeight: 700,
                        fontSize: 12,
                      }}>
                        {r.cumple ? "Sí" : "No"}
                      </span>
                    </td>
                    <td style={{ ...tdCenter }}>
                      <span style={{
                        display: "inline-block",
                        padding: "4px 10px",
                        borderRadius: 999,
                        border: `1px solid ${chipCfg.bd}`,
                        background: chipCfg.bg,
                        color: chipCfg.fg,
                        fontWeight: 800,
                        fontSize: 12,
                        letterSpacing: .3,
                      }}>
                        {r.cualitativa}
                      </span>
                    </td>
                    <td style={{ ...tdSmall, color: theme.sub }}>
                      {obs || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p style={{ color: theme.sub, fontSize: 13, marginTop: 8 }}>
          * Ajustaremos reglas y umbrales exactamente como tu Excel una vez confirmemos celdas/condiciones específicas.
        </p>
      </section>

      {/* Gráfica E vs S */}
      <section>
        <div style={card}>
          <h3 style={cardTitle}>Entrada (E) vs Salida (S)</h3>
          <Bar
            data={dataBar}
            options={{
              responsive: true,
              plugins: {
                legend: { position: "top", labels: { color: theme.text } },
                title: { display: false, text: "" },
              },
              interaction: { mode: "index" as const, intersect: false },
              scales: {
                x: { ticks: { color: theme.sub } },
                y: { ticks: { color: theme.sub } },
              },
            }}
          />
        </div>
      </section>

      {/* Curva RP (%) */}
      <section>
        <div style={card}>
          <h3 style={cardTitle}>Curva de Calidad – RP (%)</h3>
          <Line
            data={dataLine}
            options={{
              responsive: true,
              plugins: {
                legend: { position: "top", labels: { color: theme.text } },
                title: { display: false, text: "" },
                tooltip: { callbacks: { label: (ctx) => `RP: ${ctx.parsed.y ?? "—"} %` } }
              },
              scales: {
                x: { ticks: { color: theme.sub } },
                y: {
                  suggestedMin: 0,
                  suggestedMax: 200,
                  ticks: { color: theme.sub, callback: (v) => `${v}%` }
                }
              }
            }}
          />
        </div>
      </section>
    </div>
  );
}

/* ===== Estilos base tabla e inputs ===== */
const th: React.CSSProperties = {
  textAlign: "center",
  padding: "10px 10px",
  background: "transparent",
  fontWeight: 800,
  fontSize: 12,
  letterSpacing: .6,
  color: theme.sub,
  borderBottom: `1px solid ${theme.border}`,
  whiteSpace: "nowrap",
};

const td: React.CSSProperties = {
  borderBottom: `1px solid ${theme.border}`,
  padding: "10px 10px",
  color: theme.text,
};

const tdCenter: React.CSSProperties = {
  ...td,
  textAlign: "center",
};

const tdNum: React.CSSProperties = {
  ...td,
  textAlign: "right",
};

const tdNumMono: React.CSSProperties = {
  ...tdNum,
  fontFamily: mono,
  fontWeight: 700,
  color: theme.info,
};

const tdSmall: React.CSSProperties = {
  ...td,
  fontSize: 13,
};

const input: React.CSSProperties = {
  width: 120,
  padding: "8px 10px",
  border: `1px solid ${theme.border}`,
  borderRadius: 10,
  fontFamily: font,
  fontSize: 14,
  color: theme.text,
  background: "rgba(255,255,255,.03)",
  outline: "none",
  transition: "border .15s, box-shadow .15s, background .15s",
  boxShadow: "inset 0 1px 2px rgba(0,0,0,.12)",
} as const;

/* Tarjetas para las gráficas */
const card: React.CSSProperties = {
  background: theme.card,
  border: `1px solid ${theme.border}`,
  borderRadius: 14,
  padding: 16,
  boxShadow: "0 12px 30px rgba(0,0,0,.25)",
};

const cardTitle: React.CSSProperties = {
  margin: "0 0 8px 0",
  fontSize: 14,
  fontWeight: 800,
  color: theme.text,
};
