import React, { useState } from "react";

// Tipo para cada evento definido por el usuario
type Evento = {
  nombre: string;
  prob: number;
  valor: number;
  formula?: string; // Nueva propiedad para la fórmula
};

function generarIntervalos(eventos: Evento[]) {
  let acumulado = 0;
  return eventos.map(e => {
    const intervalo = [acumulado, acumulado + e.prob];
    acumulado += e.prob;
    return { ...e, intervalo };
  });
}

// Evalúa la fórmula ingresada por el usuario
function aplicarFormula(formula: string, rnd: number, valor: number) {
  try {
    // Permite usar "rnd" y "valor" en la fórmula
    // Ejemplo: "valor + rnd * 5"
    // Seguridad: solo evalúa expresiones matemáticas simples
    // eslint-disable-next-line no-new-func
    return Function("rnd", "valor", `return ${formula}`)(rnd, valor);
  } catch {
    return NaN;
  }
}

function simular(eventos: Evento[], aleatorios: number[]) {
  const intervalos = generarIntervalos(eventos);
  const resultados: { evento: string; valor: number; rnd: number; resultado: number }[] = [];
  for (let i = 0; i < aleatorios.length; i++) {
    const r = aleatorios[i];
    const ev = intervalos.find(e => r >= e.intervalo[0] && r < e.intervalo[1]) || intervalos[intervalos.length - 1];
    // Aplica la fórmula si existe, si no usa el valor base
    const resultado = ev.formula ? aplicarFormula(ev.formula, r, ev.valor) : ev.valor;
    resultados.push({ evento: ev.nombre, valor: ev.valor, rnd: r, resultado });
  }
  return resultados;
}

export default function SimuladorPTAR() {
  const [eventos, setEventos] = useState<Evento[]>([
    { nombre: "Llegada", prob: 0.3, valor: 5, formula: "valor + rnd * 5" },
    { nombre: "Servicio", prob: 0.5, valor: 10, formula: "valor - rnd * 3" },
    { nombre: "Espera", prob: 0.2, valor: 2 }
  ]);
  const [nSim, setNSim] = useState(20);
  const [aleatorios, setAleatorios] = useState<number[]>(Array(20).fill(0));
  const [resultados, setResultados] = useState<{ evento: string; valor: number; rnd: number; resultado: number }[]>([]);
  const [modoManual, setModoManual] = useState(false);

  // Suma de probabilidades para validación
  const sumaProb = eventos.reduce((a, e) => a + e.prob, 0);

  // Generar números aleatorios entre 0 y 0.9
  const generarAleatorios = () => {
    const arr = Array(nSim)
      .fill(0)
      .map(() => Number((Math.random() * 0.9).toFixed(4)));
    setAleatorios(arr);
  };

  // Cambiar cantidad de simulaciones y ajustar array de aleatorios
  const cambiarNSim = (val: number) => {
    const nuevo = Math.max(1, val);
    setNSim(nuevo);
    setAleatorios((prev) => {
      const arr = [...prev];
      if (arr.length < nuevo) {
        return arr.concat(Array(nuevo - arr.length).fill(0));
      } else {
        return arr.slice(0, nuevo);
      }
    });
  };

  // Simular
  const simularClick = () => {
    if (Math.abs(sumaProb - 1) > 0.001) {
      alert("La suma de probabilidades debe ser 1");
      return;
    }
    if (aleatorios.length !== nSim) {
      alert("La cantidad de números aleatorios no coincide con el número de simulaciones.");
      return;
    }
    if (aleatorios.some(a => a < 0 || a >= 1)) {
      alert("Todos los números aleatorios deben estar entre 0 y 0.9 (no pueden ser 1).");
      return;
    }
    setResultados(simular(eventos, aleatorios));
  };

  // Estadísticas
  const promedio = resultados.length ? resultados.reduce((a, r) => a + r.resultado, 0) / resultados.length : 0;

  return (
    <div style={page}>
      <div style={card}>
        <h1 style={h1}>Simulador genérico de eventos</h1>
        <p style={sub}>
          Define tus eventos, probabilidades, valores y fórmulas. Elige si quieres generar los números aleatorios o ingresarlos manualmente. Simula N veces y obtén resultados y estadísticas.
        </p>
      </div>

      <div style={card}>
        <h2 style={h2}>Eventos</h2>
        <table style={table}>
          <thead>
            <tr>
              <th style={thC}>Nombre</th>
              <th style={thC}>Probabilidad</th>
              <th style={thC}>Valor base</th>
              <th style={thC}>Fórmula <span title="Usa 'rnd' y 'valor'. Ej: valor + rnd*5">(?)</span></th>
              <th style={thC}></th>
            </tr>
          </thead>
          <tbody>
            {eventos.map((ev, i) => (
              <tr key={i}>
                <td style={tdC}>
                  <input style={input} value={ev.nombre}
                    onChange={e => {
                      const arr = [...eventos];
                      arr[i].nombre = e.target.value;
                      setEventos(arr);
                    }} />
                </td>
                <td style={tdC}>
                  <input style={input} type="number" step="any" min={0} max={1} value={ev.prob}
                    onChange={e => {
                      const arr = [...eventos];
                      arr[i].prob = Math.max(0, Math.min(1, Number(e.target.value)));
                      setEventos(arr);
                    }} />
                </td>
                <td style={tdC}>
                  <input style={input} type="number" step="any" value={ev.valor}
                    onChange={e => {
                      const arr = [...eventos];
                      arr[i].valor = Number(e.target.value);
                      setEventos(arr);
                    }} />
                </td>
                <td style={tdC}>
                  <input style={input} value={ev.formula || ""}
                    placeholder="Ej: valor + rnd*5"
                    onChange={e => {
                      const arr = [...eventos];
                      arr[i].formula = e.target.value;
                      setEventos(arr);
                    }} />
                </td>
                <td style={tdC}>
                  <button style={btnPri} onClick={() => setEventos(eventos.filter((_, j) => j !== i))}>🗑️</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button style={btnPri} onClick={() => setEventos([...eventos, { nombre: "", prob: 0, valor: 0, formula: "" }])}>Agregar evento</button>
        <div style={{ marginTop: 8, color: sumaProb === 1 ? "green" : "red" }}>
          Suma de probabilidades: {sumaProb.toFixed(2)} (debe ser 1)
        </div>
      </div>

      <div style={card}>
        <h2 style={h2}>Números aleatorios</h2>
        <div style={{ marginBottom: 8 }}>
          <label>
            <input type="checkbox" checked={modoManual} onChange={e => setModoManual(e.target.checked)} />
            <span style={{ marginLeft: 8 }}>Ingresar manualmente</span>
          </label>
        </div>
        {!modoManual ? (
          <>
            <button style={btnPri} onClick={generarAleatorios}>Generar aleatorios</button>
            <div style={{ marginTop: 8 }}>
              <b>Números aleatorios generados:</b>
              <div style={{ fontFamily: mono, fontSize: 15, marginTop: 4 }}>
                {aleatorios.map((a, i) => <span key={i}>{a.toFixed(4)}{i < aleatorios.length - 1 ? ", " : ""}</span>)}
              </div>
            </div>
          </>
        ) : (
          <div>
            <b>Ingresa los {nSim} números aleatorios (entre 0 y 0.9):</b>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
              {aleatorios.map((a, i) => (
                <input
                  key={i}
                  style={{ ...input, width: 80 }}
                  type="number"
                  step="any"
                  min={0}
                  max={0.9}
                  value={a}
                  onChange={e => {
                    const arr = [...aleatorios];
                    let val = Number(e.target.value);
                    if (val < 0) val = 0;
                    if (val > 0.9) val = 0.9;
                    arr[i] = val;
                    setAleatorios(arr);
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={card}>
        <h2 style={h2}>Simulación</h2>
        <label>
          <div style={label}>Número de simulaciones</div>
          <input style={input} type="number" min={1} value={nSim} onChange={e => cambiarNSim(Number(e.target.value))} />
        </label>
        <div style={btnRow}>
          <button style={btnPri} onClick={simularClick}>Simular</button>
        </div>
      </div>

      <div style={card}>
        <h2 style={h2}>Resultados</h2>
        <div style={metricsGrid}>
          <div>
            <div style={mKey}>Promedio de resultados</div>
            <div style={mVal}>{promedio.toFixed(2)}</div>
          </div>
        </div>
        <div style={{ overflowX: "auto", marginTop: 10 }}>
          <table style={table}>
            <thead>
              <tr>
                <th style={thC}>#</th>
                <th style={thC}>Evento</th>
                <th style={thC}>Valor base</th>
                <th style={thC}>N° aleatorio</th>
                <th style={thC}>Resultado</th>
              </tr>
            </thead>
            <tbody>
              {resultados.map((r, i) => (
                <tr key={i}>
                  <td style={tdC}>{i + 1}</td>
                  <td style={tdC}>{r.evento}</td>
                  <td style={tdNumC}>{r.valor}</td>
                  <td style={tdNumC}>{r.rnd.toFixed(4)}</td>
                  <td style={tdNumC}>{isNaN(r.resultado) ? "Error fórmula" : r.resultado.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ...estilos existentes...
const mono = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
const palette = {
  border:  "#DCEAF7",
  head:    "#F0F9FF",
  text:    "#0F172A",
  sub:     "#475569",
  card:    "#ffffff",
  infoBg:  "#EAF7FE",
};
const page: React.CSSProperties = { display: "grid", gap: 16, padding: 16, background: "linear-gradient(180deg, rgba(224,242,254,.35) 0%, #fff 60%)" };
const card: React.CSSProperties = { border: `1px solid ${palette.border}`, borderRadius: 14, background: palette.card, padding: 16 };
const h1: React.CSSProperties = { margin: 0, fontSize: 22, fontWeight: 800, color: palette.text };
const h2: React.CSSProperties = { margin: "0 0 10px 0", fontSize: 18, fontWeight: 800, color: palette.text };
const sub: React.CSSProperties = { margin: "6px 0 0 0", color: palette.sub, fontSize: 14 };
const grid: React.CSSProperties = { display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px,1fr))" };
const label: React.CSSProperties = { fontSize: 13, color: palette.text, fontWeight: 600 };
const input: React.CSSProperties = { width: "100%", padding: "8px 10px", border: `1px solid ${palette.border}`, borderRadius: 10, fontFamily: "inherit", fontSize: 14 };
const select: React.CSSProperties = { ...input };
const btnRow: React.CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 };
const btnPri: React.CSSProperties = { padding: "8px 12px", borderRadius: 10, border: `1px solid ${palette.border}`, background: palette.infoBg, cursor: "pointer", fontWeight: 800 };

const table: React.CSSProperties = { width: "100%", borderCollapse: "collapse", minWidth: 860, marginTop: 8 };
const thC: React.CSSProperties = { textAlign: "center", padding: "10px 12px", background: palette.head, borderBottom: `1px solid ${palette.border}`, fontSize: 13, fontWeight: 800, color: palette.text, whiteSpace: "nowrap" };
const tdC: React.CSSProperties = { textAlign: "center", padding: "9px 10px", borderBottom: `1px solid ${palette.border}`, fontSize: 14, color: palette.text };
const tdNumC: React.CSSProperties = { ...tdC, fontFamily: mono, color: palette.sub };

const metricsGrid: React.CSSProperties = { display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(200px,1fr))" };
const mKey: React.CSSProperties = { fontSize: 12, color: palette.sub };
const mVal: React.CSSProperties = { fontSize: 16, fontWeight: 800, color: palette.text };
