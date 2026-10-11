# SolarSmart

A static, front-end-only educational solar PV simulator made with HTML, CSS, and JavaScript. It can be hosted on Netlify without a backend.

## Files
- `index.html` — application structure
- `style.css` — responsive dark dashboard design
- `script.js` — PV estimates, energy balance, MPPT curve, charts, and CSV export

## Run locally
1. Open this folder in VS Code.
2. Install the **Live Server** extension, if you do not already have it.
3. Right-click `index.html` and select **Open with Live Server**.
4. The website opens in your browser. Chart.js and Google Fonts use CDNs, so an internet connection is needed for those external assets.

You can also open `index.html` directly in a browser; Live Server is recommended for a consistent local workflow.

## Deploy to Netlify
1. Visit https://SolarSmart1.netlify.app .

## Model assumptions and limitations
- Solar power is estimated as rated capacity × irradiance/1000 × temperature factor × additional system performance factor.
- Daily energy is estimated from rated capacity × equivalent peak-sun hours × temperature factor × system performance factor.
- The model is simplified for learning and does not include a detailed diode-equation PV model, weather forecast, location-specific irradiance, shading geometry, inverter dynamics, or measured sensor data.
- The MPPT chart is a normalized illustrative P–V curve and is not a model of a named panel's datasheet.
- Grid energy balance is based on daily totals; actual self-consumption/import/export depends on time-matched generation and load.
- Standalone battery mode is a simplified daily energy buffer comparison, not a battery sizing tool.
- The charts require Chart.js from jsDelivr. Fonts load from Google Fonts. If external access is unavailable, the core calculator still runs, but chart rendering may not be available.
