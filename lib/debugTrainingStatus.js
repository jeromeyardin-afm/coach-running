const GarminClient = require('./garmin');

// Route de diagnostic : affiche la réponse brute des endpoints Statut
// d'entraînement / Training Readiness / Max Metrics (VO2max) — trois
// endpoints non documentés par garmin-connect, chemins repris de projets
// tiers de reverse engineering et non encore vérifiés contre une vraie
// réponse. Lecture seule (pas d'appel Claude ni d'email) : sert à confirmer
// la forme réelle des données avant de les intégrer à l'analyse du coach.
module.exports = async (req, res) => {
  try {
    if (!process.env.GARMIN_EMAIL || !process.env.GARMIN_PASSWORD) {
      throw new Error('Variables Garmin manquantes');
    }

    const garmin = new GarminClient(
      process.env.GARMIN_EMAIL,
      process.env.GARMIN_PASSWORD
    );

    const results = {};

    for (const [key, fetcher] of Object.entries({
      trainingStatus: () => garmin.getTrainingStatus(),
      maxMetrics: () => garmin.getMaxMetrics(),
      trainingReadiness: () => garmin.getTrainingReadiness(),
    })) {
      try {
        results[key] = { data: await fetcher(), error: null };
      } catch (error) {
        results[key] = { data: null, error: error.message };
      }
    }

    return res.status(200).json(results);
  } catch (error) {
    console.error('❌ Erreur debug-training-status:', error.message);
    return res.status(500).json({ error: error.message, success: false });
  }
};
