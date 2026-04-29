(function(){
  "use strict";

  // ── Physical constants ──────────────────────────────────────────
  const MASS = 1.67e-27;          // proton mass (kg)
  const KB   = 1.380649e-23;      // Boltzmann constant (J/K)
  const SPEED_CONV = 1000;        // 1 sim-speed unit = 1000 m/s  (nm/ps = 1000 m/s)
  const DT   = 1/60;              // time step (simulation units ≈ 1/60 ps)

  // ── Simulation state ────────────────────────────────────────────
  let N = 500;
  let speedScale = 800;           // initial speed spread, m/s
  const RADIUS = 0.005;           // particle radius, sim units

  let pos = [], vel = [];
  let step = 0, paused = false, animId = null;

  // ── DOM refs ────────────────────────────────────────────────────
  const simCanvas  = document.getElementById("simCanvas");
  const ctx        = simCanvas.getContext("2d");
  const avgSpeedEl = document.getElementById("avgSpeedDisplay");
  const rmsSpeedEl = document.getElementById("rmsSpeedDisplay");
  const tempEl     = document.getElementById("tempDisplay");
  const avgKEEl    = document.getElementById("avgKEDisplay");
  const vpEl       = document.getElementById("vpDisplay");
  const stepEl     = document.getElementById("stepCounter");
  const pCountDisp = document.getElementById("particleCountDisplay");
  const pCountSldr = document.getElementById("particleCountSlider");
  const pCountVal  = document.getElementById("particleCountValue");
  const speedSldr  = document.getElementById("speedScaleSlider");
  const speedVal   = document.getElementById("speedScaleValue");

  // ── Histogram state ─────────────────────────────────────────────
  const NBINS = 60;
  let vmaxPhys = 1;               // x-axis right edge in m/s
  let binEdges = [];              // bin centre positions in m/s
  let histBins = new Array(NBINS).fill(0);   // current frame density (s/m)
  let runAvg   = new Array(NBINS).fill(0);   // exponential running average
  let runCount = 0;

  // ── Chart setup ─────────────────────────────────────────────────
  const chartCtx = document.getElementById("chart").getContext("2d");
  const chart = new Chart(chartCtx, {
    type: "bar",
    data: {
      labels: binEdges,
      datasets: [
        { label: "Histogram",    data: [...histBins], backgroundColor: "rgba(34,197,94,0.50)", borderColor: "#16a34a", borderWidth: 0.8, borderRadius: 3 },
        { label: "Running avg",  type: "line", data: [...runAvg],   borderColor: "#dc2626", borderWidth: 2.5, pointRadius: 0, tension: 0.25 },
        { label: "Theory (2D)",  type: "line", data: new Array(NBINS).fill(0), borderColor: "#64748b", borderWidth: 2.5, pointRadius: 0, borderDash: [8,4] }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      plugins: { legend: { labels: { usePointStyle: true, boxWidth: 8 } } },
      scales: {
        x: { title: { display: true, text: "Speed (m/s)" }, grid: { color: "#e2e8f0" }, ticks: { maxTicksLimit: 10, maxRotation: 0 } },
        y: { title: { display: true, text: "Probability density (s/m)" }, beginAtZero: true, grid: { color: "#e2e8f0" } }
      }
    }
  });

  // ── Bin grid update ─────────────────────────────────────────────
  function setBinGrid(newVmaxPhys) {
    vmaxPhys = Math.max(newVmaxPhys, 10);
    binEdges = [];
    for (let i = 0; i < NBINS; i++) {
      binEdges.push( (vmaxPhys * (i + 0.5) / NBINS).toFixed(0) );
    }
    chart.data.labels = binEdges;
  }

  // ── Compute physical speeds ──────────────────────────────────────
  function physSpeeds() {
    const s = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const vx = vel[i][0], vy = vel[i][1];
      s[i] = Math.sqrt(vx*vx + vy*vy) * SPEED_CONV;  // m/s
    }
    return s;
  }

  // ── Histogram + stats update ────────────────────────────────────
  function updateHistAndStats() {
    const speeds = physSpeeds();

    // Adaptive x-axis: 99th percentile × 1.4
    const sorted = [...speeds].sort((a,b)=>a-b);
    const p99 = sorted[Math.floor(N * 0.99)] || 1;
    const newVmax = Math.min(p99 * 1.4, 15000);
    if (Math.abs(newVmax - vmaxPhys) / vmaxPhys > 0.08) setBinGrid(newVmax);

    const binW = vmaxPhys / NBINS;   // m/s per bin

    // Build histogram in physical units: density = count/(N·Δv)  [s/m]
    histBins.fill(0);
    for (const v of speeds) {
      const idx = Math.floor(v / vmaxPhys * NBINS);
      if (idx >= 0 && idx < NBINS) histBins[idx]++;
    }
    for (let i = 0; i < NBINS; i++) histBins[i] /= (N * binW);   // → s/m

    // Running average (exponential, α = 1/runCount up to 200 frames)
    runCount++;
    const alpha = 1 / Math.min(runCount, 200);
    for (let i = 0; i < NBINS; i++) {
      runAvg[i] += alpha * (histBins[i] - runAvg[i]);
    }

    // Stats
    let sumV = 0, sumV2 = 0;
    for (const v of speeds) { sumV += v; sumV2 += v*v; }
    const avgV   = sumV / N;
    const rmsV   = Math.sqrt(sumV2 / N);
    const avgKE  = 0.5 * MASS * (sumV2 / N);       // J
    const T      = avgKE / KB;                       // 2D: <KE>=k_B*T
    const vp     = Math.sqrt(KB * T / MASS);         // most probable speed
    const variance = (sumV2/N) - avgV*avgV;
    const stdDev = Math.sqrt(Math.max(0, variance));

    avgSpeedEl.textContent = `${avgV.toFixed(0)} ± ${stdDev.toFixed(0)}`;
    rmsSpeedEl.textContent = rmsV.toFixed(0);
    tempEl.textContent     = T.toExponential(2);
    avgKEEl.textContent    = (avgKE * 1e21).toFixed(2);
    vpEl.textContent       = vp.toFixed(0);
    stepEl.textContent     = step;

    return { T };
  }

  // ── Theoretical MB curve ─────────────────────────────────────────
  function updateTheory(T) {
    if (!T || T <= 0) return;
    const theo = new Array(NBINS);
    let maxTheo = 0;
    const kT = KB * T;
    for (let i = 0; i < NBINS; i++) {
      const v = vmaxPhys * (i + 0.5) / NBINS;   // m/s, bin centre
      // f(v) = (m/k_B*T) * v * exp(-m*v^2 / (2*k_B*T))   [s/m]
      const fv = (MASS / kT) * v * Math.exp(-MASS * v * v / (2 * kT));
      theo[i] = fv;
      if (fv > maxTheo) maxTheo = fv;
    }
    chart.data.datasets[0].data = [...histBins];
    chart.data.datasets[1].data = [...runAvg];
    chart.data.datasets[2].data = theo;
    chart.options.scales.y.max = Math.max(maxTheo * 1.35, 1e-6);
  }

  // ── Spatial hash for O(N) collision detection ────────────────────
  const CELL = 2 * RADIUS;           // cell size = particle diameter
  let hashMap = new Map();

  function buildHash() {
    hashMap.clear();
    for (let i = 0; i < N; i++) {
      const cx = Math.floor(pos[i][0] / CELL);
      const cy = Math.floor(pos[i][1] / CELL);
      const key = `${cx},${cy}`;
      if (!hashMap.has(key)) hashMap.set(key, []);
      hashMap.get(key).push(i);
    }
  }

  function handleCollisions() {
    buildHash();
    const diam2 = (2 * RADIUS) ** 2;
    for (let i = 0; i < N; i++) {
      const cx = Math.floor(pos[i][0] / CELL);
      const cy = Math.floor(pos[i][1] / CELL);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const neighbors = hashMap.get(`${cx+dx},${cy+dy}`);
          if (!neighbors) continue;
          for (const j of neighbors) {
            if (j <= i) continue;
            const rx = pos[i][0] - pos[j][0];
            const ry = pos[i][1] - pos[j][1];
            const r2 = rx*rx + ry*ry;
            if (r2 < diam2 && r2 > 1e-12) {
              const dvx = vel[i][0] - vel[j][0];
              const dvy = vel[i][1] - vel[j][1];
              const dot = dvx*rx + dvy*ry;
              if (dot < 0) {
                const f = dot / r2;
                vel[i][0] -= rx * f;  vel[i][1] -= ry * f;
                vel[j][0] += rx * f;  vel[j][1] += ry * f;
              }
            }
          }
        }
      }
    }
  }

  function handleWalls() {
    for (let i = 0; i < N; i++) {
      if (pos[i][0] < RADIUS)        { pos[i][0] = RADIUS;      vel[i][0] = Math.abs(vel[i][0]); }
      if (pos[i][0] > 1 - RADIUS)   { pos[i][0] = 1 - RADIUS;  vel[i][0] = -Math.abs(vel[i][0]); }
      if (pos[i][1] < RADIUS)        { pos[i][1] = RADIUS;      vel[i][1] = Math.abs(vel[i][1]); }
      if (pos[i][1] > 1 - RADIUS)   { pos[i][1] = 1 - RADIUS;  vel[i][1] = -Math.abs(vel[i][1]); }
    }
  }

  function advancePositions() {
    for (let i = 0; i < N; i++) {
      pos[i][0] += vel[i][0] * DT;
      pos[i][1] += vel[i][1] * DT;
    }
  }

  // ── Rendering ───────────────────────────────────────────────────
  function drawParticles() {
    const W = simCanvas.width, H = simCanvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#0b1120";
    ctx.fillRect(0, 0, W, H);

    // Speed-based color: slow=blue, medium=teal, fast=red
    const maxV = vmaxPhys / SPEED_CONV * 0.6;
    for (let i = 0; i < N; i++) {
      const vx = vel[i][0], vy = vel[i][1];
      const spd = Math.sqrt(vx*vx + vy*vy);
      const t = Math.min(spd / maxV, 1);
      // Interpolate: blue(0) → teal(0.5) → red(1)
      let r, g, b;
      if (t < 0.5) {
        const u = t * 2;
        r = Math.round(30  + u * 11);
        g = Math.round(100 + u * 122);
        b = Math.round(200 - u * 78);
      } else {
        const u = (t - 0.5) * 2;
        r = Math.round(41  + u * 175);
        g = Math.round(222 - u * 172);
        b = Math.round(122 - u * 110);
      }
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.beginPath();
      ctx.arc(pos[i][0] * W, pos[i][1] * H, 2.5, 0, 2*Math.PI);
      ctx.fill();
    }
    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(0, 0, W, H);
  }

  // ── Initialization ───────────────────────────────────────────────
  function initParticles(newN, scalePhys, keepStep) {
    N = newN;
    const scaleSim = scalePhys / SPEED_CONV;  // m/s → sim units
    pos = []; vel = [];
    // Place particles in a grid to avoid initial overlaps
    const cols = Math.ceil(Math.sqrt(N));
    const spacing = 1 / cols;
    for (let i = 0; i < N; i++) {
      const col = i % cols, row = Math.floor(i / cols);
      const x = (col + 0.5) * spacing;
      const y = (row + 0.5) * spacing;
      pos.push([
        Math.min(Math.max(x, RADIUS), 1 - RADIUS),
        Math.min(Math.max(y, RADIUS), 1 - RADIUS)
      ]);
      const theta = Math.random() * 2 * Math.PI;
      const spd   = (0.3 + Math.random() * 0.7) * scaleSim; // uniform spread
      vel.push([spd * Math.cos(theta), spd * Math.sin(theta)]);
    }
    if (!keepStep) {
      step = 0;
      runAvg.fill(0);
      runCount = 0;
      // Set initial vmax based on speed scale
      setBinGrid(scalePhys * 2.5);
    }
    pCountDisp.textContent = `${N} particles`;
    pCountVal.textContent  = N;
    pCountSldr.value       = N;
  }

  function resetSimulation() {
    initParticles(N, speedScale, false);
    const { T } = updateHistAndStats();
    updateTheory(T);
    drawParticles();
    chart.update();
  }

  function restoreDefaults() {
    N = 500; speedScale = 800;
    speedSldr.value = speedScale;
    speedVal.textContent = speedScale;
    resetSimulation();
  }

  function reshuffleParticles() {
    initParticles(N, speedScale, true);
    const { T } = updateHistAndStats();
    updateTheory(T);
    drawParticles();
    chart.update();
  }

  function adjustEnergy(factor) {
    for (let i = 0; i < N; i++) {
      vel[i][0] *= factor;
      vel[i][1] *= factor;
    }
    // Reset running average after energy change so it re-converges
    runAvg.fill(0); runCount = 0;
  }

  // ── Animation loop ───────────────────────────────────────────────
  function loop() {
    if (!paused) {
      advancePositions();
      handleCollisions();
      handleWalls();
      const { T } = updateHistAndStats();
      updateTheory(T);
      chart.update();
      drawParticles();
      step++;
    }
    animId = requestAnimationFrame(loop);
  }

  // ── Controls ─────────────────────────────────────────────────────
  function bindControls() {
    document.getElementById("resetButton").addEventListener("click", resetSimulation);
    document.getElementById("restoreDefaultsButton").addEventListener("click", restoreDefaults);
    document.getElementById("reshuffleButton").addEventListener("click", reshuffleParticles);

    const pauseBtn = document.getElementById("pauseButton");
    pauseBtn.addEventListener("click", () => {
      paused = !paused;
      pauseBtn.textContent = paused ? "▶ Resume" : "⏸ Pause";
    });

    document.getElementById("increaseEnergyBtn").addEventListener("click", () => adjustEnergy(Math.sqrt(1.4)));
    document.getElementById("decreaseEnergyBtn").addEventListener("click", () => adjustEnergy(Math.sqrt(0.7)));

    pCountSldr.addEventListener("input", e => pCountVal.textContent = e.target.value);
    pCountSldr.addEventListener("change", e => {
      initParticles(parseInt(e.target.value), speedScale, false);
      const { T } = updateHistAndStats(); updateTheory(T); drawParticles(); chart.update();
    });

    speedSldr.addEventListener("input", e => {
      speedScale = parseFloat(e.target.value);
      speedVal.textContent = speedScale;
    });
    speedSldr.addEventListener("change", () => resetSimulation());
  }

  // ── Citation highlight ────────────────────────────────────────────
  window.highlightRef = function(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("ref-highlight");
    setTimeout(() => el.classList.remove("ref-highlight"), 1800);
  };

  // ── KaTeX ─────────────────────────────────────────────────────────
  function renderKatex() {
    if (typeof renderMathInElement !== "undefined") {
      renderMathInElement(document.body, {
        delimiters: [
          { left: "\\[", right: "\\]", display: true },
          { left: "\\(", right: "\\)", display: false }
        ],
        throwOnError: false
      });
    }
  }

  // ── Boot ──────────────────────────────────────────────────────────
  initParticles(N, speedScale, false);
  bindControls();
  const { T: T0 } = updateHistAndStats();
  updateTheory(T0);
  drawParticles();
  chart.update();
  loop();
  window.addEventListener("load", renderKatex);
  setTimeout(renderKatex, 300);
  window.addEventListener("beforeunload", () => { if (animId) cancelAnimationFrame(animId); });
})();

(function(){
  var FONTS=['','font-serif','font-mono'];
  var LS=window.localStorage;
  function lsGet(k){try{return LS?LS.getItem(k):null;}catch(e){return null;}}
  function lsSet(k,v){try{if(LS)LS.setItem(k,v);}catch(e){}}
  function applyPrefs(){
    var dark=lsGet('acc_dark')==='1';
    var sz=lsGet('acc_sz')||'md';
    var fi=parseInt(lsGet('acc_fi')||'0');
    var b=document.body;
    b.classList.toggle('dark-mode',dark);
    b.classList.toggle('light-mode',!dark);
    b.classList.remove('size-sm','size-md','size-lg');
    b.classList.add('size-'+sz);
    b.classList.remove('font-serif','font-mono');
    if(FONTS[fi]) b.classList.add(FONTS[fi]);
    var cb=document.getElementById('acc-dark');
    if(cb) cb.checked=dark;
    ['sm','md','lg'].forEach(function(s){
      var el=document.getElementById('acc-'+s);
      if(el) el.classList.toggle('active',s===sz);
    });
    [0,1,2].forEach(function(i){
      var el=document.getElementById('acc-f'+i);
      if(el) el.classList.toggle('active',i===fi);
    });
  }
  window.accToggle=function(){var p=document.getElementById('acc-panel');if(p)p.classList.toggle('open');};
  window.accDark=function(cb){lsSet('acc_dark',cb.checked?'1':'0');applyPrefs();};
  window.accSize=function(s){lsSet('acc_sz',s);applyPrefs();};
  window.accFont=function(i){lsSet('acc_fi',i);applyPrefs();};
  document.addEventListener('click',function(e){
    var p=document.getElementById('acc-panel');
    var b2=document.getElementById('acc-btn');
    if(p&&b2&&p.classList.contains('open')&&!p.contains(e.target)&&e.target!==b2)
      p.classList.remove('open');
  });
  applyPrefs();
  document.addEventListener('DOMContentLoaded',applyPrefs);
})();