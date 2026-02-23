const LAT = 30.3816;
const LON = -86.8636;
const TZ = "America/Chicago";

// NOAA Station for Pensacola (adjust if needed)
const NOAA_STATION = "8729840";

/* ---------------------------
   Safe Fetch with Retry
---------------------------- */
async function safeFetch(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(20000)
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (i === retries - 1) {
        console.error("Final fetch failure:", err.message);
        return null;
      }
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

/* ---------------------------
   Helpers
---------------------------- */
function degToCardinal(d) {
  const dirs = ["N","NE","E","SE","S","SW","W","NW"];
  return dirs[Math.round(d / 45) % 8];
}

function airTempPenalty(air) {
  if (air < 50) return -15;
  if (air < 55) return -10;
  if (air < 60) return -5;

  if (air > 105) return -15;
  if (air > 100) return -10;
  if (air > 95) return -5;

  return 0;
}

/* ---------------------------
   Pressure Trend (24hr)
---------------------------- */
function pressureTrendBonus(startPressure, endPressure) {
  const change = endPressure - startPressure;

  // Strong falling
  if (change <= -2.0) return 18;
  if (change <= -1.0) return 14;
  if (change <= -0.5) return 10;
  if (change < 0) return 6;

  // Slight rising
  if (change < 0.5) return 2;

  // Moderate rising
  if (change < 1.5) return -8;

  // Strong rising
  return -16;
}

/* ---------------------------
   Tide Coefficient
---------------------------- */
function tidalCoefficient(high, low, averageRange = 1.2) {
  const range = high - low;
  return (range / averageRange) * 100;
}

function tidalCoefficientBonus(coeff) {
  if (coeff >= 110) return 15;
  if (coeff >= 95) return 10;
  if (coeff >= 80) return 5;
  if (coeff >= 60) return 0;
  return -8;
}

/* ---------------------------
   Fishing Score
---------------------------- */
function fishingScore(surf, wind, water, windDir, tideBonus, pressureBonus, air) {
  let score = 100;

  score -= surf * 10;
  score -= wind * 2;

  if (windDir >= 135 && windDir <= 225) score -= 10;
  if (water >= 65 && water <= 80) score += 8;

  score += tideBonus;
  score += pressureBonus;
  score += airTempPenalty(air);

  return score;
}

/* ---------------------------
   Kayak Score
---------------------------- */
function kayakScore(surf, period, wind, water, air, windDir) {
  let score = 100;

  score -= surf * 12;
  score -= wind * 1.8;

  if (windDir >= 135 && windDir <= 225) score -= 10;

  if (windDir >= 315 || windDir <= 45) {
    if (wind >= 20) score -= 18;
    else if (wind >= 15) score -= 14;
    else if (wind >= 10) score -= 9;
    else score -= 4;
  }

  if ((water + air) < 120) score -= 20;

  score += (surf * period) / 2;
  score += airTempPenalty(air);

  return score;
}

function fishingLabel(score) {
  if (score >= 85) return "Excellent";
  if (score >= 65) return "Good";
  if (score >= 45) return "Fair";
  return "Poor";
}

function kayakLabel(surf, comfort, score) {
  if (surf <= 1.5 && comfort >= 120) return "Perfect";
  if (surf <= 1.5 && comfort < 120) return "Good";
  if (score >= 85) return "Good";
  if (score >= 65) return "Fair";
  if (score >= 45) return "Not Good";
  return "Don't Go";
}

/* ---------------------------
   Main Runner
---------------------------- */
async function run() {

  console.log("Fetching marine & weather data...");

  const marine = await safeFetch(
    `https://marine-api.open-meteo.com/v1/marine?latitude=${LAT}&longitude=${LON}&hourly=wave_height,wave_period,sea_surface_temperature&forecast_days=7&timezone=${TZ}`
  );

  const weather = await safeFetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&hourly=wind_speed_10m,wind_direction_10m,temperature_2m,surface_pressure&forecast_days=7&timezone=${TZ}`
  );

  if (!marine || !weather) {
    console.log("API unavailable.");
    return;
  }

  console.log("Fetching NOAA tide data...");

  const today = new Date();
  const start = today.toISOString().slice(0,10).replace(/-/g,"");
  const end = start;

  const tideData = await safeFetch(
    `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?product=predictions&application=marine_app&begin_date=${start}&end_date=${end}&datum=MLLW&station=${NOAA_STATION}&time_zone=lst_ldt&units=english&interval=hilo&format=json`
  );

  let tideBonus = 0;

  if (tideData && tideData.predictions) {
    const highs = tideData.predictions.filter(p => p.type === "H").map(p => parseFloat(p.v));
    const lows = tideData.predictions.filter(p => p.type === "L").map(p => parseFloat(p.v));

    if (highs.length && lows.length) {
      const high = Math.max(...highs);
      const low = Math.min(...lows);
      const coeff = tidalCoefficient(high, low);
      tideBonus = tidalCoefficientBonus(coeff);
    }
  }

  const data = {};

  for (let i = 0; i < marine.hourly.time.length; i++) {

    const [date, time] = marine.hourly.time[i].split("T");
    const hour = parseInt(time.split(":")[0], 10);

    if (!data[date]) {
      data[date] = {
        wave: 0,
        period: 0,
        wind: 0,
        windDir: 0,
        water: 0,
        air: 0,
        pressureStart: null,
        pressureEnd: null,
        count: 0
      };
    }

    const pressure = weather.hourly.surface_pressure[i];

    if (hour === 0) data[date].pressureStart = pressure;
    if (hour === 23) data[date].pressureEnd = pressure;

    if (hour >= 4 && hour <= 9) {
      data[date].wave += marine.hourly.wave_height[i] * 3.28084;
      data[date].period += marine.hourly.wave_period[i];
      data[date].wind += weather.hourly.wind_speed_10m[i] * 0.621371;
      data[date].windDir += weather.hourly.wind_direction_10m[i];
      data[date].water += marine.hourly.sea_surface_temperature[i] * 9/5 + 32;
      data[date].air += weather.hourly.temperature_2m[i] * 9/5 + 32;
      data[date].count++;
    }
  }

  for (const date of Object.keys(data).sort()) {

    const d = data[date];
    if (!d.count || d.pressureStart === null || d.pressureEnd === null) continue;

    const offshore = d.wave / d.count;
    const period = d.period / d.count;

    const reduction = Math.max(0.3, 1.8 - (period * 0.15));
    const surf = Math.max(0, offshore - reduction);

    const wind = d.wind / d.count;
    const windDir = d.windDir / d.count;
    const water = d.water / d.count;
    const air = d.air / d.count;
    const comfort = water + air;

    const pressureBonus = pressureTrendBonus(
      d.pressureStart,
      d.pressureEnd
    );

    const fishScore = fishingScore(
      surf, wind, water, windDir,
      tideBonus, pressureBonus, air
    );

    const kayakScoreVal = kayakScore(
      surf, period, wind, water, air, windDir
    );

    const surfDisplay = surf < 1 ? "Flat" : `${surf.toFixed(1)} ft`;

    console.log(
      `${date} | Surf: ${surfDisplay} | Offshore: ${offshore.toFixed(1)} ft @${period.toFixed(0)}s | ` +
      `Wind: ${wind.toFixed(0)}mph ${degToCardinal(windDir)} | ` +
      `Water: ${water.toFixed(0)}°F | Air: ${air.toFixed(0)}°F | ` +
      `Fishing: ${fishingLabel(fishScore)} | ` +
      `Kayak: ${kayakLabel(surf, comfort, kayakScoreVal)}`
    );
  }
}

run();
