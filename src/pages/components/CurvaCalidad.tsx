import React, { useMemo, useState } from "react";
import "../../styles/theme.css";
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

// --- TIPOS Y UTILIDADES ---
type Receptor = "superficial" | "alcantarillado";
type TipoEval = "range" | "max" | "ar";
type Calificacion = "Excelente" | "Sobresaliente" | "Muy Bueno" | "Bueno" | "Aceptable" | "Inaceptable" | "A/R";
interface Regla { id: string; nombre: string; unidad?: string; tipo: TipoEval; min?: number; max?: number; limit?: number; nota?: string; }
interface FilaDato { id: string; E: number | null; S: number | null; }
type CategoriaCarga = "sol_individual" | "le_625" | "de_625_a_3000" | "gt_3000";
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

// --- ESTILOS ---
const mono = "var(--font-mono), monospace";
const palette = {
  text: "var(--color-foreground)", textMain: "var(--color-primary)", textDim: "var(--color-muted-foreground)",
  border: "var(--color-border)", bg: "var(--color-background)", head: "var(--color-card)",
  infoBg: "var(--color-popover)", warnBg: "var(--color-accent)", badBg: "var(--color-destructive)", okBg: "var(--color-accent)"
};
const page: React.CSSProperties = { background: palette.bg, fontFamily: "var(--font-sans)", padding: "16px", borderRadius: 12, border: `1px solid ${palette.border}`, display: 'grid', gap: '24px' };
const header: React.CSSProperties = { borderBottom: `1px solid ${palette.border}`, paddingBottom: 16, marginBottom: 0 };
const kicker: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: palette.textDim, textTransform: "uppercase" };
const title: React.CSSProperties = { fontSize: 24, fontWeight: 800, color: palette.textMain, margin: "4px 0 8px 0" };
const subtitle: React.CSSProperties = { fontSize: 14, color: palette.textDim };
const controlsRow: React.CSSProperties = { display: "flex", gap: 16, flexWrap: "wrap", marginTop: 12 };
const control: React.CSSProperties = { flex: "1 1 200px" };
const label: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 700, color: palette.textDim, marginBottom: 4 };
const input: React.CSSProperties = { width: "100%", padding: "8px 10px", border: `1px solid ${palette.border}`, borderRadius: 8, fontFamily: "inherit", fontSize: 14, color: palette.textMain, background: 'var(--color-input)' };
const select: React.CSSProperties = { ...input, cursor: "pointer" };
const segmented: React.CSSProperties = { display: "flex", borderRadius: 8, overflow: "hidden", border: `1px solid ${palette.border}` };
const segBtn: React.CSSProperties = { flex: 1, padding: "8px 10px", background: 'var(--color-card)', border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, color: palette.textDim };
const segBtnOn: React.CSSProperties = { background: 'var(--color-primary)', color: 'var(--color-primary-foreground)', fontWeight: 800 };
const card: React.CSSProperties = { background: 'var(--color-card)', border: `1px solid ${palette.border}`, borderRadius: 12, padding: 16 };
const cardTitle: React.CSSProperties = { margin: "0 0 12px 0", fontSize: 16, fontWeight: 800, color: palette.textMain };
const h2: React.CSSProperties = { fontSize: 20, fontWeight: 800, color: palette.textMain, margin: "0 0 16px 0", borderBottom: `1px solid ${palette.border}`, paddingBottom: '8px' };
const table: React.CSSProperties = { width: "100%", borderCollapse: "collapse", minWidth: 1000, marginTop: 8 };
const th: React.CSSProperties = { textAlign: "center", padding: "10px 8px", background: 'var(--color-muted)', borderBottom: `1px solid ${palette.border}`, fontSize: 12, fontWeight: 800, color: palette.text, whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "9px 8px", borderBottom: `1px solid ${palette.border}`, fontSize: 14, color: palette.text };
const tdCenter: React.CSSProperties = { ...td, textAlign: "center" };
const tdInput: React.CSSProperties = { ...td, width: 80, padding: 4 };
const inputNum: React.CSSProperties = { ...input, padding: "6px 8px", textAlign: "center", fontSize: 13 };
const tdMono: React.CSSProperties = { ...tdCenter, fontFamily: mono, width: 80, fontSize: 13, color: palette.textDim };
const tdSmall: React.CSSProperties = { ...td, fontSize: 12, width: 150 };
const metricCard: React.CSSProperties = { background: 'var(--color-background)', border: `1px solid ${palette.border}`, borderRadius: 12, padding: 12 };
const metricK: React.CSSProperties = { fontSize: 12, color: palette.textDim };
const metricV: React.CSSProperties = { fontSize: 16, color: palette.textMain, fontWeight: 800, marginTop: 2 };

// --- COMPONENTES VISUALES Y LÓGICA DE CALIFICACIÓN ---
const badge = (kind: "ok" | "bad" | "info"): React.CSSProperties => {
  const map = {
    ok:   { bg: "hsla(142, 71%, 45%, 0.1)", bd: "hsla(142, 71%, 45%, 0.3)", fg: "hsl(142, 71%, 35%)" },
    bad:  { bg: "hsla(0, 84%, 60%, 0.1)", bd: "hsla(0, 84%, 60%, 0.3)", fg: "hsl(0, 84%, 50%)" },
    info: { bg: "hsla(221, 83%, 53%, 0.1)", bd: "hsla(221, 83%, 53%, 0.3)", fg: "hsl(221, 83%, 43%)" },
  }[kind];
  return { display: "inline-block", padding: "4px 10px", borderRadius: 999, border: `1px solid ${map.bd}`, background: map.bg, color: map.fg, fontWeight: 800, fontSize: 12, letterSpacing: .3 };
};

const chip = (cual: Calificacion): React.CSSProperties => {
  const map: Record<Calificacion, { bg: string, fg: string }> = {
    Excelente: { bg: "#10B981", fg: "#fff" }, Sobresaliente: { bg: "#22C55E", fg: "#fff" },
    "Muy Bueno": { bg: "#84CC16", fg: "#fff" }, Bueno: { bg: "#FACC15", fg: "#1F2937" },
    Aceptable: { bg: "#F59E0B", fg: "#fff" }, Inaceptable: { bg: "#EF4444", fg: "#fff" },
    "A/R": { bg: "#9CA3AF", fg: "#fff" }
  };
  const style = map[cual] || map["A/R"];
  return { display: "inline-block", padding: "2px 8px", borderRadius: 4, background: style.bg, color: style.fg, fontWeight: 700, fontSize: 11 };
};

const obtenerCalificacion = (paramId: string, valor: number | null): { cual: Calificacion, emoji: string, desc: string } => { /* ... (sin cambios) */ if (valor === null) return { cual: "Inaceptable", emoji: "❓", desc: "No se proporcionó un valor de salida." }; const escalas: Record<string, { rangos: [number, Calificacion][], desc: Partial<Record<Calificacion, string>> }> = { ph: { rangos: [ [5, "Inaceptable"], [6, "Aceptable"], [7, "Excelente"], [8, "Bueno"], [9, "Aceptable"], [Infinity, "Inaceptable"] ], desc: { Inaceptable: "El pH es demasiado ácido (< 6) o alcalino (> 9), lo que puede ser corrosivo y dañino para la vida acuática.", Aceptable: "El pH está en el límite del rango normativo (6 o 9). Es funcional, pero sin mucho margen.", Excelente: "El pH es 7 (neutro). Un resultado perfecto, ideal para la mayoría de procesos biológicos y la vida acuática.", Bueno: "El pH es 8. Un buen resultado, ligeramente alcalino pero completamente seguro." } }, dqo: { rangos: [[36, "Excelente"], [72, "Sobresaliente"], [108, "Muy Bueno"], [144, "Bueno"], [180, "Aceptable"], [Infinity, "Inaceptable"]], desc: { Excelente: "Remoción excepcional de materia oxidable. Calidad de agua muy alta.", Aceptable: "Cumple con el límite, pero hay margen de mejora.", Inaceptable: "Excede el límite normativo. Indica carga orgánica contaminante." } }, dbo5: { rangos: [[18, "Excelente"], [36, "Sobresaliente"], [54, "Muy Bueno"], [72, "Bueno"], [90, "Aceptable"], [Infinity, "Inaceptable"]], desc: { Excelente: "Impacto mínimo en el oxígeno del cuerpo receptor.", Aceptable: "Dentro del límite, pero indica presencia de materia biodegradable.", Inaceptable: "Agotará el oxígeno del agua receptora."} }, sst: { rangos: [[18, "Excelente"], [36, "Sobresaliente"], [54, "Muy Bueno"], [72, "Bueno"], [90, "Aceptable"], [Infinity, "Inaceptable"]], desc: { Excelente: "Claridad del agua excepcional.", Aceptable: "Puede causar turbidez y sedimentación.", Inaceptable: "Exceso de sólidos que dañan la vida acuática."} }, ssed: { rangos: [[1, "Excelente"], [2, "Sobresaliente"], [3, "Muy Bueno"], [4, "Bueno"], [5, "Aceptable"], [Infinity, "Inaceptable"]], desc: { Excelente: "Rendimiento de clarificación óptimo.", Aceptable: "Previene la formación de lodos.", Inaceptable: "Indica problemas en la fase de decantación."} }, gyaceites: { rangos: [[4, "Excelente"], [8, "Sobresaliente"], [12, "Muy Bueno"], [16, "Bueno"], [20, "Aceptable"], [Infinity, "Inaceptable"]], desc: { Excelente: "Contenido de grasas y aceites insignificante.", Aceptable: "Puede causar problemas en tuberías y ecosistemas.", Inaceptable: "Concentración elevada que puede obstruir sistemas."} }, }; const config = escalas[paramId]; if (!config) return { cual: "A/R", emoji: "ℹ️", desc: "Parámetro de análisis y reporte, sin escala numérica definida." }; let resultado: Calificacion = "Inaceptable"; for (const [limite, calificacion] of config.rangos) { if (valor <= limite) { resultado = calificacion; break; } } const descripcionesComunes: Record<Calificacion, string> = { Sobresaliente: "Un resultado sobresaliente, superando las expectativas de la norma.", "Muy Bueno": "Un muy buen nivel de tratamiento, con alta eficiencia.", Bueno: "Un resultado bueno y fiable, consistentemente dentro de los parámetros.", Excelente: "", Aceptable: "", Inaceptable: "", "A/R": "" }; const descripcion = config.desc[resultado] || descripcionesComunes[resultado] || "Evaluación según la normativa."; const emojiMap: Record<Calificacion, string> = { Excelente: "✅", Sobresaliente: "🟢", "Muy Bueno": "👍", Bueno: "👌", Aceptable: "🆗", Inaceptable: "❌", "A/R": "ℹ️" }; return { cual: resultado, emoji: emojiMap[resultado], desc: descripcion };};

// --- CONSTANTES NORMATIVAS Y LÓGICA DE EVALUACIÓN ---
const tablaARD_Superficial: Record<CategoriaCarga, Record<string, number>> = { sol_individual: { dqo: 180, dbo5: 90, sst: 90, ssed: 5, gyaceites: 20 }, le_625: { dqo: 180, dbo5: 90, sst: 90, ssed: 5, gyaceites: 20 }, de_625_a_3000: { dqo: 180, dbo5: 90, sst: 90, ssed: 5, gyaceites: 20 }, gt_3000: { dqo: 150, dbo5: 70, sst: 70, ssed: 5, gyaceites: 10 }};
const PH_SUP_MIN = 6, PH_SUP_MAX = 9, TEMP_MAX = 40, PH_ALC_MIN = 5, PH_ALC_MAX = 9;
const PARAMS_BASE: Regla[] = [ { id: "ph", nombre: "pH", tipo: "range", min: PH_SUP_MIN, max: PH_SUP_MAX, nota: "Rango normativo" }, { id: "temp", nombre: "Temperatura", unidad: "°C", tipo: "max", limit: TEMP_MAX, nota: "≤ 40 °C (Art. 5)" }, { id: "dqo", nombre: "DQO", unidad: "mg/L O₂", tipo: "max", limit: 180 }, { id: "dbo5", nombre: "DBO₅", unidad: "mg/L O₂", tipo: "max", limit: 90 }, { id: "sst", nombre: "SST", unidad: "mg/L", tipo: "max", limit: 100 }, { id: "ssed", nombre: "Sólidos Sedimentables (SSED)", unidad: "mL/L", tipo: "max", limit: 5 }, { id: "gyaceites", nombre: "Grasas y Aceites", unidad: "mg/L", tipo: "max", limit: 20 }];
function limiteNormativo(paramId: string, receptor: Receptor, cat: CategoriaCarga) { /* ... (sin cambios) */ if (paramId === "ph") { return receptor === "alcantarillado" ? { tipo: "range" as const, min: PH_ALC_MIN, max: PH_ALC_MAX } : { tipo: "range" as const, min: PH_SUP_MIN, max: PH_SUP_MAX }; } if (paramId === "temp") return { tipo: "max" as const, limit: TEMP_MAX }; const base = tablaARD_Superficial[cat]; const baseLimit = base[paramId as keyof typeof base] as number | undefined; if (paramId === "dqo" && typeof baseLimit === "number") { return receptor === "alcantarillado" ? { tipo: "max" as const, limit: Number((1.5 * baseLimit).toFixed(2)) } : { tipo: "max" as const, limit: baseLimit }; } if (typeof baseLimit === "number") return { tipo: "max" as const, limit: baseLimit }; return { tipo: "ar" as const }; }
function evaluarParametro(reglaVista: Regla, receptor: Receptor, cat: CategoriaCarga, E: number | null, S: number | null) { /* ... (sin cambios) */ const e = n(E), s = n(S); const isSingleValue = reglaVista.id === 'ph' || reglaVista.id === 'temp'; const R = !isSingleValue && e !== null && s !== null && e > 0 ? s / e : null; const RP = R !== null ? (1 - R) * 100 : null; const norma = limiteNormativo(reglaVista.id, receptor, cat); let cumple: boolean | null = null; let just: string[] = []; if (norma.tipo === "range") { if (s === null) { cumple = false; just.push("Falta valor de Salida (S)"); } else { const okMin = norma.min === undefined || s >= norma.min!; const okMax = norma.max === undefined || s <= norma.max!; cumple = okMin && okMax; if (!okMin) just.push(`S (${s}) < min (${norma.min})`); if (!okMax) just.push(`S (${s}) > max (${norma.max})`); } } else if (norma.tipo === "max") { if (s === null) { cumple = false; just.push("Falta valor de Salida (S)"); } else if (norma.limit !== undefined) { cumple = s <= norma.limit; if (!cumple) just.push(`S (${s}) > límite (${norma.limit})`); } } else { cumple = null; just.push("Análisis/Reporte, sin límite numérico."); } const initialCalificacion = obtenerCalificacion(reglaVista.id, s); const finalCalificacion = (cumple === false) ? { ...initialCalificacion, cual: "Inaceptable" as Calificacion, emoji: "❌" } : initialCalificacion; return { R, RP, cumple, ...finalCalificacion, obs: just.join("; ") || finalCalificacion.desc, norma }; }

// --- SIMULACIÓN ESTOCÁSTICA Y CURVA DE CALIDAD ---
function mulberry32(seed: number) { let t = seed >>> 0; return function rnd() { t = (t + 0x6D2B79F5) >>> 0; let r = t; r = Math.imul(r ^ (r >>> 15), r | 1); r ^= r + Math.imul(r ^ (r >>> 7), r | 61); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }
function randNorm(rnd: () => number) { const u1 = Math.max(rnd(), 1e-12); const u2 = rnd(); return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); }
function sampleLognormal(mean: number, cv: number, rnd: () => number) { const cvf = Math.max(cv, 0.0001); const sigma2 = Math.log(1 + cvf * cvf); const sigma = Math.sqrt(sigma2); const mu = Math.log(Math.max(mean, 1e-9)) - 0.5 * sigma2; return Math.exp(mu + sigma * randNorm(rnd)); }
function sampleTri(min: number, mode: number, max: number, rnd: () => number) { const a = Math.min(min, mode, max); const c = Math.max(min, mode, max); const b = Math.max(Math.min(mode, c), a); const u = rnd(); const Fm = (b - a) / (c - a); if (u < Fm) return a + Math.sqrt(u * (c - a) * (b - a)); return c - Math.sqrt((1 - u) * (c - a) * (c - b)); }
const percentiles = (arr: number[], ps: number[]) => { const s = [...arr].sort((x, y) => x - y); return ps.map(p => { const idx = (s.length - 1) * p; const i0 = Math.floor(idx), i1 = Math.ceil(idx); if (i0 === i1) return s[i0]; const w = idx - i0; return s[i0] * (1 - w) + s[i1] * w; }); };

interface ParametrosCurva { Qr: number; Cr: number; Qw: number; Lw: number; Cs: number; Kd: number; Kr: number; v: number; distanciaMax: number; }

const calcularCurvaDeOxigeno = (params: ParametrosCurva) => { /* ... (sin cambios) */ const { Qr, Cr, Qw, Lw, Cs, Kd, Kr, v, distanciaMax } = params; if (v <= 0) { return { data: [], error: "La velocidad del río (v) debe ser mayor que cero." }; } const Qm = Qr + Qw; const C0 = (Qr * Cr) / Qm; const L0 = (Qw * Lw) / Qm; const D0 = Cs - C0; const dataPuntos = []; const maxDistancia_m = distanciaMax * 1000; for (let x = 0; x <= maxDistancia_m; x += 1000) { const t_dias = x / (v * 86400); const factorK = Kr - Kd; let Dt; if (Math.abs(factorK) < 1e-6) { Dt = (Kd * L0 * t_dias + D0) * Math.exp(-Kd * t_dias); } else { Dt = (Kd * L0 / factorK) * (Math.exp(-Kd * t_dias) - Math.exp(-Kr * t_dias)) + D0 * Math.exp(-Kr * t_dias); } const Ct = Cs - Dt; dataPuntos.push({ distancia_km: x / 1000, od_mg_l: Ct > 0 ? Ct : 0 }); } return { data: dataPuntos, error: null }; };

export default function CurvaCalidad() {
  const [receptor, setReceptor] = useState<Receptor>("superficial");
  const [categoria, setCategoria] = useState<CategoriaCarga>("sol_individual");
  const [datos, setDatos] = useState<Record<string, FilaDato>>(() => { const seed: Record<string, FilaDato> = {}; for (const p of PARAMS_BASE) seed[p.id] = { id: p.id, E: null, S: null }; return seed; });

  const reglasVista = useMemo<Regla[]>(() => { /* ... (sin cambios) */ return PARAMS_BASE.map((r) => { if (r.id === "ph") { return { ...r, min: receptor === "alcantarillado" ? PH_ALC_MIN : PH_SUP_MIN, max: receptor === "alcantarillado" ? PH_ALC_MAX : PH_SUP_MAX, nota: receptor === "alcantarillado" ? "pH 5–9" : "pH 6–9" }; } if (r.id === "temp") { return { ...r, nota: "≤ 40 °C. Sólo salida (S)." }; } if (r.id === "dqo") { const lim = limiteNormativo("dqo", receptor, categoria).limit; return { ...r, limit: lim, nota: receptor === "alcantarillado" ? "1,5 × tabla superficial" : "Tabla Art. 8" }; } if (["dbo5", "sst", "ssed", "gyaceites"].includes(r.id)) { const lim = limiteNormativo(r.id, receptor, categoria).limit; return { ...r, limit: lim, nota: receptor === "alcantarillado" ? "Misma act. económica" : "Tabla Art. 8" }; } return r; }); }, [receptor, categoria]);

  const onNum = (id: string, campo: "E" | "S", v: string) => {
    const rawVal = parseFloat(v);
    const val = v === "" ? null : (isNaN(rawVal) ? datos[id][campo] : Math.max(0, rawVal));
    setDatos(prev => ({ ...prev, [id]: { ...prev[id], [campo]: val } }));
  };

  const resultados = useMemo(() => { const out: Record<string, ReturnType<typeof evaluarParametro> & { meta: Regla; fila: FilaDato }> = {}; for (const p of reglasVista) { const fila = datos[p.id]; out[p.id] = { ...evaluarParametro(p, receptor, categoria, fila?.E ?? null, fila?.S ?? null), meta: p, fila }; } return out; }, [reglasVista, datos, receptor, categoria]);
  
  // --- Estados y Lógica para Simulación ---
  const [paramSim, setParamSim] = useState<"dbo5" | "dqo" | "sst" | "gyaceites">("dbo5");
  const [nSim, setNSim] = useState(200);
  const [seedSim, setSeedSim] = useState(42);
  const [distE, setDistE] = useState<"logn" | "tri">("logn");
  const [E_mean, setEmean] = useState(300);
  const [E_cv, setEcv] = useState(0.5);
  const [E_min, setEmin] = useState(150);
  const [E_mode, setEmode] = useState(300);
  const [E_max, setEmax] = useState(600);
  const [R_min, setRmin] = useState(30);
  const [R_mode, setRmode] = useState(60);
  const [R_max, setRmax] = useState(85);
  const [riverParams, setRiverParams] = useState<Omit<ParametrosCurva, 'Lw' | 'Qw'>>({ Qr: 10, Cr: 8.5, Cs: 9.2, Kd: 0.35, Kr: 0.65, v: 0.2, distanciaMax: 30 });
  const [Qw_vertimiento, setQw_vertimiento] = useState(0.2);
  const handleRiverParamChange = (param: keyof typeof riverParams, value: string) => { const numValue = parseFloat(value); if (!isNaN(numValue) && numValue >= 0) { setRiverParams(p => ({ ...p, [param]: numValue })); } };
  const handleQwChange = (value: string) => { const numValue = parseFloat(value); if (!isNaN(numValue) && numValue >= 0) { setQw_vertimiento(numValue); } };
    
  // --- Preparación de datos para TODAS las gráficas ---
  const labels = useMemo(() => reglasVista.map((p) => p.nombre), [reglasVista]);

  const dataBar = useMemo(() => {
    const E = reglasVista.map((p) => (datos[p.id]?.E ?? 0));
    const S = reglasVista.map((p) => (datos[p.id]?.S ?? 0));
    return { labels, datasets: [ { label: "Entrada (E)", data: E, backgroundColor: "hsla(205, 90%, 60%, 0.5)", borderColor: "hsl(205, 90%, 60%)" }, { label: "Salida (S)",  data: S, backgroundColor: "hsla(160, 84%, 40%, 0.5)", borderColor: "hsl(160, 84%, 40%)" } ]};
  }, [labels, reglasVista, datos]);

  const dataLine = useMemo(() => {
    const RP = reglasVista.map((p) => {
      if (p.id === 'ph' || p.id === 'temp') return null;
      const rr = resultados[p.id]?.RP;
      return rr != null ? Number(rr.toFixed(2)) : null;
    });
    return { labels, datasets: [{ label: "RP (%)", data: RP, borderColor: "hsl(142, 71%, 45%)", backgroundColor: "hsla(142, 71%, 45%, 0.2)", pointRadius: 4, tension: 0.2 }]};
  }, [labels, reglasVista, resultados]);

  const sim = useMemo(() => {
    const rnd = mulberry32(seedSim);
    const E_arr: number[] = [], S_arr: number[] = [], R_arr: number[] = [];
    for (let i = 0; i < Math.max(1, nSim); i++) {
      const e = distE === "logn"
        ? sampleLognormal(Math.max(1, E_mean), Math.max(0.01, E_cv), rnd)
        : sampleTri(Math.max(0, E_min), Math.max(0, E_mode), Math.max(0, E_max), rnd);
      const rPct = sampleTri(Math.max(0, R_min), Math.max(0, R_mode), Math.max(0, R_max), rnd);
      const r = Math.min(100, Math.max(0, rPct)) / 100;
      const s = e * (1 - r);
      E_arr.push(e); R_arr.push(r); S_arr.push(s);
    }
    const limInfo = limiteNormativo(paramSim, receptor, categoria);
    const limite = limInfo.tipo === "max" ? (limInfo.limit ?? null) : null;
    const p50p90p95 = percentiles(S_arr, [0.50, 0.90, 0.95]);
    const pCumple = (limite !== null) ? (S_arr.filter(x => x <= (limite as number)).length / S_arr.length) * 100 : null;
    const Sdesc = [...S_arr].sort((a, b) => b - a);
    const xExc = Sdesc.map((_, i) => ((i + 1) / Sdesc.length) * 100);
    const yExc = Sdesc;
    return { E: E_arr, S: S_arr, R: R_arr, limite, p50p90p95, pCumple, xExc, yExc };
  }, [nSim, seedSim, distE, E_mean, E_cv, E_min, E_mode, E_max, R_min, R_mode, R_max, paramSim, receptor, categoria]);
  
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
    const labels = bins.map((_, i) => `${(min + i*w).toFixed(0)}–${(min + (i+1)*w).toFixed(0)}`);
    return { labels, data: bins };
  }, [sim]);

  const dataHisto = useMemo(() => ({
    labels: histo.labels,
    datasets: [{ label: "Frecuencia de Salida (S)", data: histo.data, backgroundColor: "hsla(142, 71%, 45%, 0.5)", borderColor: "hsl(142, 71%, 45%)" }],
  }), [histo]);

  const dataExced = useMemo(() => ({
    labels: sim.xExc.map(v => v.toFixed(0) + "%"),
    datasets: [{ label: "Concentración de Salida (S)", data: sim.yExc, borderColor: "hsl(205, 90%, 60%)", backgroundColor: "hsla(205, 90%, 60%, 0.2)", pointRadius: 0, tension: .25, fill: 'origin' }],
  }), [sim]);

  const curvaCalidad = useMemo(() => {
    const Lw_simulado = sim.p50p90p95[2]; 
    if (paramSim !== "dbo5") { return { data: null, Lw: null, mensaje: "Seleccione DBO₅ en la simulación para activar la Curva de Calidad." }; }
    if (!Lw_simulado || !isFinite(Lw_simulado)) { return { data: null, Lw: null, mensaje: "Esperando datos de simulación válidos..." }; }
    const fullParams: ParametrosCurva = { ...riverParams, Qw: Qw_vertimiento, Lw: Lw_simulado };
    const { data: dataPuntos, error } = calcularCurvaDeOxigeno(fullParams);
    if (error) { return { data: null, Lw: Lw_simulado, mensaje: error }; }
    const dataChart = { labels: dataPuntos.map(p => p.distancia_km.toFixed(0) + ' km'), datasets: [{ label: `OD (mg/L) | DBO Vert. (P95) = ${Lw_simulado.toFixed(2)} mg/L`, data: dataPuntos.map(p => p.od_mg_l), borderColor: '#0ea5e9', backgroundColor: "rgba(14, 165, 233, 0.1)", fill: 'origin' as const, tension: 0.3 }] };
    return { data: dataChart, Lw: Lw_simulado, mensaje: `Curva calculada usando DBO P95: ${Lw_simulado.toFixed(2)} mg/L.` };
  }, [sim.p50p90p95, paramSim, riverParams, Qw_vertimiento]);

  return (
    <div style={page}>
      <header style={header}>
        <div style={kicker}>Normativa Colombia – Resolución 631/2015</div>
        <h1 style={title}>Simulador de Calidad del Agua y Curva de OD</h1>
        <p style={subtitle}>Herramienta integral para evaluar el vertimiento y simular su impacto aguas abajo.</p>
        <div style={controlsRow}>
          <div style={control}><label style={label}>Receptor</label><div style={segmented}><button onClick={() => setReceptor("superficial")} style={{ ...segBtn, ...(receptor === "superficial" ? segBtnOn : {}) }}>Cuerpo superficial</button><button onClick={() => setReceptor("alcantarillado")} style={{ ...segBtn, ...(receptor === "alcantarillado" ? segBtnOn : {}) }}>Alcantarillado</button></div></div>
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

      <section>
        <h2 style={{...h2, border: 'none', margin: 0}}>1. Evaluación Determinística (Normativa)</h2>
        <div style={{ overflowX: "auto" }}>
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>#</th><th style={th}>Parámetro</th><th style={th}>Límite</th><th style={th}>Entrada (E)</th><th style={th}>Salida (S)</th><th style={th}>RP (%)</th><th style={th}>Cumple</th><th style={th}>Calificación</th><th style={th}>Observaciones / Diagnóstico</th>
              </tr>
            </thead>
            <tbody>
              {reglasVista.map((p, i) => { /* ... (renderizado de tabla sin cambios) */ const r = resultados[p.id]; const fila = datos[p.id]; const lim = r.norma; const limTxt = lim.tipo === "range" ? `${lim.min ?? "?"}–${lim.max ?? "?"}` : lim.tipo === "max" ? `≤ ${lim.limit ?? "—"}` : "A/R"; const isSingleValue = p.id === 'ph' || p.id === 'temp'; return ( <tr key={p.id}> <td style={tdCenter}>{i + 1}</td> <td style={{ ...td, fontWeight: 700, color: palette.textMain }}> {r.emoji} {p.nombre} <div style={{fontSize: 12, color: palette.textDim}}>{p.unidad ?? ""}</div> </td> <td style={{ ...tdCenter, fontFamily: mono, color: palette.textDim }}>{limTxt}</td> <td style={tdInput}>{isSingleValue ? <div style={{ textAlign: "center", color: palette.textDim }}>—</div> : <input type="number" step="any" min="0" value={fila.E ?? ""} onChange={(e) => onNum(p.id, "E", e.target.value)} style={inputNum} placeholder="E" />}</td> <td style={tdInput}><input type="number" step="any" min="0" value={fila.S ?? ""} onChange={(e) => onNum(p.id, "S", e.target.value)} style={inputNum} placeholder="S" /></td> <td style={tdMono}><span style={{ color: isSingleValue ? palette.textDim : palette.text }}>{r.RP != null ? r.RP.toFixed(2) : "—"}</span></td> <td style={tdCenter}><span style={badge(r.cumple === null ? "info" : r.cumple ? "ok" : "bad")}>{r.cumple === null ? "N/A" : r.cumple ? "Sí" : "No"}</span></td> <td style={tdCenter}><span style={chip(r.cual)}>{r.cual}</span></td> <td style={{ ...tdSmall, color: r.cumple === false ? "hsl(0, 84%, 50%)" : palette.textDim, fontWeight: r.cumple === false ? 600 : 'normal' }}>{r.obs}</td> </tr> ); })}
            </tbody>
          </table>
        </div>
      </section>
      
      {/* --- INICIO DE LA SECCIÓN DE GRÁFICAS --- */}
      
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: 16 }}>
        <div style={card}>
          <h3 style={cardTitle}>Entrada (E) vs. Salida (S)</h3>
          <Bar data={dataBar} options={{ responsive: true, plugins: { legend: { position: "top" } } }} />
        </div>
        <div style={card}>
          <h3 style={cardTitle}>Eficiencia de Remoción (RP %)</h3>
          <Line data={dataLine} options={{ responsive: true, plugins: { legend: { position: "top" } }, scales: { y: { suggestedMin: 0, suggestedMax: 100, ticks: { callback: (v) => `${v}%` } } } }} />
        </div>
      </section>

      <section>
        <h2 style={h2}>2. Simulación Estocástica (Monte Carlo)</h2>
        <div style={{...card, display: 'grid', gap: '24px'}}>
          
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(240px,1fr))" }}>
            <div>
              <label style={label}>Parámetro a Simular</label>
              <select value={paramSim} onChange={(e) => setParamSim(e.target.value as any)} style={select}>
                <option value="dbo5">DBO₅ (mg/L)</option> <option value="dqo">DQO (mg/L)</option>
                <option value="sst">SST (mg/L)</option> <option value="gyaceites">Grasas y Aceites (mg/L)</option>
              </select>
            </div>
            <div>
              <label style={label}>Número de Muestras (N)</label>
              <input type="number" min={10} max={5000} value={nSim} onChange={(e)=>setNSim(Math.max(10, Number(e.target.value)||200))} style={input} />
            </div>
            <div>
              <label style={label}>Semilla Aleatoria</label>
              <input type="number" value={seedSim} onChange={(e)=>setSeedSim(Number(e.target.value)||0)} style={input} />
            </div>
          </div>

          <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
            <div style={{ ...card, padding: 12, background: 'var(--color-background)' }}>
              <h4 style={{ margin: 0, color: palette.textMain }}>Distribución del Influyente (E)</h4>
              <div style={{...segmented, marginTop: 8}}><button onClick={()=>setDistE("logn")} style={{...segBtn, ...(distE==="logn"?segBtnOn:{})}}>Lognormal</button><button onClick={()=>setDistE("tri")} style={{...segBtn, ...(distE==="tri"?segBtnOn:{})}}>Triangular</button></div>
              {distE === "logn" ? (
                <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr", marginTop: 10 }}><label>Media (mg/L)<input type="number" value={E_mean} onChange={(e)=>setEmean(Number(e.target.value)||1)} style={{ ...input, marginTop: 4 }} /></label><label>CV (adim.)<input type="number" step="any" value={E_cv} onChange={(e)=>setEcv(Number(e.target.value)||0.1)} style={{ ...input, marginTop: 4 }} /></label></div>
              ) : (
                <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr 1fr", marginTop: 10 }}><label>Mín<input type="number" value={E_min} onChange={(e)=>setEmin(Number(e.target.value)||0)} style={{ ...input, marginTop: 4 }} /></label><label>Moda<input type="number" value={E_mode} onChange={(e)=>setEmode(Number(e.target.value)||0)} style={{ ...input, marginTop: 4 }} /></label><label>Máx<input type="number" value={E_max} onChange={(e)=>setEmax(Number(e.target.value)||0)} style={{ ...input, marginTop: 4 }} /></label></div>
              )}
            </div>
            <div style={{ ...card, padding: 12, background: 'var(--color-background)' }}>
              <h4 style={{ margin: 0, color: palette.textMain }}>Eficiencia de Remoción (r, %)</h4>
              <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr 1fr", marginTop: 10 }}><label>r mín (%)<input type="number" value={R_min} onChange={(e)=>setRmin(Number(e.target.value)||0)} style={{ ...input, marginTop: 4 }} /></label><label>r moda (%)<input type="number" value={R_mode} onChange={(e)=>setRmode(Number(e.target.value)||0)} style={{ ...input, marginTop: 4 }} /></label><label>r máx (%)<input type="number" value={R_max} onChange={(e)=>setRmax(Number(e.target.value)||0)} style={{ ...input, marginTop: 4 }} /></label></div>
            </div>
          </div>

          <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(200px,1fr))" }}>
            <div style={metricCard}><div style={metricK}>Límite Normativo</div><div style={metricV}>{sim.limite != null ? `${sim.limite.toFixed(0)} mg/L` : "N/A"}</div></div>
            <div style={metricCard}><div style={metricK}>Prob. de Cumplimiento</div><div style={metricV}>{sim.pCumple != null ? `${sim.pCumple.toFixed(1)} %` : "N/A"}</div></div>
            <div style={metricCard}><div style={metricK}>Percentil 95 (Salida)</div><div style={metricV}>{sim.p50p90p95[2] ? `${sim.p50p90p95[2].toFixed(2)} mg/L` : '...'}</div></div>
          </div>

          <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))" }}>
            <div style={{...card, background: 'var(--color-background)'}}><h4 style={cardTitle}>Histograma de Salida (S)</h4><Bar data={dataHisto} options={{responsive: true, plugins: { legend: { display: false }}}} /></div>
            <div style={{...card, background: 'var(--color-background)'}}><h4 style={cardTitle}>Curva de Excedencia (S)</h4><Line data={dataExced} options={{responsive: true, plugins: { legend: { display: false } }, scales: {x: {title: {display: true, text: '% de Tiempo Excedido'}}, y: {title: {display: true, text: 'Concentración (mg/L)'}}}}} /></div>
          </div>
        </div>
      </section>

      <section>
        <h2 style={h2}>3. Curva de Oxígeno Disuelto (Streeter-Phelps)</h2>
        <div style={{...card, display: 'grid', gap: '24px'}}>
          <p style={{...subtitle, margin: 0}}>Simula la concentración de OD aguas abajo del vertimiento, usando el valor <b>P95 de DBO₅</b> de la simulación anterior como la <b>DBO del vertimiento ($L_w$)</b>.</p>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
            <div><label style={label}>Caudal Río (Qr, m³/s)</label><input type="number" step="any" value={riverParams.Qr} onChange={(e) => handleRiverParamChange('Qr', e.target.value)} style={input} /></div>
            <div><label style={label}>OD Río (Cr, mg/L)</label><input type="number" step="any" value={riverParams.Cr} onChange={(e) => handleRiverParamChange('Cr', e.target.value)} style={input} /></div>
            <div><label style={label}>OD Saturación (Cs, mg/L)</label><input type="number" step="any" value={riverParams.Cs} onChange={(e) => handleRiverParamChange('Cs', e.target.value)} style={input} /></div>
            <div><label style={label}>Caudal Vert. (Qw, m³/s)</label><input type="number" step="any" value={Qw_vertimiento} onChange={(e) => handleQwChange(e.target.value)} style={input} /></div>
            <div><label style={label}>Kd (1/día)</label><input type="number" step="any" value={riverParams.Kd} onChange={(e) => handleRiverParamChange('Kd', e.target.value)} style={input} /></div>
            <div><label style={label}>Kr (1/día)</label><input type="number" step="any" value={riverParams.Kr} onChange={(e) => handleRiverParamChange('Kr', e.target.value)} style={input} /></div>
            <div><label style={label}>Velocidad (v, m/s)</label><input type="number" step="any" value={riverParams.v} onChange={(e) => handleRiverParamChange('v', e.target.value)} style={input} /></div>
            <div><label style={label}>Distancia Máx (km)</label><input type="number" step="any" value={riverParams.distanciaMax} onChange={(e) => handleRiverParamChange('distanciaMax', e.target.value)} style={input} /></div>
          </div>
          
          <div>
            <h3 style={cardTitle}>Resultado: Curva de Oxígeno Disuelto</h3>
            <p style={{...subtitle, marginTop: '-8px', marginBottom: '16px'}}>{curvaCalidad.mensaje}</p>
            {curvaCalidad.data ? (
              <div style={{height: '350px'}}><Line data={curvaCalidad.data} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "top" } }, scales: { x: { title: { display: true, text: 'Distancia Aguas Abajo (km)' } }, y: { title: { display: true, text: 'Oxígeno Disuelto (mg/L)' }, suggestedMin: 0 } } }} /></div>
            ) : <div style={{height: '350px', display: 'grid', placeContent: 'center', background: 'var(--color-muted)', borderRadius: '8px', color: 'var(--color-muted-foreground)'}}>Gráfica no disponible. Verifique los parámetros.</div>}
          </div>
        </div>
      </section>
      
    </div>
  );
}