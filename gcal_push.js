const { google } = require("googleapis");
const fs = require("fs");

async function main() {
  try {
    console.log("Starting Google Calendar push...");

    const calendarId = process.env.GCAL_CALENDAR_ID;
    const serviceAccount = JSON.parse(process.env.GCAL_SA_KEY_JSON);

    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");

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
    const next7 = new Date();
    next7.setDate(today.getDate() + 7);

    for (const line of forecastLines) {

      const dateMatch = line.match(/^(\d{4}-\d{2}-\d{2})/);
      if (!dateMatch) continue;

      const dateStr = dateMatch[1];
      const eventDate = new Date(dateStr);

      // Only update next 7 days
      if (eventDate < today || eventDate > next7) continue;

      // Extract fishing rating
      const fishingMatch = line.match(/Fishing:\s*(\w+)/);
      const fishing = fishingMatch ? fishingMatch[1] : "Fair";

      let colorId = "5";
      let emoji = "🌊";

      switch (fishing) {
        case "Excellent":
          colorId = "2";
          emoji = "🎣🔥";
          break;
        case "Good":
          colorId = "9";
          emoji = "🎣";
          break;
        case "Fair":
          colorId = "5";
          emoji = "🌊";
          break;
        case "Poor":
          colorId = "11";
          emoji = "🚫";
          break;
      }

      const summary = `${emoji} Navarre Forecast`;

      // Delete existing bot events for that day
      const existing = await calendar.events.list({
        calendarId,
        timeMin: new Date(dateStr + "T00:00:00Z").toISOString(),
        timeMax: new Date(dateStr + "T23:59:59Z").toISOString(),
        q: "Navarre Forecast",
        singleEvents: true,
      });

      for (const event of existing.data.items) {
        await calendar.events.delete({
          calendarId,
          eventId: event.id,
        });
      }

      await calendar.events.insert({
        calendarId,
        requestBody: {
          summary,
          description: line,
          colorId,
          start: {
            date: dateStr,   // All-day event
          },
          end: {
            date: dateStr,   // All-day event (single day)
          },
        },
      });

      console.log("Updated:", dateStr);
    }

    console.log("All forecast events updated.");
  } catch (err) {
    console.error("Calendar push failed:");
    console.error(err.response?.data || err.message || err);
    process.exit(1);
  }
}

main();
