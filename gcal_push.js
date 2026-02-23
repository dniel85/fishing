const { google } = require("googleapis");
const fs = require("fs");

function fishScale(rating) {
  switch (rating) {
    case "Excellent": return "🐟🐟🐟🐟🐟";
    case "Good": return "🐟🐟🐟🐟";
    case "Fair": return "🐟🐟🐟";
    case "Poor": return "🐟🐟";
    default: return "🚫";
  }
}

function isWeekend(date) {
  const d = date.getDay();
  return d === 0 || d === 6;
}
const usHolidays = ["01-01", "07-04", "11-11", "12-25"];

function isHoliday(date) {
  const mmdd = date.toISOString().slice(5, 10);
  return usHolidays.includes(mmdd);
}

function addDays(dateStr, days) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Main
async function main() {
  try {
    console.log("Starting Google Calendar push...");

    const calendarId = process.env.GCAL_CALENDAR_ID;
    const serviceAccount = JSON.parse(process.env.GCAL_SA_KEY_JSON || "{}");

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
    const rawLines = fs.readFileSync("forecast.txt", "utf8")
      .split("\n")
      .map(l => l.trim())
      .filter(Boolean);

    const dateMap = new Map();

    for (const line of rawLines) {
      const match = line.match(/^(\d{4}-\d{2}-\d{2})/);
      if (!match) continue;
      dateMap.set(match[1], line); // keeps last entry per date
    }

    const lines = Array.from(dateMap.values());
    const today = new Date();
    today.setHours(0,0,0,0);
    const maxDate = new Date(today);
    maxDate.setDate(today.getDate() + 7);
    for (const line of lines) {
      const dateStr = line.match(/^(\d{4}-\d{2}-\d{2})/)[1];
      const eventDate = new Date(dateStr + "T00:00:00");
      if (eventDate < today || eventDate > maxDate) continue;
      const fishingMatch = line.match(/Fishing:\s*([A-Za-z']+)/);
      const fishing = fishingMatch ? fishingMatch[1] : "Fair";
      const kayakMatch = line.match(/Kayak:\s*(.+)$/);
      const kayak = kayakMatch ? kayakMatch[1].trim() : "";
      const fishDisplay = fishScale(fishing);
      let colorId = "5";
      if (fishing === "Excellent") colorId = "2";
      else if (fishing === "Good") colorId = "9";
      else if (fishing === "Poor") colorId = "11";
      let reminders = { useDefault: false };
      if (kayak === "Perfect" &&
          (isWeekend(eventDate) || isHoliday(eventDate))) {
        reminders = {
          useDefault: false,
          overrides: [
            { method: "popup", minutes: 180 },
            { method: "popup", minutes: 60 }
          ]
        };
      }
      const summary =
        `${fishDisplay}${kayak === "Perfect" ? " 🔥" : ""}`;
      const description =
        line.replace(/Fishing:\s*[^|]+(\|)?\s*/i, "").trim();
   const eventId = `navarre${dateStr.replace(/-/g, "")}`;
   const requestBody = {
     id: eventId,   // MUST be here for insert
     summary,
     description,
     colorId,
     start: { date: dateStr },
     end: { date: addDays(dateStr, 1) },
     reminders
   };
   try {
     // Check if event exists
     await calendar.events.get({
       calendarId,
       eventId
     });
   
     // If it exists → update
     await calendar.events.update({
       calendarId,
       eventId,
       requestBody
     });
   
     console.log("Updated:", dateStr);
   
   } catch (e) {
     if ((e.code || e.response?.status) === 404) {
       await calendar.events.insert({
         calendarId,
         requestBody
       });
       console.log("Created:", dateStr);
     } else {
       throw e;
     }
   }
      try {
        await calendar.events.update({
          calendarId,
          eventId,
          requestBody
        });
        console.log("Updated:", dateStr);
      }
      catch (e) {
        if ((e.code || e.response?.status) === 404) {
          await calendar.events.insert({
            calendarId,
            eventId,
            requestBody
          });
          console.log("Created:", dateStr);
        } else {
          throw e;
        }
      }
    }

    console.log("Calendar sync complete.");
  }
  catch (err) {
    console.error(err.response?.data || err.message || err);
    process.exit(1);
  }
}
main();
