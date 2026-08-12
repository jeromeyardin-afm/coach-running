const GarminClient = require('./garmin');
const { summarizeSplits } = require('./garminUtils');

// Route de diagnostic : récupère les tours/segments de la dernière activité
// de course via l'endpoint Garmin non documenté, et affiche à la fois la
// réponse brute et le résumé qu'en tire summarizeSplits(). Sert à vérifier
// le format réel avant de faire confiance à cette donnée dans l'analyse
// quotidienne (contrairement au sommeil/poids, cet endpoint n'est pas
// couvert par la librairie garmin-connect).
module.exports = async (req, res) => {
  try {
    if (!process.env.GARMIN_EMAIL || !process.env.GARMIN_PASSWORD) {
      throw new Error('Variables Garmin manquantes');
    }

    const garmin = new GarminClient(
      process.env.GARMIN_EMAIL,
      process.env.GARMIN_PASSWORD
    );

    const activities = await garmin.getActivities(10);
    const activity = (activities || []).find(
      (a) => typeof a.activityType?.typeKey === 'string' && a.activityType.typeKey.toLowerCase().includes('running')
    );

    if (!activity) {
      return res.status(200).json({ message: 'Aucune activité de course trouvée dans les 10 dernières' });
    }

    let rawSplits = null;
    let splitsError = null;
    try {
      rawSplits = await garmin.getActivitySplits(activity.activityId);
    } catch (error) {
      splitsError = error.message;
    }

    return res.status(200).json({
      activityId: activity.activityId,
      activityName: activity.activityName,
      startTimeGMT: activity.startTimeGMT,
      distanceKm: Math.round((activity.distance / 1000) * 100) / 100,
      splitsError,
      rawSplits,
      summarizedSplits: rawSplits ? summarizeSplits(rawSplits) : null,
    });
  } catch (error) {
    console.error('❌ Erreur debug-splits:', error.message);
    return res.status(500).json({ error: error.message, success: false });
  }
};
