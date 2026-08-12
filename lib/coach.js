const GarminClient = require('./garmin');
const CoachMarathon = require('./claude-coach');
const EmailSender = require('./email');
const plan = require('./plan');
const { formatPace, parseGarminDate, summarizeSleep, summarizeSplits, summarizeTrainingStatus } = require('./garminUtils');

// Fenêtre de recherche : ne traite que les activités plus récentes que ça.
// Un peu plus large que l'intervalle du cron pour ne rater aucune activité
// même si une exécution échoue ou est retardée.
const LOOKBACK_HOURS = Number(process.env.ACTIVITY_LOOKBACK_HOURS || 26);

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

    // Statut d'entraînement Garmin (VO2max, équilibre de charge) : un
    // instantané au niveau du compte, pas par activité — récupéré une seule
    // fois et réutilisé pour toutes les activités de cette exécution.
    let trainingStatus = null;
    try {
      trainingStatus = summarizeTrainingStatus(await garmin.getTrainingStatus());
    } catch (error) {
      console.log('Pas de statut d\'entraînement disponible:', error.message);
    }

    for (const activity of newActivities) {
      console.log(`Analyse de : ${activity.activityName}`);

      const activityDate = parseGarminDate(activity.startTimeGMT);

      const activityData = {
        type: activity.activityType?.typeKey || 'running',
        distance: (activity.distance / 1000).toFixed(2),
        duration: Math.round(activity.duration / 60),
        pace: formatPace(activity.distance, activity.duration),
        avgHR: activity.averageHR || 0,
        maxHR: activity.maxHR || 0,
        cadence: Math.round(activity.averageRunningCadenceInStepsPerMinute || 0),
        elevation: Math.round(activity.elevationGain || 0),
        date: activityDate.toLocaleDateString('fr-FR'),
      };

      let sleep = null;
      try {
        sleep = summarizeSleep(await garmin.getSleepData(activityDate));
      } catch (error) {
        console.log('Pas de donnée de sommeil disponible pour cette date:', error.message);
      }

      let splits = null;
      try {
        splits = summarizeSplits(await garmin.getActivitySplits(activity.activityId));
      } catch (error) {
        console.log('Pas de détail par segment disponible pour cette activité:', error.message);
      }

      const coachAdvice = await coach.analyzeActivity(activityData, sleep, splits, trainingStatus);

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
