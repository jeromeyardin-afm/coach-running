module.exports = {
  athlete: {
    name: "Jérôme Yardin",
    email: "jeromeyardin@hotmail.com",
  },

  marathon: {
    name: "Marathon de Rennes",
    date: "2026-10-18",
    objective: "3h30",
    objectiveKph: 12.1,
    objectivePace: "4:58/km",
    location: "Rennes, France",
  },

  physiology: {
    lactateThreshold: 181, // bpm
    maxHeartRate: 192, // bpm
    restingHeartRate: 60, // bpm (estimé)
    vo2maxEstimate: "~52 ml/kg/min (estimé d'après semi-marathon)",
    semiMarathonRecord: {
      time: "1:42:00",
      pace: "4:50/km",
      date: "2026",
      predictedMarathonPotential: "3h32-3h33",
    },
  },

  trainingPlan: {
    totalWeeks: 13,
    sessionsPerWeek: 4,
    startDate: "2026-07-21",
    cutbackWeeks: [4, 7],
    peakWeeks: [8, 9, 10, 11],
    taperWeeks: [12, 13],
  },

  weeklyStructure: [
    { day: "Mardi", type: "Séance qualité", example: "Tempo, seuil, ou fractionné" },
    { day: "Mercredi", type: "Footing facile court", example: "5-6 km, 6:00-6:20/km, FC <150" },
    { day: "Jeudi", type: "Repos ou natation", example: "Récupération active" },
    { day: "Vendredi", type: "Footing facile moyen", example: "7-8 km, 5:50-6:10/km, FC <150" },
    { day: "Samedi-Dimanche", type: "Sortie longue", example: "Progressive, +segment allure marathon selon semaine" },
  ],

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
      vma: { min: 4.05, max: 4.2, bpm: "185-192" }, // /km
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
    "Corriger allures faciles : viser 6:00-6:20/km à moins de 150 bpm, pas 5:45-6:00 à FC soutenue",
    "Échauffement et retour au calme de 10-15 min à chaque séance de qualité, pas seulement le corps de séance",
    "FC élevée sur plusieurs sorties faciles d'affilée = signal de fatigue à prendre au sérieux, mieux vaut lever le pied que forcer",
    "Ne jamais sauter les semaines de récupération (4 et 7)",
    "À partir de la semaine 5, terminer les sorties longues par quelques km à allure marathon (4:55-5:00/km)",
    "Semaine 11 = pic (32 km) : ne pas rajouter de volume après cette sortie, l'affûtage commence",
    "Semaines 12-13 : réduire fortement le volume (-30% puis -50%) sans perdre les jambes, garder un peu d'intensité courte",
    "Natation en complément (1-2x/semaine) sur des jours sans course, en récupération active après une sortie longue ou une séance de qualité",
    "Léger déficit calorique possible, mais à éviter pendant les semaines à fort volume (8-11) et l'affûtage (12-13)",
    "Dénivelé affecte l'allure réelle : vérifier le GAP si le parcours est vallonné",
    "Tester la nutrition (gels) en conditions réelles pendant les sorties longues",
  ],
};
