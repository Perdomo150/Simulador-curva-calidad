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

/** ========= Tipos ========= */
type Receptor = "superficial" | "alcantarillado";
type TipoEval = "range" | "max" | "ar"; // rango, máximo absoluto, análisis/reporte

interface Regla {
  id: string;
  nombre: string;
  unidad?: string;
  tipo: TipoEval;
  min?: number;      // para "range"
  max?: number;      // para "range"
  limit?: number;    // para "max"
  nota?: string;     // ayuda visual
}

interface FilaDato {
  id: string;
  E: number | null;  // Entrada
  S: number | null;  // Salida
}

type CategoriaCarga = "sol_individual" | "le_625" | "de_625_a_3000" | "gt_3000";

/** ========= Utilidades ========= */
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** ========= Tablas (631/2015) – Art. 8 (ARD a superficiales) ========= */
const tablaARD_Superficial: Record<CategoriaCarga, Record<string, number>> = {
  sol_individual: { dqo: 200, dbo5: 90, sst: 100, ssed: 5, gyaceites: 20 },
  le_625:         { dqo: 180, dbo5: 90, sst: 90,  ssed: 5, gyaceites: 20 },
  de_625_a_3000:  { dqo: 180, dbo5: 90, sst: 90,  ssed: 5, gyaceites: 20 },
  gt_3000:        { dqo: 150, dbo5: 70, sst: 70,  ssed: 5, gyaceites: 10 },
};

/** pH (Art. 8) y Temperatura (Art. 5) */
const PH_SUP_MIN = 6, PH_SUP_MAX = 9;
const TEMP_MAX = 40; // °C

/** Alcantarillado (Art. 16) */
const PH_ALC_MIN = 5, PH_ALC_MAX = 9;

/** ========= Catálogo base ========= */
const PARAMS_BASE: Regla[] = [
  { id: "ph", nombre: "pH", tipo: "range", min: PH_SUP_MIN, max: PH_SUP_MAX, nota: "Rango normativo" },
  { id: "temp", nombre: "Temperatura", unidad: "°C", tipo: "max", limit: TEMP_MAX, nota: "≤ 40 °C (Art. 5)" },
  { id: "dqo", nombre: "DQO", unidad: "mg/L O₂", tipo: "max", limit: 200 },
  { id: "dbo5", nombre: "DBO₅", unidad: "mg/L O₂", tipo: "max", limit: 90 },
  { id: "sst", nombre: "SST", unidad: "mg/L", tipo: "max", limit: 100 },
  { id: "ssed", nombre: "Sólidos Sedimentables (SSED)", unidad: "mL/L", tipo: "max", limit: 5 },
  { id: "gyaceites", nombre: "Grasas y Aceites", unidad: "mg/L", tipo: "max", limit: 20 },
  { id: "ctt", nombre: "Coliformes Termotolerantes", unidad: "NMP/100 mL", tipo: "ar", nota: "A/R (sin tope)" },
];

/** Límite aplicable según receptor/categoría */
function limiteNormativo(paramId: string, receptor: Receptor, cat: CategoriaCarga) {
  if (paramId === "ph") {
    return receptor === "alcantarillado"
      ? { tipo: "range", min: PH_ALC_MIN, max: PH_ALC_MAX }
      : { tipo: "range", min: PH_SUP_MIN, max: PH_SUP_MAX };
  }
  if (paramId === "temp") return { tipo: "max", limit: TEMP_MAX };
  if (paramId === "ctt")  return { tipo: "ar" };

  const base = tablaARD_Superficial[cat];
  const baseLimit = base[paramId as keyof typeof base] as number | undefined;

  if (paramId === "dqo" && typeof baseLimit === "number") {
    return receptor === "alcantarillado"
      ? { tipo: "max", limit: Number((1.5 * baseLimit).toFixed(2)) } // Art. 16
      : { tipo: "max", limit: baseLimit };
  }
  if (typeof baseLimit === "number") return { tipo: "max", limit: baseLimit };
  return { tipo: "ar" };
}

/** Evaluación normativa (R/RP solo informativos) */
function evaluarParametro(
  reglaVista: Regla,
  receptor: Receptor,
  cat: CategoriaCarga,
  E: number | null,
  S: number | null
) {
  const e = n(E), s = n(S);
  const R = e !== null && s !== null && e !== 0 ? s / e : null;
  const RP = R !== null ? R * 100 : null;

  const norma = limiteNormativo(reglaVista.id, receptor, cat);

  let cumple: boolean | null = null;
  let just: string[] = [];

  if (norma.tipo === "range") {
    if (s === null) {
      cumple = false;
      just.push("Falta S");
    } else {
      const okMin = norma.min === undefined || s >= norma.min!;
      const okMax = norma.max === undefined || s <= norma.max!;
      cumple = okMin && okMax;
      // <- usar cadenas seguras (sin `<`/`>` literales en template)
      if (!okMin) just.push("S < " + norma.min);
      if (!okMax) just.push("S > " + norma.max);
    }
  } else if (norma.tipo === "max") {
    if (s === null) {
      cumple = false;
      just.push("Falta S");
    } else if (norma.limit !== undefined) {
      cumple = s <= norma.limit;
      // <- también seguro (sin template literal con símbolos)
      if (!cumple) just.push("S > " + norma.limit);
    }
  } else {
    cumple = null;
    just.push("A/R (sin límite numérico)");
  }

  let cual: "ACEPTABLE" | "INSUFICIENTE" | "DEFICIENTE";
  if (cumple === true) {
    cual = "ACEPTABLE";
  } else if (cumple === false) {
    const desv = (() => {
      if (norma.tipo === "max" && norma.limit && s !== null) return (s - norma.limit) / norma.limit;
      if (norma.tipo === "range" && s !== null && norma.max != null && norma.min != null) {
        if (s < norma.min) return (norma.min - s) / Math.max(1, Math.abs(norma.min));
        if (s > norma.max) return (s - norma.max) / Math.max(1, Math.abs(norma.max));
      }
      return 0;
    })();
    cual = desv > 0.2 ? "DEFICIENTE" : "INSUFICIENTE";
  } else {
    cual = "ACEPTABLE"; // A/R
  }

  return { R, RP, cumple, cual, obs: just.join("; "), norma };
}

/** ========= Componente ========= */
export default function CalidadVertimiento() {
  const [receptor, setReceptor] = useState<Receptor>("superficial");
  const [categoria, setCategoria] = useState<CategoriaCarga>("sol_individual");

  const [datos, setDatos] = useState<Record<string, FilaDato>>(() => {
    const seed: Record<string, FilaDato> = {};
    for (const p of PARAMS_BASE) seed[p.id] = { id: p.id, E: null, S: null };
    return seed;
  });

  const reglasVista = useMemo<Regla[]>(() => {
    return PARAMS_BASE.map((r) => {
      if (r.id === "ph") {
        return {
          ...r,
          min: receptor === "alcantarillado" ? PH_ALC_MIN : PH_SUP_MIN,
          max: receptor === "alcantarillado" ? PH_ALC_MAX : PH_SUP_MAX,
          nota: receptor === "alcantarillado" ? "pH 5–9 (Art. 16)" : "pH 6–9 (Art. 8)",
        };
      }
      if (r.id === "dqo") {
        const lim = limiteNormativo("dqo", receptor, categoria).limit;
        return { ...r, limit: lim, nota: receptor === "alcantarillado" ? "DQO = 1,5 × tabla superficial (Art. 16)" : "Tabla Art. 8" };
      }
      if (["dbo5", "sst", "ssed", "gyaceites"].includes(r.id)) {
        const lim = limiteNormativo(r.id, receptor, categoria).limit;
        return { ...r, limit: lim, nota: receptor === "alcantarillado" ? "Mis. actividad (Art. 16)" : "Tabla Art. 8" };
      }
      return r;
    });
  }, [receptor, categoria]);

  const resultados = useMemo(() => {
    const out: Record<string, ReturnType<typeof evaluarParametro> & { meta: Regla; fila: FilaDato }> = {};
    for (const p of reglasVista) {
      const fila = datos[p.id];
      out[p.id] = { ...evaluarParametro(p, receptor, categoria, fila?.E ?? null, fila?.S ?? null), meta: p, fila };
    }
    return out;
  }, [reglasVista, datos, receptor, categoria]);

  /** Gráficas base (determinísticas con tus inputs) */
  const labels = useMemo(() => reglasVista.map((p) => p.nombre), [reglasVista]);
  const dataBar = useMemo(() => {
    const E = reglasVista.map((p) => (datos[p.id]?.E ?? 0));
    const S = reglasVista.map((p) => (datos[p.id]?.S ?? 0));
    return { labels, datasets: [
      { label: "Entrada (E)", data: E, backgroundColor: "rgba(56, 189, 248, .35)", borderColor: "#38bdf8" },
      { label: "Salida (S)",  data: S, backgroundColor: "rgba(45, 212, 191, .35)", borderColor: "#2dd4bf" },
    ]};
  }, [labels, reglasVista, datos]);

  const dataLine = useMemo(() => {
    const RP = reglasVista.map((p) => {
      const rr = resultados[p.id]?.RP;
      return rr != null ? Number(rr.toFixed(2)) : null;
    });
    return { labels, datasets: [{
      label: "RP (%) = (S/E)*100", data: RP, borderColor: "#22c55e", backgroundColor: "rgba(34,197,94,.18)", pointRadius: 4,
    }]};
  }, [labels, reglasVista, resultados]);

  const onNum = (id: string, campo: "E" | "S", v: string) => {
    setDatos((prev) => ({ ...prev, [id]: { ...prev[id], [campo]: v.trim() === "" ? null : Number(v) } }));
  };

  /** ========= SIMULACIÓN ESTOCÁSTICA (curvas de agua) ========= */

  // RNG con semilla
  function mulberry32(seed: number) {
    return function() {
      let t = (seed += 0x6D2B79F5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // Normal por Box–Muller
  function randNorm(rnd: () => number) {
    const u1 = Math.max(rnd(), 1e-12);
    const u2 = rnd();
    const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return z;
  }
  // Lognormal por media y CV
  function sampleLognormal(mean: number, cv: number, rnd: () => number) {
    const cvf = Math.max(cv, 0.0001);
    const sigma2 = Math.log(1 + cvf * cvf);
    const sigma = Math.sqrt(sigma2);
    const mu = Math.log(Math.max(mean, 1e-9)) - 0.5 * sigma2;
    return Math.exp(mu + sigma * randNorm(rnd));
  }
  // Triangular
  function sampleTri(min: number, mode: number, max: number, rnd: () => number) {
    const a = Math.min(min, mode, max);
    const c = Math.max(min, mode, max);
    const b = Math.max(Math.min(mode, c), a);
    const u = rnd();
    const Fm = (b - a) / (c - a);
    if (u < Fm) return a + Math.sqrt(u * (c - a) * (b - a));
    return c - Math.sqrt((1 - u) * (c - a) * (c - b));
  }
  const percentiles = (arr: number[], ps: number[]) => {
    const s = [...arr].sort((x, y) => x - y);
    return ps.map(p => {
      const idx = (s.length - 1) * p;
      const i0 = Math.floor(idx), i1 = Math.ceil(idx);
      if (i0 === i1) return s[i0];
      const w = idx - i0;
      return s[i0] * (1 - w) + s[i1] * w;
    });
  };

  type ParamSim = "dbo5" | "dqo" | "sst" | "gyaceites";
  const [paramSim, setParamSim] = useState<ParamSim>("dbo5");
  const [nSim, setNSim] = useState(200);
  const [seedSim, setSeedSim] = useState(42);

  // Influyente E: modo (lognormal | triangular)
  const [distE, setDistE] = useState<"logn" | "tri">("logn");
  const [E_mean, setEmean] = useState(300);  // mg/L
  const [E_cv, setEcv] = useState(0.5);      // adimensional
  const [E_min, setEmin] = useState(150);
  const [E_mode, setEmode] = useState(300);
  const [E_max, setEmax] = useState(600);

  // Remoción r ~ Triangular (en %)
  const [R_min, setRmin] = useState(30);
  const [R_mode, setRmode] = useState(60);
  const [R_max, setRmax] = useState(85);

  const sim = useMemo(() => {
    const rnd = mulberry32(seedSim);
    const E: number[] = [];
    const S: number[] = [];
    const R: number[] = [];

    for (let i = 0; i < Math.max(1, nSim); i++) {
      const e = distE === "logn"
        ? sampleLognormal(Math.max(1, E_mean), Math.max(0.01, E_cv), rnd)
        : sampleTri(Math.max(0, E_min), Math.max(0, E_mode), Math.max(0, E_max), rnd);
      const rPct = sampleTri(Math.max(0, R_min), Math.max(0, R_mode), Math.max(0, R_max), rnd);
      const r = Math.min(100, Math.max(0, rPct)) / 100;
      const s = e * (1 - r);
      E.push(e);
      R.push(r);
      S.push(s);
    }

    // Límite normativo para el parámetro seleccionado
    const limInfo = limiteNormativo(paramSim, receptor, categoria);
    const limite = limInfo.tipo === "max" ? (limInfo.limit ?? null) : null;

    // Métricas
    const p50p90p95 = percentiles(S, [0.50, 0.90, 0.95]);
    const pCumple = (limite !== null)
      ? (S.filter(x => x <= (limite as number)).length / S.length) * 100
      : null;

    // Curva de excedencia (S desc vs % excedencia)
    const Sdesc = [...S].sort((a, b) => b - a);
    const xExc = Sdesc.map((_, i) => ((i + 1) / Sdesc.length) * 100); // %
    const yExc = Sdesc;

    return { E, S, R, limite, p50p90p95, pCumple, xExc, yExc };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nSim, seedSim, distE, E_mean, E_cv, E_min, E_mode, E_max, R_min, R_mode, R_max, paramSim, receptor, categoria]);

  // Series para gráficos de simulación
  const seriesSimES = useMemo(() => ({
    labels: sim.S.map((_, i) => `#${i + 1}`),
    datasets: [
      { label: "E (sim)", data: sim.E, borderColor: "#38bdf8", backgroundColor: "rgba(56,189,248,.25)", pointRadius: 0, tension: .25 },
      { label: "S (sim)", data: sim.S, borderColor: "#2dd4bf", backgroundColor: "rgba(45,212,191,.25)", pointRadius: 0, tension: .25 },
      ...(sim.limite != null ? [{
        label: "Límite", data: sim.S.map(() => sim.limite as number),
        borderColor: "#ef4444", borderDash: [6, 4], pointRadius: 0,
      }] : [] as any),
    ],
  }), [sim]);

  // Histograma de S
  const histo = useMemo(() => {
    const S = sim.S;
    if (!S.length) return { labels: [], data: [] };
    const k = 12; // bins
    const min = Math.min(...S), max = Math.max(...S);
    const w = (max - min) / k || 1;
    const bins = new Array(k).fill(0);
    for (const v of S) {
      let idx = Math.floor((v - min) / w);
      if (idx >= k) idx = k - 1;
      if (idx < 0) idx = 0;
      bins[idx]++;
    }
    const labels = bins.map((_, i) => `${(min + i*w).toFixed(0)}−${(min + (i+1)*w).toFixed(0)}`);
    return { labels, data: bins };
  }, [sim]);

  const dataHisto = useMemo(() => ({
    labels: histo.labels,
    datasets: [{ label: "Frecuencia S", data: histo.data, backgroundColor: "rgba(34,197,94,.35)", borderColor: "#22c55e" }],
  }), [histo]);

  const dataExced = useMemo(() => ({
    labels: sim.xExc.map(v => v.toFixed(0) + "%"),
    datasets: [{ label: "Curva de excedencia S", data: sim.yExc, borderColor: "#0ea5e9", backgroundColor: "rgba(14,165,233,.18)", pointRadius: 0, tension: .25 }],
  }), [sim]);

  /** ========= Render ========= */
  return (
    <div style={page}>
      {/* Encabezado / Controles superiores */}
      <header style={header}>
        <div style={kicker}>Normativa Colombia – Resolución 631/2015</div>
        <h1 style={title}>Simulador de Curva de Calidad</h1>
        <p style={subtitle}>Evalúa el <b>cumplimiento por límites normativos</b>. R y RP se muestran como referencia.</p>

        <div style={controlsRow}>
          <div style={control}>
            <label style={label}>Receptor</label>
            <div style={segmented}>
              <button onClick={() => setReceptor("superficial")} style={{ ...segBtn, ...(receptor === "superficial" ? segBtnOn : {}) }}>
                Cuerpo superficial
              </button>
              <button onClick={() => setReceptor("alcantarillado")} style={{ ...segBtn, ...(receptor === "alcantarillado" ? segBtnOn : {}) }}>
                Alcantarillado
              </button>
            </div>
          </div>
          <div style={control}>
            <label style={label}>Categoría (Art. 8, ARD)</label>
            <select value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaCarga)} style={select}>
              <option value="sol_individual">Solución individual (vivienda)</option>
              <option value="le_625">Prestador ≤ 625 kg/d DBO₅</option>
              <option value="de_625_a_3000">Prestador 625–3000 kg/d DBO₅</option>
              <option value="gt_3000">Prestador &gt; 3000 kg/d DBO₅</option>
            </select>
          </div>
        </div>
      </header>

      {/* TABLA determinística (como tu Excel) */}
      <section>
        <h2 style={h2}>Tabla de parámetros</h2>
        <div style={{ overflowX: "auto" }}>
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>#</th>
                <th style={th}>Parámetro</th>
                <th style={th}>Unidad</th>
                <th style={th}>Límite normativo</th>
                <th style={th}>Nota</th>
                <th style={th}>E</th>
                <th style={th}>S</th>
                <th style={th}>R = S/E</th>
                <th style={th}>RP (%)</th>
                <th style={th}>Cumple</th>
                <th style={th}>Eval.</th>
                <th style={th}>Obs.</th>
              </tr>
            </thead>
            <tbody>
              {reglasVista.map((p, i) => {
                const r = resultados[p.id];
                const fila = datos[p.id];
                const lim = r.norma;
                const limTxt =
                  lim.tipo === "range" ? `${lim.min ?? "?"} – ${lim.max ?? "?"}`
                  : lim.tipo === "max" ? `≤ ${lim.limit ?? "—"}`
                  : "A/R";

                const bg = r.cual === "ACEPTABLE" ? palette.okBg : r.cual === "INSUFICIENTE" ? palette.warnBg : palette.badBg;

                return (
                  <tr key={p.id} style={{ background: bg }}>
                    <td style={tdCenter}>{i + 1}</td>
                    <td style={{ ...td, fontWeight: 700, color: palette.textMain }}>{p.nombre}</td>
                    <td style={tdCenter}>{p.unidad ?? "—"}</td>
                    <td style={{ ...tdCenter, fontFamily: mono, color: palette.textDim }}>{limTxt}</td>
                    <td style={{ ...tdSmall, color: palette.textDim }}>{p.nota ?? "—"}</td>
                    <td style={tdNum}>
                      <input type="number" step="any" value={fila.E ?? ""} onChange={(e) => setDatos(prev => ({ ...prev, [p.id]: { ...prev[p.id], E: e.target.value === "" ? null : Number(e.target.value) } }))} style={input} placeholder="E" />
                    </td>
                    <td style={tdNum}>
                      <input type="number" step="any" value={fila.S ?? ""} onChange={(e) => setDatos(prev => ({ ...prev, [p.id]: { ...prev[p.id], S: e.target.value === "" ? null : Number(e.target.value) } }))} style={input} placeholder="S" />
                    </td>
                    <td style={tdMono}>{r.R != null ? r.R.toFixed(4) : "—"}</td>
                    <td style={tdMono}>{r.RP != null ? r.RP.toFixed(2) : "—"}</td>
                    <td style={tdCenter}>
                      <span style={badge(r.cumple === null ? "info" : r.cumple ? "ok" : "bad")}>
                        {r.cumple === null ? "—" : r.cumple ? "Sí" : "No"}
                      </span>
                    </td>
                    <td style={tdCenter}><span style={chip(r.cual)}>{r.cual}</span></td>
                    <td style={{ ...tdSmall, color: palette.textDim }}>{r.obs || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p style={footnote}>
          * Temperatura ≤ 40 °C (Art. 5). En alcantarillado, DQO toma la exigencia de superficiales para la actividad (Art. 16). Categorías ARD (Art. 8) integradas.
        </p>
      </section>

      {/* Gráficas determinísticas */}
      <section>
        <div style={card}>
          <h3 style={cardTitle}>Entrada (E) vs Salida (S)</h3>
          <Bar data={dataBar} options={{
            responsive: true,
            plugins: { legend: { position: "top", labels: { color: palette.textMain } } },
            scales: { x: { ticks: { color: palette.textDim } }, y: { ticks: { color: palette.textDim } } },
          }} />
        </div>
      </section>
      <section>
        <div style={card}>
          <h3 style={cardTitle}>Curva RP (%)</h3>
          <Line data={dataLine} options={{
            responsive: true,
            plugins: { legend: { position: "top", labels: { color: palette.textMain } } },
            scales: { x: { ticks: { color: palette.textDim } }, y: { suggestedMin: 0, suggestedMax: 200, ticks: { color: palette.textDim, callback: (v) => `${v}%` } } },
          }} />
        </div>
      </section>

      {/* ========== NUEVA SECCIÓN: SIMULACIÓN ESTOCÁSTICA DE CURVA DE CALIDAD ========== */}
      <section>
        <div style={card}>
          <h3 style={cardTitle}>Simulación estocástica (curva de calidad)</h3>
          <p style={subtitle}>Genera S a partir de E y remoción aleatorias; calcula probabilidad de cumplimiento y curvas.</p>

          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(240px,1fr))", marginBottom: 12 }}>
            <div>
              <label style={label}>Parámetro (tope “max”)</label>
              <select value={paramSim} onChange={(e) => setParamSim(e.target.value as any)} style={select}>
                <option value="dbo5">DBO₅ (mg/L)</option>
                <option value="dqo">DQO (mg/L)</option>
                <option value="sst">SST (mg/L)</option>
                <option value="gyaceites">Grasas y Aceites (mg/L)</option>
              </select>
            </div>
            <div>
              <label style={label}>Muestras (N)</label>
              <input type="number" min={10} max={5000} value={nSim} onChange={(e)=>setNSim(Math.max(10, Number(e.target.value)||200))} style={input} />
            </div>
            <div>
              <label style={label}>Semilla</label>
              <input type="number" value={seedSim} onChange={(e)=>setSeedSim(Number(e.target.value)||0)} style={input} />
            </div>
          </div>

          {/* Influyente E */}
          <div style={{ ...card, padding: 12, marginBottom: 12 }}>
            <h4 style={{ margin: 0, color: palette.textMain }}>Influyente (E)</h4>
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <button onClick={()=>setDistE("logn")} style={{ ...segBtn, ...(distE==="logn"?segBtnOn:{}) }}>Lognormal</button>
              <button onClick={()=>setDistE("tri")}   style={{ ...segBtn, ...(distE==="tri"?segBtnOn:{}) }}>Triangular</button>
            </div>

            {distE === "logn" ? (
              <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(220px,1fr))", marginTop: 10 }}>
                <label>Media (mg/L)
                  <input type="number" value={E_mean} onChange={(e)=>setEmean(Number(e.target.value)||1)} style={{ ...input, marginLeft: 8 }} />
                </label>
                <label>CV (adim., p. ej. 0.5)
                  <input type="number" step="any" value={E_cv} onChange={(e)=>setEcv(Number(e.target.value)||0.1)} style={{ ...input, marginLeft: 8 }} />
                </label>
              </div>
            ) : (
              <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(220px,1fr))", marginTop: 10 }}>
                <label>Mín (mg/L)
                  <input type="number" value={E_min} onChange={(e)=>setEmin(Number(e.target.value)||0)} style={{ ...input, marginLeft: 8 }} />
                </label>
                <label>Moda (mg/L)
                  <input type="number" value={E_mode} onChange={(e)=>setEmode(Number(e.target.value)||0)} style={{ ...input, marginLeft: 8 }} />
                </label>
                <label>Máx (mg/L)
                  <input type="number" value={E_max} onChange={(e)=>setEmax(Number(e.target.value)||0)} style={{ ...input, marginLeft: 8 }} />
                </label>
              </div>
            )}
          </div>

          {/* Remoción */}
          <div style={{ ...card, padding: 12 }}>
            <h4 style={{ margin: 0, color: palette.textMain }}>Remoción del proceso (r, %)</h4>
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(220px,1fr))", marginTop: 10 }}>
              <label>r mín (%)
                <input type="number" value={R_min} onChange={(e)=>setRmin(Number(e.target.value)||0)} style={{ ...input, marginLeft: 8 }} />
              </label>
              <label>r moda (%)
                <input type="number" value={R_mode} onChange={(e)=>setRmode(Number(e.target.value)||0)} style={{ ...input, marginLeft: 8 }} />
              </label>
              <label>r máx (%)
                <input type="number" value={R_max} onChange={(e)=>setRmax(Number(e.target.value)||0)} style={{ ...input, marginLeft: 8 }} />
              </label>
            </div>
          </div>

          {/* Métricas */}
          <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(220px,1fr))", marginTop: 12 }}>
            <div style={metricCard}>
              <div style={metricK}>Límite</div>
              <div style={metricV}>{sim.limite != null ? `${sim.limite.toFixed(0)} mg/L` : "— (no aplica)"}</div>
            </div>
            <div style={metricCard}>
              <div style={metricK}>P(cumplimiento)</div>
              <div style={metricV}>{sim.pCumple != null ? `${sim.pCumple.toFixed(1)} %` : "—"}</div>
            </div>
            <div style={metricCard}>
              <div style={metricK}>P50 / P90 / P95 (S)</div>
              <div style={metricV}>
                {`${sim.p50p90p95[0].toFixed(0)} / ${sim.p50p90p95[1].toFixed(0)} / ${sim.p50p90p95[2].toFixed(0)} mg/L`}
              </div>
            </div>
          </div>

          {/* Gráficos de la simulación */}
          <div style={{ display: "grid", gap: 16, marginTop: 12 }}>
            <div style={card}>
              <h4 style={cardTitle}>Serie simulada E y S</h4>
              <Line data={seriesSimES} options={{
                responsive: true,
                plugins: { legend: { position: "top", labels: { color: palette.textMain } } },
                scales: { x: { ticks: { color: palette.textDim } }, y: { ticks: { color: palette.textDim } } },
              }} />
            </div>

            <div style={card}>
              <h4 style={cardTitle}>Histograma de S</h4>
              <Bar data={dataHisto} options={{
                responsive: true,
                plugins: { legend: { position: "top", labels: { color: palette.textMain } } },
                scales: { x: { ticks: { color: palette.textDim } }, y: { ticks: { color: palette.textDim } } },
              }} />
            </div>

            <div style={card}>
              <h4 style={cardTitle}>Curva de excedencia (S)</h4>
              <Line data={dataExced} options={{
                responsive: true,
                plugins: { legend: { position: "top", labels: { color: palette.textMain } } },
                scales: { x: { ticks: { color: palette.textDim } }, y: { ticks: { color: palette.textDim } } },
              }} />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

/** ========= Estilos (tonos suaves acuosos) ========= */
const mono = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
const palette = {
  bgTop:   "rgba(224, 242, 254, 0.9)",
  bgBase:  "#ffffff",
  gradA:   "rgba(14,165,233,.16)",
  gradB:   "rgba(20,184,166,.14)",
  border:  "#DCEAF7",
  cardBg:  "#ffffff",
  textMain:"#0F172A",
  textDim: "#475569",
  ok:      "#10b981",
  okBg:    "#EBFAF6",
  warn:    "#f59e0b",
  warnBg:  "#FFF7E6",
  bad:     "#ef4444",
  badBg:   "#FDECEE",
  info:    "#38bdf8",
  infoBg:  "#EAF7FE",
};

const page: React.CSSProperties = {
  display: "grid", gap: 24, padding: 16,
  background: `linear-gradient(180deg, ${palette.bgTop} 0%, ${palette.bgBase} 60%)`,
  minHeight: "100vh",
};
const header: React.CSSProperties = {
  background: `linear-gradient(135deg, ${palette.gradA} 0%, ${palette.gradB} 100%)`,
  border: `1px solid ${palette.border}`, borderRadius: 16, padding: 16,
};
const kicker: React.CSSProperties = { fontSize: 12, letterSpacing: 1, color: palette.textDim, textTransform: "uppercase" };
const title: React.CSSProperties = { margin: "2px 0 0 0", fontSize: 22, fontWeight: 800, color: palette.textMain };
const subtitle: React.CSSProperties = { marginTop: 6, color: palette.textDim, fontSize: 14 };
const controlsRow: React.CSSProperties = { marginTop: 12, display: "flex", flexWrap: "wrap", gap: 12 };
const control: React.CSSProperties = { display: "grid", gap: 6 };
const label: React.CSSProperties = { fontSize: 13, color: palette.textMain, fontWeight: 600 };
const segmented: React.CSSProperties = { display: "inline-flex", background: palette.bgBase, borderRadius: 999, padding: 4, border: `1px solid ${palette.border}` };
const segBtn: React.CSSProperties = { border: "none", background: "transparent", padding: "6px 12px", borderRadius: 999, cursor: "pointer", fontSize: 13, fontWeight: 600, color: palette.textDim };
const segBtnOn: React.CSSProperties = { background: "#ffffff", boxShadow: "0 1px 2px rgba(0,0,0,0.06)", color: palette.textMain };
const select: React.CSSProperties = { border: `1px solid ${palette.border}`, borderRadius: 10, padding: "6px 10px", fontSize: 14, background: "#ffffff", color: palette.textMain };

const h2: React.CSSProperties = { margin: "6px 0 8px", fontSize: 18, fontWeight: 800, color: palette.textMain };

const table: React.CSSProperties = { width: "100%", borderCollapse: "collapse", minWidth: 960, borderRadius: 12, overflow: "hidden", boxShadow: "0 8px 24px rgba(15, 23, 42, 0.04)" };
const th: React.CSSProperties = { borderBottom: `1px solid ${palette.border}`, textAlign: "left", padding: "10px 12px", background: "#F0F9FF", fontWeight: 800, whiteSpace: "nowrap", fontSize: 13, color: palette.textMain };
const td: React.CSSProperties = { borderBottom: `1px solid ${palette.border}`, padding: "8px 10px", fontSize: 14, color: palette.textMain, background: "#ffffff" };
const tdCenter: React.CSSProperties = { ...td, textAlign: "center" };
const tdNum: React.CSSProperties = { ...td, textAlign: "right" };
const tdMono: React.CSSProperties = { ...tdNum, fontFamily: mono, color: palette.textDim };
const tdSmall: React.CSSProperties = { ...td, fontSize: 12, color: palette.textDim };
const input: React.CSSProperties = { width: 120, padding: "8px 10px", border: `1px solid ${palette.border}`, borderRadius: 10, fontFamily: "inherit", fontSize: 14, background: "#ffffff", color: palette.textMain, outlineColor: "#38bdf8" };
const footnote: React.CSSProperties = { color: palette.textDim, fontSize: 12, marginTop: 8, background: palette.infoBg, border: `1px solid ${palette.border}`, borderRadius: 10, padding: "8px 10px" };
const card: React.CSSProperties = { background: palette.cardBg, border: `1px solid ${palette.border}`, borderRadius: 14, padding: 16, boxShadow: "0 8px 24px rgba(15, 23, 42, 0.06)" };
const cardTitle: React.CSSProperties = { margin: "0 0 8px 0", fontSize: 14, fontWeight: 800, color: palette.textMain };

// métricas bonitas
const metricCard: React.CSSProperties = { background: "#fff", border: `1px solid ${palette.border}`, borderRadius: 12, padding: 12 };
const metricK: React.CSSProperties = { fontSize: 12, color: palette.textDim };
const metricV: React.CSSProperties = { fontSize: 16, color: palette.textMain, fontWeight: 800, marginTop: 2 };

/** Badges & Chips */
const badge = (kind: "ok" | "bad" | "info"): React.CSSProperties => {
  const map = {
    ok:   { bg: "#ECFDF5", bd: "#A7F3D0", fg: "#065F46" },
    bad:  { bg: "#FEF2F2", bd: "#FECACA", fg: "#991B1B" },
    info: { bg: "#EFF6FF", bd: "#BFDBFE", fg: "#1E3A8A" },
  }[kind];
  return {
    display: "inline-block", padding: "4px 10px", borderRadius: 999,
    border: `1px solid ${map.bd}`, background: map.bg, color: map.fg,
    fontWeight: 800, fontSize: 12, letterSpacing: .3,
  };
};

const chip = (cual: string): React.CSSProperties => {
  const map = {
    "ACEPTABLE":   { bg: "#EBFAF6", bd: "#99E3DD", fg: "#0F766E" },
    "INSUFICIENTE":{ bg: "#FFF7E6", bd: "#FCD34D", fg: "#92400E" },
    "DEFICIENTE":  { bg: "#FDECEE", bd: "#FCA5A5", fg: "#991B1B" },
  }[cual] || { bg: "#EEF2FF", bd: "#C7D2FE", fg: "#3730A3" };
  return {
    display: "inline-block", padding: "4px 10px", borderRadius: 999,
    border: `1px solid ${map.bd}`, background: map.bg, color: map.fg,
    fontWeight: 800, fontSize: 12, letterSpacing: .3,
  };
};
