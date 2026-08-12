const Anthropic = require('@anthropic-ai/sdk');
const plan = require('./plan');
const { formatDateFr, buildPlanContext } = require('./planUtils');

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODEL = 'claude-sonnet-5';

function extractText(message) {
  const block = message.content.find((b) => b.type === 'text');
  return block ? block.text : '';
}

class CoachMarathon {
  async analyzeActivity(activity) {
    const prompt = `Tu es un coach marathon expert. Analyse cette activité de course à pied et donne des conseils spécifiques pour préparer ${plan.marathon.name} le ${formatDateFr(plan.marathon.date)} avec un objectif de ${plan.marathon.objective}.

Données de l'activité :
- Distance: ${activity.distance} km
- Durée: ${activity.duration} min
- Allure moyenne: ${activity.pace} /km
- FC moyenne: ${activity.avgHR} bpm
- FC max: ${activity.maxHR} bpm
- Dénivelé: +${activity.elevation} m
- Type: ${activity.type}
- Date: ${activity.date}

${buildPlanContext()}

Donne un feedback court et actionnable (3-4 points max) :
1. Comment s'est passée cette séance vs le plan (quelle allure/zone visée probable) ?
2. Signaux positifs ou alertes à surveiller ?
3. Un conseil spécifique pour les prochains jours
4. Hydratation/nutrition si besoin`;

    try {
      const message = await client.messages.create({
        model: MODEL,
        max_tokens: 500,
        thinking: { type: 'disabled' },
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      return extractText(message);
    } catch (error) {
      console.error('Erreur Claude API:', error.message);
      throw error;
    }
  }

  async generateWeeklyReport(activities) {
    const prompt = `Tu es un coach marathon. Voici les activités de la semaine de cet athlète qui prépare ${plan.marathon.name} (${formatDateFr(plan.marathon.date)}, objectif ${plan.marathon.objective}).

Activités de la semaine :
${activities.map(a => `- ${a.date} : ${a.type} ${a.distance}km à ${a.pace}/km (FC ${a.avgHR} bpm)`).join('\n')}

${buildPlanContext()}

Génère un rapport hebdo :
1. Résumé du volume et charge d'entraînement
2. Signaux de progression ou fatigue
3. Ajustements à faire pour la semaine à venir
4. Un mot d'encouragement`;

    try {
      const message = await client.messages.create({
        model: MODEL,
        max_tokens: 600,
        thinking: { type: 'disabled' },
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      return extractText(message);
    } catch (error) {
      console.error('Erreur Claude API:', error.message);
      throw error;
    }
  }
}

module.exports = CoachMarathon;
