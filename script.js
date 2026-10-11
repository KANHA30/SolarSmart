/* SolarSmart calculation engine and charts — no backend required. */
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const defaults = { capacity: 4, irradiance: 800, temperature: 35, losses: 95, sunHours: 5, voltage: 30, demand: 12, battery: 8 };
  const inputs = ["capacity", "irradiance", "temperature", "losses", "sunHours", "voltage", "demand", "battery"];
  const state = { ...defaults };
  const tempCoefficient = 0.004; // typical illustrative coefficient per °C above reference
  const referenceTemperature = 25;
  const assumedModuleEfficiency = 0.20;
  let dailyChart, irradianceChart, mpptChart, toastTimer;

  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
  const num = (id) => Number($(id).value);
  const fmt = (n, digits = 1) => Number(n).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const fmtPower = (n) => `${fmt(n, 2)} kW`;

  function readInputs() {
    state.capacity = num("capacity");
    state.irradiance = num("irradiance");
    state.temperature = num("temperature");
    state.losses = num("losses");
    state.sunHours = num("sunHours");
    state.voltage = num("voltage");
    state.demand = clamp(Number.isFinite(num("demand")) ? num("demand") : 0.5, 0.5, 200);
    state.battery = clamp(Number.isFinite(num("battery")) ? num("battery") : 0, 0, 100);
  }

  function calculate() {
    // Temperature factor is referenced to 25°C. This simple model does not model low-light behavior.
    const tempFactor = clamp(1 - tempCoefficient * (state.temperature - referenceTemperature), 0.5, 1.1);
    const irradianceFactor = state.irradiance / 1000;
    const systemFactor = state.losses / 100;
    const power = state.capacity * irradianceFactor * tempFactor * systemFactor;
    const dailyEnergy = state.capacity * state.sunHours * tempFactor * systemFactor;
    // Area estimate uses rated capacity / (1000 W/m² * assumed module efficiency).
    const area = (state.capacity * 1000) / (1000 * assumedModuleEfficiency);
    const efficiency = state.capacity > 0 ? (state.capacity * 1000 / (area * 1000)) * 100 : 0;
    return { tempFactor, irradianceFactor, systemFactor, power, dailyEnergy, area, efficiency, combinedFactor: irradianceFactor * tempFactor * systemFactor };
  }

  function setText(id, value) { $(id).textContent = value; }
  function setProgress(id, percent) { $(id).style.width = `${clamp(percent, 0, 100)}%`; }

  function updateLabels() {
    setText("capacityValue", fmt(state.capacity, 1));
    setText("irradianceValue", fmt(state.irradiance, 0));
    setText("temperatureValue", fmt(state.temperature, 0));
    setText("lossesValue", fmt(state.losses, 0));
    setText("sunHoursValue", fmt(state.sunHours, 1));
    setText("voltageValue", fmt(state.voltage, 1).replace(".0", ""));
  }

  function updateSolarUI(m) {
    const ratedPercent = state.capacity > 0 ? (m.power / state.capacity) * 100 : 0;
    setText("statPower", fmt(m.power, 2));
    $("statPower").innerHTML = `${fmt(m.power, 2)} <small>kW</small>`;
    $("statEnergy").innerHTML = `${fmt(m.dailyEnergy, 1)} <small>kWh</small>`;
    $("statEfficiency").innerHTML = `${fmt(m.efficiency, 1)}<small>%</small>`;
    const coverage = state.demand > 0 ? Math.min(100, (m.dailyEnergy / state.demand) * 100) : 100;
    $("statCoverage").innerHTML = `${fmt(coverage, 0)}<small>%</small>`;
    setText("coverageFoot", m.dailyEnergy >= state.demand ? "Daily generation meets total demand" : "Additional energy may be needed");
    setProgress("energyProgress", Math.min(100, m.dailyEnergy / 25 * 100));
    setProgress("efficiencyProgress", m.efficiency / 25 * 100);
    setProgress("coverageProgress", coverage);
    setText("heroCapacity", `${fmt(state.capacity, 1)} kW`);
    setText("heroDaily", `${fmt(m.dailyEnergy, 1)} kWh`);
    setText("resultPower", `${fmt(m.power, 2)} kW`);
    $("resultPower").innerHTML = `${fmt(m.power, 2)} <small>kW</small>`;
    setText("powerExplanation", `${fmt(ratedPercent, 1)}% of rated array capacity`);
    setText("ringPercent", `${fmt(ratedPercent, 0)}%`);
    $("powerRing").style.background = `conic-gradient(var(--green) 0 ${clamp(ratedPercent, 0, 100)}%, #26382c ${clamp(ratedPercent, 0, 100)}% 100%)`;
    setText("temperatureFactor", `${fmt(m.tempFactor * 100, 1)}%`);
    setText("combinedFactor", `${fmt(m.combinedFactor * 100, 1)}%`);
    setText("resultDaily", `${fmt(m.dailyEnergy, 1)} kWh`);
    setText("panelArea", `${fmt(m.area, 1)} m²`);
    setText("resultInsight", `At these settings, your simulated array can produce an estimated ${fmt(m.dailyEnergy, 1)} kWh on a typical modeled day.`);
    setText("peakOutput", `Peak ${fmtPower(m.power)}`);
    setText("irradianceSummary", `At ${fmt(state.irradiance, 0)} W/m²: ${fmtPower(m.power)}`);
  }

  function baseChartOptions(yTitle) {
    return {
      responsive: true, maintainAspectRatio: false, animation: { duration: 250 },
      interaction: { intersect: false, mode: "index" },
      plugins: {
        legend: { display: false },
        tooltip: { backgroundColor: "#15251b", titleColor: "#eaf6eb", bodyColor: "#bfd3c2", borderColor: "#38533b", borderWidth: 1, padding: 10, displayColors: false }
      },
      scales: {
        x: { grid: { color: "#1c2b21", drawBorder: false }, ticks: { color: "#819487", font: { family: "DM Sans", size: 9 }, maxRotation: 0 }, border: { display: false } },
        y: { beginAtZero: true, grid: { color: "#1c2b21", drawBorder: false }, ticks: { color: "#819487", font: { family: "DM Sans", size: 9 }, maxTicksLimit: 5 }, border: { display: false }, title: { display: false, text: yTitle } }
      }
    };
  }

  function initCharts() {
    if (!window.Chart) {
      document.querySelectorAll(".chart-wrap").forEach((wrap) => {
        wrap.innerHTML = '<p class="tiny-note">Charts need an internet connection to load the Chart.js library.</p>';
      });
      return;
    }
    const dailyCtx = $("dailyChart").getContext("2d");
    const grad = dailyCtx.createLinearGradient(0, 0, 0, 230);
    grad.addColorStop(0, "rgba(157,230,108,0.27)");
    grad.addColorStop(1, "rgba(157,230,108,0.01)");
    dailyChart = new Chart(dailyCtx, {
      type: "line",
      data: { labels: ["6 AM", "7 AM", "8 AM", "9 AM", "10 AM", "11 AM", "12 PM", "1 PM", "2 PM", "3 PM", "4 PM", "5 PM", "6 PM"], datasets: [{ data: [], borderColor: "#9de66c", backgroundColor: grad, fill: true, tension: .38, pointRadius: 0, pointHoverRadius: 4, pointHoverBackgroundColor: "#c5f7a6", borderWidth: 2 }] },
      options: { ...baseChartOptions("Power (kW)"), plugins: { ...baseChartOptions().plugins, tooltip: { ...baseChartOptions().plugins.tooltip, callbacks: { label: (ctx) => `${fmt(ctx.parsed.y, 2)} kW` } } } }
    });
    const irrCtx = $("irradianceChart").getContext("2d");
    irradianceChart = new Chart(irrCtx, {
      type: "line",
      data: { labels: [], datasets: [{ data: [], borderColor: "#78baff", backgroundColor: "rgba(120,186,255,.10)", fill: true, tension: .25, pointRadius: 2, pointBackgroundColor: "#78baff", borderWidth: 2 }] },
      options: { ...baseChartOptions("Power (kW)"), plugins: { ...baseChartOptions().plugins, tooltip: { ...baseChartOptions().plugins.tooltip, callbacks: { label: (ctx) => `${fmt(ctx.parsed.y, 2)} kW` } } } }
    });
    const mpptCtx = $("mpptChart").getContext("2d");
    mpptChart = new Chart(mpptCtx, {
      type: "line",
      data: { datasets: [
        { label: "PV power curve", data: [], parsing: false, borderColor: "#9de66c", backgroundColor: "rgba(157,230,108,.07)", fill: true, tension: .25, pointRadius: 0, borderWidth: 2 },
        { label: "Operating point", data: [], parsing: false, showLine: false, pointRadius: 5, pointBackgroundColor: "#e9c36a", pointBorderColor: "#fff0b5", pointBorderWidth: 1 },
        { label: "Maximum power point", data: [], parsing: false, showLine: false, pointRadius: 5, pointBackgroundColor: "#78baff", pointBorderColor: "#d5eaff", pointBorderWidth: 1 }
      ] },
      options: { ...baseChartOptions("Power (W)"), parsing: false, scales: { x: { type: "linear", min: 0, max: 50, title: { display: true, text: "Voltage (V)", color: "#829589", font: { size: 9 } }, grid: { color: "#1c2b21" }, ticks: { color: "#819487", font: { size: 9 } }, border: { display: false } }, y: { beginAtZero: true, title: { display: true, text: "Power (W)", color: "#829589", font: { size: 9 } }, grid: { color: "#1c2b21" }, ticks: { color: "#819487", font: { size: 9 } }, border: { display: false } } }, plugins: { ...baseChartOptions().plugins, tooltip: { ...baseChartOptions().plugins.tooltip, callbacks: { label: (ctx) => ` ${fmt(ctx.parsed.y, 1)} W` } } } }
    });
    updateCharts(calculate());
  }

  function updateCharts(m) {
    if (!dailyChart || !irradianceChart || !mpptChart) return;
    const timeProfile = [0, .08, .25, .46, .68, .86, 1, .94, .79, .58, .35, .14, 0];
    dailyChart.data.datasets[0].data = timeProfile.map((factor) => m.power * factor);
    dailyChart.update("none");

    const levels = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100];
    irradianceChart.data.labels = levels.map(String);
    irradianceChart.data.datasets[0].data = levels.map((g) => state.capacity * (g / 1000) * m.tempFactor * m.systemFactor);
    irradianceChart.update("none");
    updateMpptChart();
  }

  // Normalized illustrative PV P-V curve: power peaks near 0.72 * Voc.
  function mpptPowerAt(voltage) {
    const voc = 50;
    const vmp = 36;
    const pmax = Math.max(20, state.capacity * 1000 * 0.20 * (state.irradiance / 1000) * calculate().tempFactor * calculate().systemFactor);
    const x = clamp(voltage / voc, 0, 1);
    const peakX = vmp / voc;
    // Smooth curve with zero power at 0V and Voc, peaking at Vmp.
    const shape = x <= 0 ? 0 : Math.pow(x / peakX, 0.8) * Math.exp(1 - Math.pow(x / peakX, 0.8)) * (1 - Math.pow(x, 5));
    const peakShape = Math.pow(1, 0.8) * Math.exp(0) * (1 - Math.pow(peakX, 5));
    return pmax * shape / peakShape;
  }

  function updateMpptChart() {
    if (!mpptChart) return;
    const maxV = 50;
    const curve = [];
    for (let v = 0; v <= maxV; v += 1) curve.push({ x: v, y: mpptPowerAt(v) });
    let best = curve.reduce((a, b) => b.y > a.y ? b : a, curve[0]);
    const operating = { x: state.voltage, y: mpptPowerAt(state.voltage) };
    mpptChart.data.datasets[0].data = curve;
    mpptChart.data.datasets[1].data = [operating];
    mpptChart.data.datasets[2].data = [best];
    mpptChart.update("none");
    setText("operatingPower", `${fmt(operating.y, 1)} W`);
    setText("mppPower", `${fmt(best.y, 1)} W @ ${fmt(best.x, 0)} V`);
    const diff = best.y > 0 ? (1 - operating.y / best.y) * 100 : 0;
    setText("mppDifference", `${fmt(clamp(diff, 0, 100), 1)}%`);
  }

  function updateEnergy(m) {
    const demand = state.demand;
    const solar = m.dailyEnergy;
    const selfUsed = Math.min(solar, demand);
    const surplus = Math.max(solar - demand, 0);
    const deficit = Math.max(demand - solar, 0);
    const mode = document.querySelector('input[name="systemMode"]:checked').value;
    $("batteryField").classList.toggle("hidden", mode !== "standalone");
    setText("solarAvailable", `${fmt(solar, 1)} kWh`);
    setText("demandLabel", `${fmt(demand, 1)} kWh`);
    setProgress("solarBar", solar / Math.max(solar, demand, 0.1) * 100);
    setProgress("demandBar", demand / Math.max(solar, demand, 0.1) * 100);
    if (mode === "grid") {
      setText("balanceTitle", solar >= demand ? "Solar covers your daily demand" : "Additional grid energy needed");
      setText("balanceDescription", solar >= demand ? "Estimated generation is greater than or equal to daily consumption." : "Estimated solar generation is below daily consumption.");
      setText("metricOneLabel", "Potential self-used solar");
      setText("metricOne", `${fmt(selfUsed, 1)} kWh`);
      setText("metricTwoLabel", "Potential surplus export");
      setText("metricTwo", `${fmt(surplus, 1)} kWh`);
      setText("metricThreeLabel", "Grid energy needed");
      setText("metricThree", `${fmt(deficit, 1)} kWh`);
      setText("balanceDisclaimer", "Daily totals do not show when energy is generated or used. Real self-consumption, grid imports, and exports depend on the timing of solar production and demand.");
    } else {
      const battery = state.battery;
      const energyAvailable = solar + battery;
      const unmet = Math.max(demand - energyAvailable, 0);
      const leftover = Math.max(energyAvailable - demand, 0);
      setText("balanceTitle", unmet <= 0 ? "Demand met in this simplified scenario" : "Backup energy may be insufficient");
      setText("balanceDescription", unmet <= 0 ? "Modeled solar energy plus the entered usable battery buffer meets the daily total." : "Modeled solar energy plus the entered usable battery buffer is below daily demand.");
      setText("metricOneLabel", "Solar energy used");
      setText("metricOne", `${fmt(Math.min(solar, demand), 1)} kWh`);
      setText("metricTwoLabel", "Battery buffer entered");
      setText("metricTwo", `${fmt(Math.min(battery, Math.max(demand - solar, 0)), 1)} kWh`);
      setText("metricThreeLabel", "Unmet daily demand");
      setText("metricThree", `${fmt(unmet, 1)} kWh`);
      setText("balanceDisclaimer", `Simplified standalone comparison: ${fmt(solar, 1)} kWh estimated solar + ${fmt(battery, 1)} kWh entered usable battery energy. This is not a battery-sizing recommendation; charging timing, reserve limits, conversion losses, and cloudy-day autonomy are not modeled.`);
    }
  }

  function updateAll() {
    readInputs();
    updateLabels();
    const m = calculate();
    updateSolarUI(m);
    updateCharts(m);
    updateEnergy(m);
  }

  function showToast(message) {
    const toast = $("toast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
  }

  function exportCSV() {
    readInputs();
    const m = calculate();
    const mode = document.querySelector('input[name="systemMode"]:checked').value;
    const rows = [
      ["SolarSmart — Educational Simulation Report", "Value"],
      ["Generated at", new Date().toLocaleString()],
      ["System mode", mode === "grid" ? "Grid-connected" : "Standalone"],
      ["Array rated capacity (kW)", state.capacity],
      ["Solar irradiance (W/m²)", state.irradiance],
      ["PV cell temperature (°C)", state.temperature],
      ["Other system performance factor (%)", state.losses],
      ["Equivalent peak-sun hours (h/day)", state.sunHours],
      ["Temperature correction factor (%)", fmt(m.tempFactor * 100, 2)],
      ["Estimated PV power (kW)", fmt(m.power, 3)],
      ["Estimated daily solar energy (kWh/day)", fmt(m.dailyEnergy, 3)],
      ["Assumed panel area (m²)", fmt(m.area, 2)],
      ["Estimated household demand (kWh/day)", state.demand],
      ["Potential self-used solar (kWh/day)", fmt(Math.min(m.dailyEnergy, state.demand), 3)],
      ["Potential surplus (kWh/day)", fmt(Math.max(m.dailyEnergy - state.demand, 0), 3)],
      ["Grid energy needed (kWh/day)", fmt(Math.max(state.demand - m.dailyEnergy, 0), 3)],
      ["Battery energy entered (kWh)", mode === "standalone" ? state.battery : "Not applicable"],
      ["Model note", "Educational estimates only; not live data or an engineering design."],
    ];
    const csv = rows.map((row) => row.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(",")).join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "solarsmart-report.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast("Your SolarSmart CSV report has been exported.");
  }

  function init() {
    inputs.forEach((id) => {
      const element = $(id);
      if (!element) return;
      element.addEventListener("input", () => {
        if (id === "demand") {
          const v = Number(element.value);
          if (!Number.isFinite(v) || v <= 0) return;
        }
        if (id === "battery") {
          const v = Number(element.value);
          if (!Number.isFinite(v) || v < 0) return;
        }
        updateAll();
      });
      element.addEventListener("change", updateAll);
    });

    document.querySelectorAll('input[name="systemMode"]').forEach((radio) => radio.addEventListener("change", updateAll));
    document.querySelectorAll("[data-demand]").forEach((button) => {
      button.addEventListener("click", () => {
        $("demand").value = button.dataset.demand;
        document.querySelectorAll("[data-demand]").forEach((b) => b.classList.toggle("selected", b === button));
        updateAll();
      });
    });
    $("demand").addEventListener("input", () => {
      document.querySelectorAll("[data-demand]").forEach((b) => b.classList.toggle("selected", Number(b.dataset.demand) === Number($("demand").value)));
    });
    $("resetButton").addEventListener("click", () => {
      Object.entries(defaults).forEach(([id, value]) => { $(id).value = value; });
      document.querySelector('input[name="systemMode"][value="grid"]').checked = true;
      document.querySelectorAll("[data-demand]").forEach((b) => b.classList.toggle("selected", Number(b.dataset.demand) === defaults.demand));
      updateAll();
      showToast("All simulator inputs reset to default values.");
    });
    $("trackMpp").addEventListener("click", () => {
      $("voltage").value = 36;
      updateAll();
      showToast("Operating voltage moved to the illustrative maximum power point.");
    });
    $("downloadReport").addEventListener("click", exportCSV);

    $("menuButton").addEventListener("click", () => $("sidebar").classList.toggle("open"));
    document.querySelectorAll(".nav-link").forEach((link) => {
      link.addEventListener("click", () => {
        document.querySelectorAll(".nav-link").forEach((a) => a.classList.toggle("active", a === link));
        setText("pageName", link.textContent.trim().replace(/^[▦☼⌁↗ϟ]\s*/, ""));
        $("sidebar").classList.remove("open");
      });
    });

    initCharts();
    updateAll();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
