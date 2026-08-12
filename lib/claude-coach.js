const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODEL = 'claude-sonnet-5';

class CoachMarathon {
  constructor(marathonPlan) {
    this.marathonPlan = marathonPlan; // Ton plan d'entraînement 3h30
  }

  async analyzeActivity(activity) {
    const prompt = `Tu es un coach marathon expert. Analyse cette activité de course à pied et donne des conseils spécifiques pour préparer un marathon à Rennes le 18 octobre avec un objectif de 3h30.

Données de l'activité :
- Distance: ${activity.distance} km
- Durée: ${activity.duration} min
- Allure moyenne: ${activity.pace} /km
- FC moyenne: ${activity.avgHR} bpm
- FC max: ${activity.maxHR} bpm
- Dénivelé: +${activity.elevation} m
- Type: ${activity.type}
- Date: ${activity.date}

Plan de l'utilisateur :
- Seuil lactique: 181 bpm
- FC max: 192 bpm
- Semi-marathon record: 1h42 (4:50/km)
- Objectif marathon: 3h30 (4:58/km)
- Volume actuel: ~40 km/semaine

Donne un feedback court et actionnable (3-4 points max) :
1. Comment s'est passée cette séance vs le plan ?
2. Signaux positifs ou alertes à surveiller ?
3. Un conseil spécifique pour les prochains jours
4. Hydratation/nutrition si besoin`;

    try {
      const message = await client.messages.create({
        model: MODEL,
        max_tokens: 500,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      return message.content[0].text;
    } catch (error) {
      console.error('Erreur Claude API:', error.message);
      throw error;
    }
  }

  async generateWeeklyReport(activities) {
    const prompt = `Tu es un coach marathon. Voici les activités de la semaine de cet athlète qui prépare un marathon à Rennes (18 octobre, objectif 3h30).

Activités de la semaine :
${activities.map(a => `- ${a.date} : ${a.type} ${a.distance}km à ${a.pace}/km (FC ${a.avgHR} bpm)`).join('\n')}

Données de l'athlète :
- Seuil: 181 bpm, Max: 192 bpm
- Semi-marathon: 1h42
- Objectif: 3h30 marathon

Génère un rapport hebdo :
1. Résumé du volume et charge d'entraînement
2. Signaux de progression ou fatigue
3. Ajustements à faire pour la semaine à venir
4. Un mot d'encouragement`;

    try {
      const message = await client.messages.create({
        model: MODEL,
        max_tokens: 600,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      return message.content[0].text;
    } catch (error) {
      console.error('Erreur Claude API:', error.message);
      throw error;
    }
  }
}

module.exports = CoachMarathon;
