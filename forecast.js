const LAT = 30.3816;
const LON = -86.8636;
const TZ = "America/Chicago";

function degToCardinal(d) {
  const dirs = ["N","NE","E","SE","S","SW","W","NW"];
  return dirs[Math.round(d / 45) % 8];
}

function fishingScore(surf, wind, water, windDir, tideBonus) {
  let score = 100;

  score -= surf * 10;
  score -= wind * 2;

  // Onshore wind penalty (S/SE/SW)
  if (windDir >= 135 && windDir <= 225) score -= 10;

  // Water temp bonus
  if (water >= 65 && water <= 80) score += 8;

  score += tideBonus;

  return score;
}

function kayakScore(surf, period, wind, water, air, windDir, tideBonus) {
  let score = 100;

  score -= surf * 12;
  score -= wind * 1.8;

  // Onshore penalty
  if (windDir >= 135 && windDir <= 225) score -= 10;

  // North wind illusion penalty
  if (windDir >= 315 || windDir <= 45) {
    if (wind >= 20) score -= 18;
    else if (wind >= 15) score -= 14;
    else if (wind >= 10) score -= 9;
    else score -= 4;
  }

  // Cold discomfort penalty
  if ((water + air) < 120) score -= 20;

  // Swell power bonus
  score += (surf * period) / 2;

  score += tideBonus;

  return score;
}

function fishingLabel(score) {
  if (score >= 80) return "Excellent";
  if (score >= 60) return "Good";
  if (score >= 40) return "Fair";
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

async function run() {

  const marine = await fetch(
    `https://marine-api.open-meteo.com/v1/marine?latitude=${LAT}&longitude=${LON}&hourly=wave_height,wave_period,sea_surface_temperature&forecast_days=7&timezone=${TZ}`
  ).then(r => r.json());

  const weather = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&hourly=wind_speed_10m,wind_direction_10m,temperature_2m&forecast_days=7&timezone=${TZ}`
  ).then(r => r.json());

  const data = {};

  for (let i = 0; i < marine.hourly.time.length; i++) {

    const [date, time] = marine.hourly.time[i].split("T");
    const hour = parseInt(time.split(":")[0], 10);

    // Only 4am–9am window
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

      // Convert meters → feet
      data[date].wave += marine.hourly.wave_height[i] * 3.28084;

      data[date].period += marine.hourly.wave_period[i];

      // Convert km/h → mph
      data[date].wind += weather.hourly.wind_speed_10m[i] * 0.621371;

      data[date].windDir += weather.hourly.wind_direction_10m[i];

      // Convert C → F
      data[date].water += marine.hourly.sea_surface_temperature[i] * 9/5 + 32;
      data[date].air += weather.hourly.temperature_2m[i] * 9/5 + 32;

      data[date].count++;
    }
  }

  for (const date of Object.keys(data).sort()) {

    const d = data[date];

    // Raw offshore wave
    const offshore = d.wave / d.count;

    // Adjusted surf (subtract 1.0 ft)
    const surf = Math.max(0, offshore - 1.0);

    const period = d.period / d.count;
    const wind = d.wind / d.count;
    const windDir = d.windDir / d.count;
    const water = d.water / d.count;
    const air = d.air / d.count;

    const comfort = water + air;
    const tideBonus = 0;

    // Use SURF for scoring
    const fishScore = fishingScore(surf, wind, water, windDir, tideBonus);
    const kayakScoreVal = kayakScore(surf, period, wind, water, air, windDir, tideBonus);

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
