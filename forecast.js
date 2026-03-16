const LAT = 30.3816;
const LON = -86.8636;
const TZ = "America/Chicago";

// NOAA Station for Pensacola
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

// Better directional averaging
function averageWindDirection(directions) {
  let x = 0;
  let y = 0;

  for (const deg of directions) {
    const rad = deg * Math.PI / 180;
    x += Math.cos(rad);
    y += Math.sin(rad);
  }

  let avg = Math.atan2(y, x) * 180 / Math.PI;
  if (avg < 0) avg += 360;
  return avg;
}

// Any east wind should hurt.
// Stronger penalty for ENE/E/ESE and higher speeds.
function eastWindPenalty(windDir, windSpeed) {
  if (windDir < 45 || windDir > 135) return 0;

  let penalty = 8; // any east component hurts

  // stronger for direct east
  if (windDir >= 70 && windDir <= 110) penalty += 5;

  // stronger when it is blowing harder
  if (windSpeed >= 15) penalty += 6;
  else if (windSpeed >= 10) penalty += 3;

  return penalty;
}

// Short-period chop usually feels worse than raw wave height suggests
function shortPeriodPenalty(period) {
  if (period <= 4) return 14;
  if (period <= 5) return 10;
  if (period <= 6) return 6;
  if (period <= 7) return 3;
  return 0;
}

// Convert offshore wave height into a more realistic surf/chop estimate
// for your area without letting long period magically erase bad conditions.
function estimateSurfHeight(offshore, period) {
  let factor = 0.85;

  if (period >= 10) factor = 1.15;
  else if (period >= 8) factor = 1.0;
  else if (period >= 6) factor = 0.9;
  else factor = 0.85;

  return offshore * factor;
}

/* ---------------------------
   Pressure Trend (24hr)
---------------------------- */
function pressureTrendBonus(startPressure, endPressure) {
  const change = endPressure - startPressure;

  if (change <= -2.0) return 18;
  if (change <= -1.0) return 14;
  if (change <= -0.5) return 10;
  if (change < 0) return 6;

  if (change < 0.5) return 2;
  if (change < 1.5) return -8;

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
function fishingScore(surf, offshore, period, wind, water, windDir, tideBonus, pressureBonus, air) {
  let score = 100;

  // base conditions
  score -= surf * 12;
  score -= offshore * 14;
  score -= wind * 2.2;

  // east wind penalty
  score -= eastWindPenalty(windDir, wind);

  // short-period chop penalty
  score -= shortPeriodPenalty(period);

  // direct south wind penalty still useful for local conditions
  if (windDir >= 135 && windDir <= 225) score -= 8;

  if (water >= 65 && water <= 80) score += 8;

  score += tideBonus;
  score += pressureBonus;
  score += airTempPenalty(air);

  return Math.max(0, Math.min(100, score));
}

/* ---------------------------
   Kayak Score
---------------------------- */
function kayakScore(surf, offshore, period, wind, water, air, windDir) {
  let score = 100;

  score -= surf * 14;
  score -= offshore * 16;
  score -= wind * 2.2;

  // any east wind hurts kayak comfort/safety
  score -= eastWindPenalty(windDir, wind);

  // short, steep period is bad for kayak
  score -= shortPeriodPenalty(period) * 1.2;

  // north wind handling
  if (windDir >= 315 || windDir <= 45) {
    if (wind >= 20) score -= 18;
    else if (wind >= 15) score -= 14;
    else if (wind >= 10) score -= 9;
    else score -= 4;
  }

  if ((water + air) < 120) score -= 20;

  score += airTempPenalty(air);

  return Math.max(0, Math.min(100, score));
}

/* ---------------------------
   Label Logic
---------------------------- */
function fishingLabel(score, offshore, period, windDir, wind) {
  let label = "Poor";

  if (score >= 85) label = "Excellent";
  else if (score >= 65) label = "Good";
  else if (score >= 45) label = "Fair";
  else label = "Poor";

  // Hard caps based on offshore wave height
  if (offshore > 1.0) return "Poor";
  if (offshore > 0.5 && (label === "Excellent" || label === "Good")) {
    label = "Fair";
  }

  // East wind + short period should never look "great"
  if (windDir >= 45 && windDir <= 135 && period <= 6) {
    if (label === "Excellent") label = "Fair";
    else if (label === "Good") label = "Fair";
  }

  // Strong east wind should force it down further
  if (eastWindPenalty(windDir, wind) >= 13 && label === "Fair") {
    label = "Poor";
  }

  return label;
}

function kayakDifficultyLabel(surf, offshore, period, comfort, score, windDir, wind) {
  let label = "Extreme";

  // Start from score buckets
  if (score >= 90) label = "Easy";
  else if (score >= 78) label = "Moderate";
  else if (score >= 66) label = "Challenging";
  else if (score >= 54) label = "Difficult";
  else if (score >= 42) label = "Very Difficult";
  else label = "Extreme";

  // Hard overrides for rough conditions
  if (offshore > 1.5) return "Extreme";
  if (offshore > 1.0) return "Very Difficult";
  if (offshore > 0.75 && (label === "Easy" || label === "Moderate")) {
    label = "Challenging";
  }

  // East wind + short period makes small surf feel worse
  if (windDir >= 45 && windDir <= 135 && period <= 6) {
    if (label === "Easy") label = "Challenging";
    else if (label === "Moderate") label = "Challenging";
    else if (label === "Challenging") label = "Difficult";
    else if (label === "Difficult") label = "Very Difficult";
  }

  // Strong wind bumps difficulty
  if (wind >= 18) {
    if (label === "Easy") label = "Challenging";
    else if (label === "Moderate") label = "Difficult";
    else if (label === "Challenging") label = "Very Difficult";
    else label = "Extreme";
  } else if (wind >= 12) {
    if (label === "Easy") label = "Moderate";
    else if (label === "Moderate") label = "Challenging";
    else if (label === "Challenging") label = "Difficult";
  }

  // Cold water + air makes it more demanding
  if (comfort < 120) {
    if (label === "Easy") label = "Moderate";
    else if (label === "Moderate") label = "Challenging";
    else if (label === "Challenging") label = "Difficult";
  }

  return label;
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
        windDirs: [],
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
      data[date].windDirs.push(weather.hourly.wind_direction_10m[i]);
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
    const surf = estimateSurfHeight(offshore, period);

    const wind = d.wind / d.count;
    const windDir = averageWindDirection(d.windDirs);
    const water = d.water / d.count;
    const air = d.air / d.count;
    const comfort = water + air;

    const pressureBonus = pressureTrendBonus(d.pressureStart, d.pressureEnd);

    const fishScore = fishingScore(
      surf, offshore, period, wind, water, windDir,
      tideBonus, pressureBonus, air
    );

    const kayakScoreVal = kayakScore(
      surf, offshore, period, wind, water, air, windDir
    );

    const surfDisplay = surf < 1 ? `${surf.toFixed(1)} ft` : `${surf.toFixed(1)} ft`;

    console.log(
      `${date} | Surf: ${surfDisplay} | Offshore: ${offshore.toFixed(1)} ft @${period.toFixed(0)}s | ` +
      `Wind: ${wind.toFixed(0)}mph ${degToCardinal(windDir)} | ` +
      `Water: ${water.toFixed(0)}°F | Air: ${air.toFixed(0)}°F | ` +
      `Fishing: ${fishingLabel(fishScore, offshore, period, windDir, wind)} | ` +
      `Kayak difficulty: ${kayakDifficultyLabel(surf, offshore, period, comfort, kayakScoreVal, windDir, wind)}`
    );
  }
}

run();
