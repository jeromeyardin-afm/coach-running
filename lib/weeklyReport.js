const GarminClient = require('./garmin');
const CoachMarathon = require('./claude-coach');
const EmailSender = require('./email');
const plan = require('./plan');
const { formatPace, parseGarminDate } = require('./garminUtils');
const { getTrainingWeek } = require('./planUtils');

// 7 jours + marge pour ne pas rater une activité si le cron tourne un peu tard.
const WEEK_LOOKBACK_HOURS = Number(process.env.WEEKLY_LOOKBACK_HOURS || 7 * 24 + 2);

module.exports = async (req, res) => {
  try {
    console.log('📅 Génération du bilan hebdomadaire...');

    if (!process.env.GARMIN_EMAIL || !process.env.GARMIN_PASSWORD) {
      throw new Error('Variables Garmin manquantes');
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('Clé API Anthropic manquante');
    }

    const garmin = new GarminClient(
      process.env.GARMIN_EMAIL,
      process.env.GARMIN_PASSWORD
    );

    const activities = await garmin.getActivities(20);

    const cutoff = Date.now() - WEEK_LOOKBACK_HOURS * 60 * 60 * 1000;
    const weekActivities = (activities || [])
      .filter((a) => parseGarminDate(a.startTimeGMT).getTime() > cutoff)
      .map((a) => ({
        type: a.activityType?.typeKey || 'running',
        distance: (a.distance / 1000).toFixed(2),
        pace: formatPace(a.distance, a.duration),
        avgHR: a.averageHR || 0,
        date: parseGarminDate(a.startTimeGMT).toLocaleDateString('fr-FR'),
      }));

    if (weekActivities.length === 0) {
      console.log('Aucune activité cette semaine');
      return res.status(200).json({ message: 'Aucune activité cette semaine' });
    }

    console.log(`🎯 ${weekActivities.length} activité(s) cette semaine`);

    const coach = new CoachMarathon();
    const report = await coach.generateWeeklyReport(weekActivities);

    const emailSender = new EmailSender();
    const week = getTrainingWeek();

    await emailSender.sendWeeklyReport(
      process.env.EMAIL_DESTINATAIRE || plan.athlete.email,
      `📅 Coach Marathon - Bilan semaine ${week}`,
      report,
      weekActivities
    );

    console.log('✅ Bilan hebdo envoyé avec succès');
    return res.status(200).json({
      success: true,
      activitiesInWeek: weekActivities.length,
    });
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    return res.status(500).json({
      error: error.message,
      success: false,
    });
  }
};
