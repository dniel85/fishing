const { google } = require("googleapis");
const fs = require("fs");

function fishScale(rating) {
  switch (rating) {
    case "Excellent": return "🟢🐟🐟🐟🐟🐟";
    case "Good": return "🔵🐟🐟🐟🐟";
    case "Fair": return "🟡🐟🐟🐟";
    case "Poor": return "🔴🐟🐟";
    default: return "⚫🚫";
  }
}

function addDaysISO(dateStr, days) {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function readFileSafe(path) {
  try {
    return fs.readFileSync(path, "utf8").trim();
  } catch {
    return "";
  }
}

async function main() {
  try {
    console.log("Starting Google Calendar push...");

    const calendarId = process.env.GCAL_CALENDAR_ID;
    const serviceAccount = JSON.parse(process.env.GCAL_SA_KEY_JSON);

    serviceAccount.private_key =
      serviceAccount.private_key.replace(/\\n/g, "\n");

    const auth = new google.auth.JWT(
      serviceAccount.client_email,
      null,
      serviceAccount.private_key,
      ["https://www.googleapis.com/auth/calendar"]
    );

    await auth.authorize();

    const calendar = google.calendar({ version: "v3", auth });

    const lines = fs
      .readFileSync("forecast.txt", "utf8")
      .split("\n")
      .map(l => l.trim())
      .filter(Boolean);

    const surfHeight = readFileSafe("surf_height.txt");
    const hazard = readFileSafe("surf.txt");

    const todayISO = new Date().toISOString().slice(0, 10);
    const maxISO = addDaysISO(todayISO, 7);

    for (const line of lines) {
      const dateMatch = line.match(/^(\d{4}-\d{2}-\d{2})/);
      if (!dateMatch) continue;

      const dateStr = dateMatch[1];
      if (dateStr < todayISO || dateStr > maxISO) continue;

      const fishingMatch = line.match(/Fishing:\s*([A-Za-z']+)/);
      const fishing = fishingMatch ? fishingMatch[1] : "Fair";

      const fishDisplay = fishScale(fishing);

      const summary =
        `${fishDisplay} ${surfHeight ? "🌊 " + surfHeight + " " : ""}Navarre`;

      const description =
        `${line}\n\n` +
        (surfHeight ? `Surf: ${surfHeight}\n` : "") +
        (hazard ? `Hazard: ${hazard}\n` : "");

      const eventId = `navarre-${dateStr.replace(/-/g, "")}`;

      const requestBody = {
        summary,
        description,
        start: { date: dateStr },
        end: { date: addDaysISO(dateStr, 1) },
      };

      try {
        await calendar.events.get({ calendarId, eventId });

        await calendar.events.update({
          calendarId,
          eventId,
          requestBody,
        });

        console.log("Updated:", dateStr);

      } catch (err) {
        await calendar.events.insert({
          calendarId,
          requestBody: { ...requestBody, id: eventId },
        });

        console.log("Created:", dateStr);
      }
    }

    console.log("Done.");
  } catch (err) {
    console.error("Calendar push failed:");
    console.error(err.response?.data || err.message || err);
    process.exit(1);
  }
}

main();