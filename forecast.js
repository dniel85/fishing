const LAT = 30.3816;
const LON = -86.8636;
const TZ = "America/Chicago";

async function safeFetch(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(15000)
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
   Tide Models
---------------------------- */
function tideMovementBonus(start, end) {
  const change = end - start;
  const absChange = Math.abs(change);

  if (absChange < 0.1) return -8;
  if (absChange >= 0.4) return change > 0 ? 15 : 12;
  if (absChange >= 0.2) return change > 0 ? 10 : 8;

  return 5;
}

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


function fishingScore(surf, wind, water, windDir, tideBonus, air) {
  let score = 100;

  score -= surf * 10;
  score -= wind * 2;

  if (windDir >= 135 && windDir <= 225) score -= 10;
  if (water >= 65 && water <= 80) score += 8;

  score += tideBonus;
  score += airTempPenalty(air);

  return score;
}


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

// Main
async function run() {

  console.log("Fetching marine & weather data...");

  const marine = await safeFetch(
    `https://marine-api.open-meteo.com/v1/marine?latitude=${LAT}&longitude=${LON}&hourly=wave_height,wave_period,sea_surface_temperature&forecast_days=7&timezone=${TZ}`
  );

  const weather = await safeFetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&hourly=wind_speed_10m,wind_direction_10m,temperature_2m&forecast_days=7&timezone=${TZ}`
  );

  if (!marine || !weather) {
    console.log("API unavailable. Exiting gracefully.");
    return;
  }

  const data = {};

  for (let i = 0; i < marine.hourly.time.length; i++) {

    const [date, time] = marine.hourly.time[i].split("T");
    const hour = parseInt(time.split(":")[0], 10);

    if (hour >= 4 && hour <= 9) {

      if (!data[date]) {
        data[date] = {
          wave: 0,
          period: 0,
          wind: 0,
          windDir: 0,
          water: 0,
          air: 0,
          count: 0
        };
      }

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

    const offshore = d.wave / d.count;
    const period = d.period / d.count;

    const reduction = Math.max(0.3, 1.8 - (period * 0.15));
    const surf = Math.max(0, offshore - reduction);

    const wind = d.wind / d.count;
    const windDir = d.windDir / d.count;
    const water = d.water / d.count;
    const air = d.air / d.count;
    const comfort = water + air;

    const highTide = 1.8 + Math.random() * 0.5;
    const lowTide = 0.5 + Math.random() * 0.3;
    const coeff = tidalCoefficient(highTide, lowTide);
    const coeffBonus = tidalCoefficientBonus(coeff);

    const tideStart = 1.2 + Math.random() * 0.5;
    const tideEnd = 1.2 + Math.random() * 0.5;
    const movementBonus = tideMovementBonus(tideStart, tideEnd);

    const tideBonus = coeffBonus + movementBonus;

    const fishScore = fishingScore(
      surf, wind, water, windDir, tideBonus, air
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
