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
    // Version FINAL du 14/08/2026 (corrige un cafouillage de la révision
    // précédente, qui avait 2 séances easy distinctes en plus des 2
    // qualités — 5 sorties/semaine en tout) : 4 vraies séances par semaine
    // — Qualité #1, Qualité #2, Récupération (easy court OU natation),
    // Sortie longue. Ici sessionsPerWeek=3 ne compte que les 3 séances
    // courtes (Qualité #1, Qualité #2, Récupération) ; la sortie longue est
    // comptée séparément (voir weeklyReport.js : shortSessionsCount vs
    // longRunCompleted), donc 3+1 = les 4 séances du plan.
    sessionsPerWeek: 3,
    startDate: "2026-07-21",
    cutbackWeeks: [4, 7],
    peakWeeks: [8, 9, 10, 11],
    taperWeeks: [12, 13],
  },

  // Révisé le 14/08/2026 (version FINAL) : 4 séances par semaine, ordre
  // flexible — Qualité #1, Qualité #2, Récupération (easy court OU
  // natation, une seule séance et non deux), Sortie longue.
  weeklyStructure: [
    { day: "Jour 1", type: "Qualité #1", example: "Seuil / VMA fractionné, 45-60 min, 85-95% FC max" },
    { day: "Jour 2", type: "Qualité #2", example: "Tempo / allure marathon, 45-60 min, 80-88% FC max" },
    { day: "Jour 3", type: "Récupération", example: "Easy court OU natation, 30-40 min, <150 bpm / easy" },
    { day: "Jour 4 (week-end)", type: "Sortie longue", example: "Progressive + segments allure marathon selon semaine, 90-180 min, 70-80% FC max" },
    { day: "Flexible", type: "Repos", example: "Repos complet selon ressenti, 1-2 jours" },
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
    "Échauffement 10-15 min avant chaque séance de qualité (important), retour au calme 10 min sous 150 bpm après",
    "FC élevée sur plusieurs sorties faciles d'affilée = signal de fatigue à prendre au sérieux, mieux vaut lever le pied que forcer",
    "Ne jamais sauter les semaines de récupération (4 et 7)",
    "À partir de la semaine 5, terminer les sorties longues par quelques km à allure marathon (4:55-5:00/km), sauf semaines de récupération (7) et d'affûtage (12-13) où la sortie longue reste facile sans segment AM",
    "Semaine 10 = pic de charge hebdo (46 km, jamais dépassé après) ; semaine 11 = dernière et plus longue sortie longue (32 km), l'affûtage commence après",
    "Semaines 12-13 : réduire fortement le volume (28 km puis ~15 km) sans perdre les jambes, garder un peu d'intensité courte",
    "Natation en complément (1-2x/semaine) sur des jours sans course, en récupération active après une sortie longue ou une séance de qualité, jamais intense",
    "Léger déficit calorique possible, mais à éviter pendant les semaines à fort volume (8-11) et l'affûtage (12-13)",
    "Dénivelé affecte l'allure réelle : vérifier le GAP si le parcours est vallonné",
    "Chaleur : hydratation renforcée, la FC peut monter de +5-10 bpm sans que ce soit un signal d'alerte",
    "Jours de repos : essentiels, ne pas les compresser",
    "Tester la nutrition (gels) en conditions réelles pendant les sorties longues",
  ],
};
