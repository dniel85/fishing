const fetch = require("node-fetch");

async function getSurfConditions() {
  const url = "https://www.santarosa.fl.gov/Content/Load?contentCollectionID=c15b42c0-d73a-4d14-be5d-ee1e6a064089&StructureID=9&themeID=24";

  const body = {
    contentContainerIDs: [
      "a28c844f-4f0e-44ba-8837-19241f3440ff",
      "b411174f-3965-4583-992d-30ad708bfdf6",
      "1dac7fd0-90aa-400f-9a60-035cac2fab83",
      "59be6a82-0c9a-4db2-be5a-fb4100cd59c0",
      "47246412-9633-4a10-9f0d-cdbcc8cf8e06"
    ]
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest"
    },
    body: JSON.stringify(body)
  });

  const text = await response.text();
  return text;
}

module.exports = { getSurfConditions };
