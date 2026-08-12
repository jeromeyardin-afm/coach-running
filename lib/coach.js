const GarminClient = require('./garmin');
const CoachMarathon = require('./claude-coach');
const EmailSender = require('./email');
const plan = require('./plan');

// Fenêtre de recherche : ne traite que les activités plus récentes que ça.
// Un peu plus large que l'intervalle du cron pour ne rater aucune activité
// même si une exécution échoue ou est retardée.
const LOOKBACK_HOURS = Number(process.env.ACTIVITY_LOOKBACK_HOURS || 26);

function formatPace(distanceMeters, durationSeconds) {
  const distanceKm = distanceMeters / 1000;
  const durationMinutes = durationSeconds / 60;
  const paceMinutes = Math.floor(durationMinutes / distanceKm);
  const paceSeconds = Math.round((durationMinutes / distanceKm - paceMinutes) * 60);
  return `${paceMinutes}:${String(paceSeconds).padStart(2, '0')}`;
}

// Vercel envoie "YYYY-MM-DD HH:mm:ss" (GMT) pour startTimeGMT.
function parseGarminDate(startTimeGMT) {
  return new Date(`${startTimeGMT.replace(' ', 'T')}Z`);
}

module.exports = async (req, res) => {
  try {
    console.log('🏃 Démarrage agent coach running...');

    if (!process.env.GARMIN_EMAIL || !process.env.GARMIN_PASSWORD) {
      throw new Error('Variables Garmin manquantes');
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('Clé API Anthropic manquante');
    }

    console.log('📊 Récupération des activités Garmin...');
    const garmin = new GarminClient(
      process.env.GARMIN_EMAIL,
      process.env.GARMIN_PASSWORD
    );

    const activities = await garmin.getActivities(10);

    if (!activities || activities.length === 0) {
      console.log('Aucune activité récupérée');
      return res.status(200).json({ message: 'Aucune activité récupérée' });
    }

    const cutoff = Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000;
    const newActivities = activities.filter(
      (a) => parseGarminDate(a.startTimeGMT).getTime() > cutoff
    );

    if (newActivities.length === 0) {
      console.log('Aucune nouvelle activité récente');
      return res.status(200).json({ message: 'Aucune nouvelle activité récente' });
    }

    console.log(`🎯 ${newActivities.length} nouvelle(s) activité(s) trouvée(s)`);

    const coach = new CoachMarathon();
    const emailSender = new EmailSender();

    for (const activity of newActivities) {
      console.log(`Analyse de : ${activity.activityName}`);

      const activityData = {
        type: activity.activityType?.typeKey || 'running',
        distance: (activity.distance / 1000).toFixed(2),
        duration: Math.round(activity.duration / 60),
        pace: formatPace(activity.distance, activity.duration),
        avgHR: activity.averageHR || 0,
        maxHR: activity.maxHR || 0,
        elevation: Math.round(activity.elevationGain || 0),
        date: parseGarminDate(activity.startTimeGMT).toLocaleDateString('fr-FR'),
      };

      const coachAdvice = await coach.analyzeActivity(activityData);

      console.log(`📧 Envoi du rapport à ${process.env.EMAIL_DESTINATAIRE}`);
      await emailSender.sendCoachReport(
        process.env.EMAIL_DESTINATAIRE || plan.athlete.email,
        `🏃 Coach Marathon - Analyse de ta séance du ${activityData.date}`,
        coachAdvice,
        activityData
      );
    }

    console.log('✅ Rapport envoyé avec succès');
    return res.status(200).json({
      success: true,
      activitiesProcessed: newActivities.length,
    });
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    return res.status(500).json({
      error: error.message,
      success: false,
    });
  }
};
