const { google } = require("googleapis");
const fs = require("fs");

/* ================================
   Fish Emoji Scale
================================ */
function fishScale(rating) {
  switch (rating) {
    case "Excellent": return "🐟🐟🐟🐟🐟";
    case "Good": return "🐟🐟🐟🐟";
    case "Fair": return "🐟🐟🐟";
    case "Poor": return "🐟🐟";
    default: return "🚫";
  }
}

/* ================================
   Weekend Detection
================================ */
function isWeekend(date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

/* ================================
   Basic US Federal Holiday List
   (Simple fixed-date holidays)
================================ */
const usHolidays = [
  "01-01", // New Year
  "07-04", // Independence Day
  "11-11", // Veterans Day
  "12-25"  // Christmas
];

function isHoliday(date) {
  const mmdd = date.toISOString().slice(5, 10);
  return usHolidays.includes(mmdd);
}

/* ================================
   Main
================================ */
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
    console.log("Authenticated.");

    const calendar = google.calendar({ version: "v3", auth });

    const forecastLines = fs
      .readFileSync("forecast.txt", "utf8")
      .split("\n")
      .filter(line => line.trim().length > 0);

    const today = new Date();
    today.setHours(0,0,0,0);

    const next7 = new Date(today);
    next7.setDate(today.getDate() + 7);

    for (const line of forecastLines) {

      const dateMatch = line.match(/^(\d{4}-\d{2}-\d{2})/);
      if (!dateMatch) continue;

      const dateStr = dateMatch[1];
      const dateObj = new Date(dateStr);

      if (dateObj < today || dateObj > next7) continue;

      /* ================================
         Extract Fishing & Kayak
      ================================= */
      const fishingMatch = line.match(/Fishing:\s*(\w+)/);
      const fishing = fishingMatch ? fishingMatch[1] : "Fair";

      const kayakMatch = line.match(/Kayak:\s*(.+)$/);
      const kayak = kayakMatch ? kayakMatch[1].trim() : "";

      const fishDisplay = fishScale(fishing);

      /* ================================
         Color Coding
      ================================= */
      let colorId = "5"; // Yellow default

      switch (fishing) {
        case "Excellent": colorId = "2"; break; // Green
        case "Good": colorId = "9"; break;      // Blue
        case "Fair": colorId = "5"; break;      // Yellow
        case "Poor": colorId = "11"; break;     // Red
      }

      /* ================================
         Push Alert Logic
      ================================= */
      let reminders = { useDefault: false };

      if (kayak === "Perfect" &&
          (isWeekend(dateObj) || isHoliday(dateObj))) {

        reminders = {
          useDefault: false,
          overrides: [
            { method: "popup", minutes: 180 },
            { method: "popup", minutes: 60 }
          ]
        };
      }

      const summary =
        `${fishDisplay} ${kayak === "Perfect" ? "🔥" : ""} Navarre`;

      const cleanedDescription =
        line.replace(/Fishing:\s*[^|]+/, "").trim();

      /* ================================
         Delete Existing Bot Events
      ================================= */
      const existing = await calendar.events.list({
        calendarId,
        timeMin: new Date(dateStr + "T00:00:00Z").toISOString(),
        timeMax: new Date(dateStr + "T23:59:59Z").toISOString(),
        q: "Navarre",
        singleEvents: true,
      });

      for (const event of existing.data.items) {
        await calendar.events.delete({
          calendarId,
          eventId: event.id,
        });
      }

      /* ================================
         Create All-Day Event
      ================================= */
      await calendar.events.insert({
        calendarId,
        requestBody: {
          summary,
          description: cleanedDescription,
          colorId,
          start: { date: dateStr },
          end: {
            date: new Date(
              new Date(dateStr).getTime() + 86400000
            ).toISOString().slice(0,10)
          },
          reminders
        },
      });

      console.log("Updated:", dateStr);
    }

    console.log("All forecast events updated.");
  }
  catch (err) {
    console.error("Calendar push failed:");
    console.error(err.response?.data || err.message || err);
    process.exit(1);
  }
}

main();
