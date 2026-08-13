const GarminClient = require('./garmin');

// Route de diagnostic : affiche la réponse brute du prédicteur de course
// Garmin (5K/10K/semi/marathon) — endpoint non documenté par garmin-connect,
// chemin repris de python-garminconnect, forme non encore vérifiée contre
// une vraie réponse. Lecture seule (pas d'appel Claude ni d'email) : sert à
// confirmer les noms de champs avant de les intégrer au bilan hebdo.
module.exports = async (req, res) => {
  try {
    if (!process.env.GARMIN_EMAIL || !process.env.GARMIN_PASSWORD) {
      throw new Error('Variables Garmin manquantes');
    }

    const garmin = new GarminClient(
      process.env.GARMIN_EMAIL,
      process.env.GARMIN_PASSWORD
    );

    const data = await garmin.getRacePredictions();

    return res.status(200).json({ data });
  } catch (error) {
    console.error('❌ Erreur debug-race-predictions:', error.message);
    return res.status(500).json({ error: error.message, success: false });
  }
};
