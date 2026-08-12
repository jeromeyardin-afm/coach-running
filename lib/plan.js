module.exports = {
  athlete: {
    name: "Jérôme Yardin",
    email: "jeromeyardin@hotmail.com",
  },

  marathon: {
    name: "Marathon de Rennes",
    date: "2026-10-18",
    objective: "3h30",
    objectiveKmh: 4.58,
    objectivePace: "4:58/km",
    location: "Rennes, France",
  },

  physiology: {
    lactateThreshold: 181, // bpm
    maxHeartRate: 192, // bpm
    restingHeartRate: 60, // bpm (estimé)
    semiMarathonRecord: {
      time: "1:42",
      pace: "4:50/km",
      date: "2026",
    },
  },

  trainingPlan: {
    totalWeeks: 13,
    sessionsPerWeek: 4,
    startDate: "2026-07-21",
    cutbackWeeks: [4, 7, 12],
    peakWeeks: [8, 9, 10, 11],
  },

  running: {
    shoes: {
      easy: {
        model: "Asics Gel-Nimbus 28",
        weight: 330,
        purpose: "Sorties longues, footings faciles",
      },
      quality: {
        model: "Kiprun Racer (Décathlon)",
        weight: 270,
        purpose: "Fractionné, tempo, jour J",
      },
    },
    paces: {
      easy: { min: 6.0, max: 6.35, bpm: "<150" }, // /km
      endurance: { min: 5.4, max: 6.1, bpm: "150-165" }, // /km
      marathon: { min: 4.95, max: 5.0, bpm: "<168-170 (1ère moitié), dérive 172-175" }, // /km
      tempo: { min: 4.35, max: 4.45, bpm: "175-183" }, // /km
      vma: { min: 4.05, max: 4.3, bpm: "185-192" }, // /km
    },
  },

  crosstraining: {
    swimming: {
      frequency: "1-2 fois/semaine",
      purpose: "Récupération active, volume aérobie sans impact",
      effort: "Easy, modéré",
    },
  },

  nutrition: {
    carbs: "Augmenter progressivement avec le volume",
    protein: "Suffisant à chaque repas",
    hydration: "Constant sur la journée",
    duringExercise: {
      under60min: "Eau seulement",
      over90min: "30-60g glucides/heure (gels, boisson isotonique)",
    },
  },

  context: {
    slightlyOverweight: true,
    targetLossStrategy: "Léger déficit (300-500 kcal/jour), éviter pendant semaines 8-11 et affûtage",
    location: "Bourgbarré, région Rennes",
  },

  notes: [
    "Corriger allures faciles : trop souvent à 5:45-6:00 au lieu de 6:00-6:20",
    "Échauffement 10-15 min avant séances qualité (important)",
    "Retour au calme 10 min après séances qualité (<150 bpm)",
    "FC peut monter en chaleur : hydratation renforcée été",
    "Tester nutrition gels en grandeur réelle pendant sorties longues",
    "Dénivelé affecte allure réelle : vérifier GAP si vallonné",
  ],
};
