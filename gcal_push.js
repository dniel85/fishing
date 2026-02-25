const { google } = require("googleapis");
const fs = require("fs");

// Mobile-safe color badge + fish scale
function fishScale(rating) {
  switch (rating) {
    case "Excellent":
      return { fish: "🐟🐟🐟🐟🐟", badge: "🟢" };
    case "Good":
      return { fish: "🐟🐟🐟🐟", badge: "🔵" };
    case "Fair":
      return { fish: "🐟🐟🐟", badge: "🟡" };
    case "Poor":
      return { fish: "🐟🐟", badge: "🔴" };
    default:
      return { fish: "🚫", badge: "⚫" };
  }
}

function addDaysISO(dateStr, days) {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
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

    for (const line of lines) {

      const dateMatch = line.match(/^(\d{4}-\d{2}-\d{2})/);
      if (!dateMatch) continue;

      const dateStr = dateMatch[1];

      const fishingMatch = line.match(/Fishing:\s*([A-Za-z']+)/);
      const fishing = fishingMatch ? fishingMatch[1] : "Fair";

      const surfMatch = line.match(/Surf:\s*([^|]+)/);
      const surfHeight = surfMatch ? surfMatch[1].trim() : "";

      const hazardMatch = line.match(/Hazard:\s*(.+)$/);
      const hazard = hazardMatch ? hazardMatch[1].trim() : "";

      const rating = fishScale(fishing);

      // CLEAN MOBILE LOOK (no "Navarre")
      const summary =
        `${rating.badge}${rating.fish}` +
        (surfHeight ? ` 🌊${surfHeight}` : "") +
        (hazard ? ` ⚠️${hazard}` : "");

      const eventId = `forecast${dateStr.replace(/-/g, "")}`;

      const requestBody = {
        id: eventId,
        summary,
        description: line,
        start: { date: dateStr },
        end: { date: addDaysISO(dateStr, 1) }, // all-day event
      };

      try {
        await calendar.events.insert({
          calendarId,
          requestBody,
        });

        console.log("Created:", dateStr);

      } catch (e) {

        if (e.code === 409) {
          await calendar.events.update({
            calendarId,
            eventId,
            requestBody,
          });

          console.log("Updated:", dateStr);
        } else {
          throw e;
        }
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
