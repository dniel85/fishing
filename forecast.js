const LAT = 30.3816;
const LON = -86.8636;

const TZ = "America/Chicago";

function degToCardinal(d) {
  const dirs = ["N","NE","E","SE","S","SW","W","NW"];
  return dirs[Math.round(d / 45) % 8];
}

function fishingScore(wave, wind, water, windDir, tideBonus) {
  let score = 100;
  score -= wave * 10;
  score -= wind * 2;

  // Onshore penalty
  if (windDir >= 135 && windDir <= 225) score -= 10;

  // Water temp bonus
  if (water >= 65 && water <= 80) score += 8;

  score += tideBonus;

  return score;
}

function kayakScore(wave, period, wind, water, air, windDir, tideBonus) {
  let score = 100;
  score -= wave * 12;
  score -= wind * 1.8;

  // Onshore
  if (windDir >= 135 && windDir <= 225) score -= 10;

  // North illusion penalty
  if (windDir >= 315 || windDir <= 45) {
    if (wind >= 20) score -= 18;
    else if (wind >= 15) score -= 14;
    else if (wind >= 10) score -= 9;
    else score -= 4;
  }

  // Comfort penalty
  if ((water + air) < 120) score -= 20;

  // Swell power bonus
  score += (wave * period) / 2;

  score += tideBonus;

  return score;
}

function fishingLabel(score) {
  if (score >= 80) return "Excellent";
  if (score >= 60) return "Good";
  if (score >= 40) return "Fair";
  return "Poor";
}

function kayakLabel(wave, comfort, score) {
  if (wave <= 1.5 && comfort >= 120) return "Perfect";
  if (wave <= 1.5 && comfort < 120) return "Good";
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

    if (hour >= 4 && hour <= 9) {

      if (!data[date]) {
        data[date] = {
          wave: 0, period: 0, wind: 0,
          windDir: 0, water: 0, air: 0,
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

    const wave = Math.max(0, (d.wave / d.count) - 0.5); // Subtract 0.5 ft for beginner-friendly conditions or edit the 0.5 value to adjust the beginner-friendly threshold
    const period = d.period / d.count;
    const wind = d.wind / d.count;
    const windDir = d.windDir / d.count;
    const water = d.water / d.count;
    const air = d.air / d.count;

    const comfort = water + air;
    const tideBonus = 0;

    const fishScore = fishingScore(wave, wind, water, windDir, tideBonus);
    const kayakScoreVal = kayakScore(wave, period, wind, water, air, windDir, tideBonus);

    const surfDisplay = wave < 1 ? "Flat" : `${wave.toFixed(1)} ft`;

    console.log(
      `${date} | Surf: ${surfDisplay}@${period.toFixed(0)}s | ` +
      `Wind: ${wind.toFixed(0)}mph ${degToCardinal(windDir)} | ` +
      `Water: ${water.toFixed(0)}°F | Air: ${air.toFixed(0)}°F | ` +
      `Fishing: ${fishingLabel(fishScore)} | ` +
      `Kayak: ${kayakLabel(wave, comfort, kayakScoreVal)}`
    );
  }
}

run();
