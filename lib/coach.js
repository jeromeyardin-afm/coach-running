const GarminClient = require('../lib/garmin');
const CoachMarathon = require('../lib/claude-coach');
const EmailSender = require('../lib/email');
const fs = require('fs');
const path = require('path');

// Stockage local des activités traitées
const CACHE_FILE = path.join(__dirname, '../.last-activity.json');

function getLastActivityTime() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      return data.lastActivityTime;
    }
  } catch (error) {
    console.log('Cache vide, première exécution');
  }
  return null;
}

function saveLastActivityTime(time) {
  fs.writeFileSync(CACHE_FILE, JSON.stringify({ lastActivityTime: time }), 'utf8');
}

// Fonction principale pour Vercel
module.exports = async (req, res) => {
  try {
    console.log('🏃 Démarrage agent coach running...');

    // Vérifie les variables d'environnement
    if (!process.env.GARMIN_EMAIL || !process.env.GARMIN_PASSWORD) {
      throw new Error('Variables Garmin manquantes');
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('Clé API Anthropic manquante');
    }

    // Récupère les activités Garmin
    console.log('📊 Récupération des activités Garmin...');
    const garmin = new GarminClient(
      process.env.GARMIN_EMAIL,
      process.env.GARMIN_PASSWORD
    );
    
    const activities = await garmin.getActivities();
    
    if (!activities || activities.length === 0) {
      console.log('Aucune nouvelle activité');
      return res.status(200).json({ message: 'Aucune nouvelle activité' });
    }

    // Récupère l'heure de la dernière activité traitée
    const lastActivityTime = getLastActivityTime();
    const newActivities = activities.filter(a => {
      if (!lastActivityTime) return true;
      return new Date(a.startTimeInSeconds * 1000) > new Date(lastActivityTime);
    });

    if (newActivities.length === 0) {
      console.log('Aucune nouvelle activité depuis la dernière vérification');
      return res.status(200).json({ message: 'Déjà traité' });
    }

    console.log(`🎯 ${newActivities.length} nouvelle(s) activité(s) trouvée(s)`);

    // Initialise le coach
    const coach = new CoachMarathon();
    const emailSender = new EmailSender();

    // Analyse chaque nouvelle activité
    for (const activity of newActivities) {
      console.log(`Analyse de : ${activity.activityName}`);

      // Format les données d'activité
      const activityData = {
        type: activity.activityType?.typeKey || 'running',
        distance: (activity.distance / 1000).toFixed(2),
        duration: Math.round(activity.duration / 60),
        pace: formatPace(activity.distance, activity.duration),
        avgHR: activity.avgHeartRate || 0,
        maxHR: activity.maxHeartRate || 0,
        elevation: Math.round(activity.elevationGain || 0),
        date: new Date(activity.startTimeInSeconds * 1000).toLocaleDateString('fr-FR'),
      };

      // Génère les conseils du coach
      const coachAdvice = await coach.analyzeActivity(activityData);

      // Envoie l'email
      console.log(`📧 Envoi du rapport à ${process.env.EMAIL_DESTINATAIRE}`);
      await emailSender.sendCoachReport(
        process.env.EMAIL_DESTINATAIRE || 'jeromeyardin@hotmail.com',
        `🏃 Coach Marathon - Analyse de ta séance du ${activityData.date}`,
        coachAdvice,
        activityData
      );

      // Sauvegarde la dernière activité
      saveLastActivityTime(new Date(activity.startTimeInSeconds * 1000).toISOString());
    }

    console.log('✅ Rapport envoyé avec succès');
    return res.status(200).json({ 
      success: true, 
      activitiesProcessed: newActivities.length 
    });

  } catch (error) {
    console.error('❌ Erreur:', error.message);
    return res.status(500).json({ 
      error: error.message,
      success: false 
    });
  }
};

// Fonction utilitaire pour formater l'allure
function formatPace(distanceMeters, durationSeconds) {
  const distanceKm = distanceMeters / 1000;
  const durationMinutes = durationSeconds / 60;
  const paceMinutes = Math.floor(durationMinutes / distanceKm);
  const paceSeconds = Math.round((durationMinutes / distanceKm - paceMinutes) * 60);
  return `${paceMinutes}:${String(paceSeconds).padStart(2, '0')}`;
}