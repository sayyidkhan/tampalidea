"use strict";

const path = require("node:path");
const { replaceDetails, setup } = require("../database.js");

const dataDir = path.resolve(process.env.TAMPALIDEA_DATA_DIR || path.join(__dirname, "..", ".data"));
const db = setup(dataDir);
const project = replaceDetails(db, {
  slug: "batam-100",
  actor: "TampalIdea recovery",
  reason: "Restored itinerary brief from batam-100-site Git history",
  sourceReference: "batam-100-site commit 6baa863",
  tagline: "Three days to celebrate 100 hacks and begin 101",
  description: "A three-day Batam celebration for Sayyid’s 100th hackathon: build something useful, eat well, celebrate the milestone and leave with a concrete 101 hand-off.",
  details: [
    { heading: "Day 01 · Arrive & ignite", body: "08:00 Meet at HarbourFront for the morning ferry.\n10:30 Check in around Nagoya / Harbour Bay.\n12:00 Welcome lunch and trip briefing.\n14:00 A 100-minute mini-hackathon: build something useful.\n18:00 Sayyid’s 100 hacks retrospective.\n19:30 Celebration dinner, cake and awards, then supper at Warkop Agem Mie Bangladesh Spesial 22.\n21:30 Optional KTV for adults, with inclusive alternatives." },
    { heading: "Day 02 · Explore & celebrate", body: "08:00 Breakfast and private minibus departure.\n09:30 Batam photo stop, then Barelang Bridge group photo and gratitude moment.\n12:30 Waterfront seafood lunch.\n14:30 Maha Vihara Duta Maitreya cultural visit.\n19:30 Main gala: demos, awards and the 101 announcement, followed by supper at Warkop Agem Mie Bangladesh Spesial 22.\n22:00 Dream Massage deep-tissue treatment, with Eska Spa as backup." },
    { heading: "Day 03 · Reflect & return", body: "08:00 Breakfast and checkout preparation.\n09:30 Spa, pool, café or shopping.\n12:30 Final lunch: one insight, one action.\n13:30 Transfer to Batam Centre with ferry buffer.\n15:00 Afternoon ferry home and the final 100 → 101 photo.\n19:00 Supper at Warkop if timing allows, otherwise make it the next Batam promise." },
    { heading: "Practical checklist", body: "Confirm travellers and emergency contacts; book ferry and hotel; arrange minibus and restaurants; prepare cake, awards and hackathon materials; confirm Allan as trip lead and assign safeguarding and finance leads; confirm KTV age policy and alternative plan; book Dream Massage with Eska Spa as backup; check entry requirements and SG Arrival Card; share the final itinerary and emergency plan." },
    { heading: "Side quests", body: "Complete the 100-minute mini-hackathon; take the Barelang Bridge group photo; record the 100-hackathon story; make a surprise award or video montage; eat local seafood; exchange one useful AI prompt; share one lesson; define the first Hackathon 101 goal; take the final 100 → 101 photo." },
    { heading: "Boundaries", body: "The original project is a static itinerary. Its expense splitter is demo-only: no payments, bank details or accounts. Its checklists, travellers and expenses were stored only in the visitor browser under the batam100 key and were never sent to Git or this server." },
  ],
});
console.log(JSON.stringify({ slug: project.slug, sections: project.details.length, auditEvents: project.audit.length }));
db.close();
