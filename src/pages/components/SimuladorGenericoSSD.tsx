import React, { useMemo, useState } from "react";

/* ========== Utilidades RNG y parsing ========== */
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const parseList = (s: string): number[] =>
  (s.match(/-?\d+[.,]?\d*/g) || [])
    .map((t) => parseFloat(t.replace(",", ".")))
    .filter((x) => Number.isFinite(x));

/* ========== Distribuciones genéricas ========== */
type DistKind = "expo" | "uniform" | "tri" | "const";

interface DistSpec {
  kind: DistKind;
  // expo: mean
  // uniform: a,b
  // tri: min,mode,max
  // const: c
  mean?: number;
  a?: number; b?: number;
  min?: number; mode?: number; max?: number;
  c?: number;
}

const invTri = (u: number, min: number, mode: number, max: number) => {
  const a = Math.min(min, mode, max);
  const c = Math.max(min, mode, max);
  const b = Math.max(Math.min(mode, c), a);
  const Fm = (b - a) / (c - a);
  if (u < Fm) return a + Math.sqrt(u * (c - a) * (b - a));
  return c - Math.sqrt((1 - u) * (c - a) * (c - b));
};

function sampleFromU(u: number, d: DistSpec): number {
  if (d.kind === "expo") {
    const m = Math.max(1e-9, d.mean ?? 1);
    return -m * Math.log(1 - Math.min(Math.max(u, 1e-12), 1 - 1e-12));
  }
  if (d.kind === "uniform") {
    const a = Math.min(d.a ?? 0, d.b ?? 0);
    const b = Math.max(d.a ?? 0, d.b ?? 0);
    return a + (b - a) * u;
  }
  if (d.kind === "tri") {
    return invTri(u, d.min ?? 0, d.mode ?? 0, d.max ?? 0);
  }
  // const
  return Math.max(0, d.c ?? 0);
}

function sample(d: DistSpec, rng: () => number) {
  return sampleFromU(rng(), d);
}

/* ========== Tipos de la simulación ========== */
type Mode = "manualU" | "rng";
type Row = {
  id: number;
  server: number;
  inter: number;
  arrival: number;
  start: number;
  service: number;
  end: number;
  wait: number;
  sysTime: number;
};

/* ========== Estilos (suaves, acordes al proyecto) ========== */
const mono = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
const palette = {
  border:  "#DCEAF7",
  head:    "#F0F9FF",
  text:    "#0F172A",
  sub:     "#475569",
  card:    "#ffffff",
  ok:      "#065F46",
  warn:    "#92400E",
  info:    "#1E3A8A",
};

const page: React.CSSProperties = { display: "grid", gap: 16, padding: 16, background: "linear-gradient(180deg, rgba(224,242,254,.35) 0%, #fff 60%)" };
const card: React.CSSProperties = { border: `1px solid ${palette.border}`, borderRadius: 14, background: palette.card, padding: 16 };
const h1: React.CSSProperties = { margin: 0, fontSize: 22, fontWeight: 800, color: palette.text };
const h2: React.CSSProperties = { margin: "0 0 10px 0", fontSize: 18, fontWeight: 800, color: palette.text };
const sub: React.CSSProperties = { margin: "6px 0 0 0", color: palette.sub, fontSize: 14 };
const grid: React.CSSProperties = { display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px,1fr))" };
const label: React.CSSProperties = { fontSize: 13, color: palette.text, fontWeight: 600 };
const input: React.CSSProperties = { width: "100%", padding: "6px 8px", border: `1px solid ${palette.border}`, borderRadius: 8, fontFamily: "inherit", fontSize: 14 };
const select: React.CSSProperties = { ...input, width: "100%" };
const btnRow: React.CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 };
const btn: React.CSSProperties = { padding: "8px 12px", borderRadius: 10, border: `1px solid ${palette.border}`, background: "#fff", cursor: "pointer", fontWeight: 700 };
const btnPri: React.CSSProperties = { ...btn, background: "#EAF7FE", color: palette.info };
const table: React.CSSProperties = { width: "100%", borderCollapse: "collapse", minWidth: 900, marginTop: 8 };
const th: React.CSSProperties = { textAlign: "left", padding: "8px 10px", background: palette.head, borderBottom: `1px solid ${palette.border}`, fontSize: 13, fontWeight: 800, color: palette.text, whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "8px 10px", borderBottom: `1px solid ${palette.border}`, color: palette.text, fontSize: 14 };
const tdNum: React.CSSProperties = { ...td, textAlign: "right", fontFamily: mono, color: palette.sub };
const badge: React.CSSProperties = { display: "inline-block", padding: "4px 10px", borderRadius: 999, border: `1px solid ${palette.border}`, background: "#EFF6FF", color: palette.info, fontSize: 12, fontWeight: 800 };

/* ========== Componente principal ========== */
export default function SimuladorGenericoSSD() {
  /* Parámetros generales */
  const [N, setN] = useState(5);
  const [servers, setServers] = useState(1);
  const [seed, setSeed] = useState(1234);

  /* Proceso de interllegadas */
  const [modeArr, setModeArr] = useState<Mode>("rng");
  const [arrSpec, setArrSpec] = useState<DistSpec>({ kind: "expo", mean: 5 });
  const [UarrTxt, setUarrTxt] = useState(""); // U para interllegadas (modo manual)

  /* Proceso de servicio */
  const [modeSvc, setModeSvc] = useState<Mode>("rng");
  const [svcSpec, setSvcSpec] = useState<DistSpec>({ kind: "uniform", a: 3, b: 7 });
  const [UsvcTxt, setUsvcTxt] = useState(""); // U para servicio (modo manual)

  /* disparador del botón Calcular (para RNG) */
  const [runId, setRunId] = useState(0);
  const calcular = () => setRunId((x) => x + 1);

  const resumen = useMemo(() => {
    const n = Math.max(1, Math.floor(N));
    const k = Math.max(1, Math.floor(servers));

    // Generación de interllegadas
    let inters: number[] = [];
    if (modeArr === "manualU") {
      const U = parseList(UarrTxt);
      if (U.length < n) return { error: `Interllegadas: se requieren ${n} valores U, recibidos ${U.length}.` };
      inters = U.slice(0, n).map((u) => Math.max(0, sampleFromU(u, arrSpec)));
    } else {
      const rng = mulberry32(seed + 17 * runId);
      for (let i = 0; i < n; i++) inters.push(Math.max(0, sample(arrSpec, rng)));
    }

    // Generación de servicios
    let svcs: number[] = [];
    if (modeSvc === "manualU") {
      const U = parseList(UsvcTxt);
      if (U.length < n) return { error: `Servicio: se requieren ${n} valores U, recibidos ${U.length}.` };
      svcs = U.slice(0, n).map((u) => Math.max(0, sampleFromU(u, svcSpec)));
    } else {
      const rng = mulberry32(seed + 31 * runId + 999);
      for (let i = 0; i < n; i++) svcs.push(Math.max(0, sample(svcSpec, rng)));
    }

    // Construir llegadas absolutas
    const arrivals: number[] = [];
    let t = 0;
    for (let i = 0; i < n; i++) { t += inters[i]; arrivals.push(t); }

    // Estado de servidores (tiempo disponible)
    const avail: number[] = Array(k).fill(0);
    const busy: number[] = Array(k).fill(0);

    const rows: Row[] = [];
    for (let i = 0; i < n; i++) {
      const a = arrivals[i];
      // elegir servidor con menor "avail" (FIFO simple c/k servidores)
      let sIdx = 0;
      for (let j = 1; j < k; j++) if (avail[j] < avail[sIdx]) sIdx = j;

      const start = Math.max(a, avail[sIdx]);
      const service = svcs[i];
      const end = start + service;
      const wait = Math.max(0, start - a);
      const sysTime = end - a;

      rows.push({
        id: i + 1,
        server: sIdx + 1,
        inter: inters[i],
        arrival: a,
        start,
        service,
        end,
        wait,
        sysTime,
      });

      avail[sIdx] = end;
      busy[sIdx] += service;
    }

    const makespan = rows.length ? rows[rows.length - 1].end - (arrivals[0] ?? 0) : 0;
    const meanWait = rows.reduce((s, r) => s + r.wait, 0) / n;
    const meanSvc  = rows.reduce((s, r) => s + r.service, 0) / n;
    const meanSys  = rows.reduce((s, r) => s + r.sysTime, 0) / n;
    const waitedPct = (rows.filter(r => r.wait > 1e-12).length / n) * 100;
    const util = busy.map(b => (makespan > 0 ? (b / makespan) * 100 : 0));

    return { rows, meanWait, meanSvc, meanSys, waitedPct, util, makespan };
  }, [N, servers, seed, modeArr, arrSpec, UarrTxt, modeSvc, svcSpec, UsvcTxt, runId]);

  const setArrParam = (patch: Partial<DistSpec>) => setArrSpec(prev => ({ ...prev, ...patch }));
  const setSvcParam = (patch: Partial<DistSpec>) => setSvcSpec(prev => ({ ...prev, ...patch }));

  return (
    <div style={page}>
      <div style={card}>
        <h1 style={h1}>Simulador genérico de eventos discretos (colas)</h1>
        <p style={sub}>
          Define interllegadas y servicios (Exponencial, Uniforme, Triangular, Constante). Puedes pegar tus listas de <b>U</b> (modo manual)
          como en el PDF, o usar generador con semilla. FIFO, {`1..k`} servidores.
        </p>
      </div>

      {/* Parámetros generales */}
      <div style={card}>
        <h2 style={h2}>Parámetros generales</h2>
        <div style={grid}>
          <label>
            <div style={label}>N entidades</div>
            <input type="number" min={1} value={N} onChange={(e)=>setN(Math.max(1, Number(e.target.value)||1))} style={input}/>
          </label>
          <label>
            <div style={label}>Servidores (k)</div>
            <input type="number" min={1} value={servers} onChange={(e)=>setServers(Math.max(1, Number(e.target.value)||1))} style={input}/>
          </label>
          <label>
            <div style={label}>Semilla (modo aleatorio)</div>
            <input type="number" value={seed} onChange={(e)=>setSeed(Number(e.target.value)||0)} style={input}/>
          </label>
        </div>
      </div>

      {/* Interllegadas */}
      <div style={card}>
        <h2 style={h2}>Interllegadas</h2>
        <div style={grid}>
          <label>
            <div style={label}>Modo</div>
            <select value={modeArr} onChange={(e)=>setModeArr(e.target.value as Mode)} style={select}>
              <option value="rng">Aleatorio con semilla</option>
              <option value="manualU">U manual (del ejercicio)</option>
            </select>
          </label>

          <label>
            <div style={label}>Distribución</div>
            <select
              value={arrSpec.kind}
              onChange={(e)=>setArrSpec({ kind: e.target.value as DistKind, mean: 5, a: 0, b: 1, min: 0, mode: 0, max: 1, c: 1 })}
              style={select}
            >
              <option value="expo">Exponencial (media)</option>
              <option value="uniform">Uniforme [a,b]</option>
              <option value="tri">Triangular (mín, moda, máx)</option>
              <option value="const">Constante (c)</option>
            </select>
          </label>

          {arrSpec.kind === "expo" && (
            <label>
              <div style={label}>Media</div>
              <input type="number" step="any" value={arrSpec.mean ?? 5} onChange={(e)=>setArrParam({ mean: Number(e.target.value)||1 })} style={input}/>
            </label>
          )}
          {arrSpec.kind === "uniform" && (
            <>
              <label>
                <div style={label}>a</div>
                <input type="number" step="any" value={arrSpec.a ?? 0} onChange={(e)=>setArrParam({ a: Number(e.target.value)||0 })} style={input}/>
              </label>
              <label>
                <div style={label}>b</div>
                <input type="number" step="any" value={arrSpec.b ?? 1} onChange={(e)=>setArrParam({ b: Number(e.target.value)||0 })} style={input}/>
              </label>
            </>
          )}
          {arrSpec.kind === "tri" && (
            <>
              <label>
                <div style={label}>mín</div>
                <input type="number" step="any" value={arrSpec.min ?? 0} onChange={(e)=>setArrParam({ min: Number(e.target.value)||0 })} style={input}/>
              </label>
              <label>
                <div style={label}>moda</div>
                <input type="number" step="any" value={arrSpec.mode ?? 0} onChange={(e)=>setArrParam({ mode: Number(e.target.value)||0 })} style={input}/>
              </label>
              <label>
                <div style={label}>máx</div>
                <input type="number" step="any" value={arrSpec.max ?? 1} onChange={(e)=>setArrParam({ max: Number(e.target.value)||0 })} style={input}/>
              </label>
            </>
          )}
          {arrSpec.kind === "const" && (
            <label>
              <div style={label}>c</div>
              <input type="number" step="any" value={arrSpec.c ?? 1} onChange={(e)=>setArrParam({ c: Number(e.target.value)||0 })} style={input}/>
            </label>
          )}
        </div>

        {modeArr === "manualU" && (
          <div style={{ marginTop: 10 }}>
            <div style={label}>Lista de U para interllegadas (separadas por espacio, coma o saltos de línea)</div>
            <textarea
              value={UarrTxt}
              onChange={(e)=>setUarrTxt(e.target.value)}
              placeholder="0.15, 0.78, 0.42, 0.03, ..."
              style={{ ...input, height: 90, fontFamily: mono }}
            />
          </div>
        )}
      </div>

      {/* Servicio */}
      <div style={card}>
        <h2 style={h2}>Servicio</h2>
        <div style={grid}>
          <label>
            <div style={label}>Modo</div>
            <select value={modeSvc} onChange={(e)=>setModeSvc(e.target.value as Mode)} style={select}>
              <option value="rng">Aleatorio con semilla</option>
              <option value="manualU">U manual (del ejercicio)</option>
            </select>
          </label>

          <label>
            <div style={label}>Distribución</div>
            <select
              value={svcSpec.kind}
              onChange={(e)=>setSvcSpec({ kind: e.target.value as DistKind, mean: 5, a: 3, b: 7, min: 2, mode: 4, max: 8, c: 3 })}
              style={select}
            >
              <option value="expo">Exponencial (media)</option>
              <option value="uniform">Uniforme [a,b]</option>
              <option value="tri">Triangular (mín, moda, máx)</option>
              <option value="const">Constante (c)</option>
            </select>
          </label>

          {svcSpec.kind === "expo" && (
            <label>
              <div style={label}>Media</div>
              <input type="number" step="any" value={svcSpec.mean ?? 5} onChange={(e)=>setSvcParam({ mean: Number(e.target.value)||1 })} style={input}/>
            </label>
          )}
          {svcSpec.kind === "uniform" && (
            <>
              <label>
                <div style={label}>a</div>
                <input type="number" step="any" value={svcSpec.a ?? 3} onChange={(e)=>setSvcParam({ a: Number(e.target.value)||0 })} style={input}/>
              </label>
              <label>
                <div style={label}>b</div>
                <input type="number" step="any" value={svcSpec.b ?? 7} onChange={(e)=>setSvcParam({ b: Number(e.target.value)||0 })} style={input}/>
              </label>
            </>
          )}
          {svcSpec.kind === "tri" && (
            <>
              <label>
                <div style={label}>mín</div>
                <input type="number" step="any" value={svcSpec.min ?? 2} onChange={(e)=>setSvcParam({ min: Number(e.target.value)||0 })} style={input}/>
              </label>
              <label>
                <div style={label}>moda</div>
                <input type="number" step="any" value={svcSpec.mode ?? 4} onChange={(e)=>setSvcParam({ mode: Number(e.target.value)||0 })} style={input}/>
              </label>
              <label>
                <div style={label}>máx</div>
                <input type="number" step="any" value={svcSpec.max ?? 8} onChange={(e)=>setSvcParam({ max: Number(e.target.value)||0 })} style={input}/>
              </label>
            </>
          )}
          {svcSpec.kind === "const" && (
            <label>
              <div style={label}>c</div>
              <input type="number" step="any" value={svcSpec.c ?? 3} onChange={(e)=>setSvcParam({ c: Number(e.target.value)||0 })} style={input}/>
            </label>
          )}
        </div>

        {modeSvc === "manualU" && (
          <div style={{ marginTop: 10 }}>
            <div style={label}>Lista de U para servicio (separadas por espacio, coma o saltos de línea)</div>
            <textarea
              value={UsvcTxt}
              onChange={(e)=>setUsvcTxt(e.target.value)}
              placeholder="0.22, 0.91, 0.08, 0.63, ..."
              style={{ ...input, height: 90, fontFamily: mono }}
            />
          </div>
        )}
      </div>

      {/* Acciones y avisos */}
      <div style={card}>
        <div style={btnRow}>
          <button onClick={calcular} style={btnPri}>Calcular</button>
          <span style={badge}>Usa el botón tras cambiar parámetros si estás en modo “Aleatorio con semilla”.</span>
        </div>
        {"error" in resumen && resumen.error && (
          <p style={{ color: "#B91C1C", marginTop: 8, fontWeight: 700 }}>{resumen.error}</p>
        )}
      </div>

      {/* Resultados */}
      {"rows" in resumen && resumen.rows && (
        <>
          <div style={card}>
            <h2 style={h2}>Tabla de eventos</h2>
            <div style={{ overflowX: "auto" }}>
              <table style={table}>
                <thead>
                  <tr>
                    <th style={th}>#</th>
                    <th style={th}>Servidor</th>
                    <th style={th}>Inter</th>
                    <th style={th}>Llegada</th>
                    <th style={th}>Inicio</th>
                    <th style={th}>Servicio</th>
                    <th style={th}>Fin</th>
                    <th style={th}>Espera</th>
                    <th style={th}>Tiempo en sistema</th>
                  </tr>
                </thead>
                <tbody>
                  {resumen.rows.map((r) => (
                    <tr key={r.id}>
                      <td style={td}>{r.id}</td>
                      <td style={td}>{r.server}</td>
                      <td style={tdNum}>{r.inter.toFixed(2)}</td>
                      <td style={tdNum}>{r.arrival.toFixed(2)}</td>
                      <td style={tdNum}>{r.start.toFixed(2)}</td>
                      <td style={tdNum}>{r.service.toFixed(2)}</td>
                      <td style={tdNum}>{r.end.toFixed(2)}</td>
                      <td style={tdNum}>{r.wait.toFixed(2)}</td>
                      <td style={tdNum}>{r.sysTime.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={card}>
            <h2 style={h2}>Métricas</h2>
            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px,1fr))" }}>
              <div><div style={label}>Espera promedio</div><div style={{ fontWeight: 800 }}>{resumen.meanWait.toFixed(2)}</div></div>
              <div><div style={label}>Servicio promedio</div><div style={{ fontWeight: 800 }}>{resumen.meanSvc.toFixed(2)}</div></div>
              <div><div style={label}>Tiempo en sistema promedio</div><div style={{ fontWeight: 800 }}>{resumen.meanSys.toFixed(2)}</div></div>
              <div><div style={label}>% que esperó</div><div style={{ fontWeight: 800 }}>{resumen.waitedPct.toFixed(1)}%</div></div>
              <div><div style={label}>Makespan</div><div style={{ fontWeight: 800 }}>{resumen.makespan.toFixed(2)}</div></div>
            </div>
            <div style={{ marginTop: 10 }}>
              <div style={label}>Utilización por servidor</div>
              {"util" in resumen && (
                <ul style={{ margin: "6px 0 0 18px", color: palette.sub }}>
                  {resumen.util.map((u, i) => (<li key={i}>Servidor {i+1}: <b>{u.toFixed(1)}%</b></li>))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
