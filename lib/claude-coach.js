const Anthropic = require('@anthropic-ai/sdk');
const plan = require('./plan');
const { formatDateFr, buildPlanContext, classifyByHR } = require('./planUtils');

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODEL = 'claude-sonnet-5';

function extractText(message) {
  const block = message.content.find((b) => b.type === 'text');
  return block ? block.text : '';
}

function formatSleepBlock(sleep) {
  if (!sleep) return "Sommeil : pas de donnée disponible pour cette date.";
  const parts = [`Durée : ${sleep.duration}`];
  if (sleep.score != null) parts.push(`score ${sleep.score}/100 (${sleep.scoreQualifier})`);
  if (sleep.restingHeartRate != null) parts.push(`FC repos mesurée cette nuit : ${sleep.restingHeartRate} bpm`);
  if (sleep.avgOvernightHrv != null) parts.push(`HRV moyenne : ${sleep.avgOvernightHrv} ms (statut : ${sleep.hrvStatus})`);
  if (sleep.bodyBatteryChange != null) parts.push(`Body Battery récupérée pendant la nuit : +${sleep.bodyBatteryChange}`);
  return `Sommeil (nuit précédant/du jour de la séance) : ${parts.join(', ')}.`;
}

function formatWeightBlock(weight) {
  if (!weight) return '';
  const bodyFat = weight.bodyFatPercent != null ? `, masse grasse ${weight.bodyFatPercent}%` : '';
  return `\nPoids le jour du bilan : ${weight.weightKg} kg${bodyFat} (à mettre en perspective avec la stratégie de déficit léger, jamais un objectif en soi).`;
}

class CoachMarathon {
  async analyzeActivity(activity, sleep = null) {
    const detectedZone = classifyByHR(activity.avgHR);
    const prompt = `Tu es un coach marathon expert. Analyse cette activité de course à pied et donne des conseils spécifiques pour préparer ${plan.marathon.name} le ${formatDateFr(plan.marathon.date)} avec un objectif de ${plan.marathon.objective}.

Données de l'activité :
- Distance: ${activity.distance} km
- Durée: ${activity.duration} min
- Allure moyenne: ${activity.pace} /km
- FC moyenne: ${activity.avgHR} bpm → zone détectée : ${detectedZone}
- FC max: ${activity.maxHR} bpm
- Cadence moyenne: ${activity.cadence || 'n/a'} pas/min
- Dénivelé: +${activity.elevation} m
- Type: ${activity.type}
- Date: ${activity.date}

${formatSleepBlock(sleep)}

${buildPlanContext()}

Important : pour juger de l'intensité de cette séance, base-toi uniquement sur la zone détectée ci-dessus (dérivée des zones FC personnalisées de cet athlète), jamais sur un pourcentage brut de FC max théorique — un effort peut représenter 70-75% de la FC max tout en étant parfaitement dans la zone de récupération pour cet athlète spécifique.

Donne un feedback court et actionnable (3-4 points max) :
1. Comment s'est passée cette séance vs le plan (la zone détectée correspond-elle à ce qui était prévu ce jour) ?
2. Signaux positifs ou alertes à surveiller ?
3. Un conseil spécifique pour les prochains jours
4. Hydratation/nutrition si besoin`;

    try {
      const message = await client.messages.create({
        model: MODEL,
        max_tokens: 1500,
        thinking: { type: 'adaptive' },
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

  async generateWeeklyReport(activities, weeklyProgress = [], weight = null) {
    const progressTable = weeklyProgress
      .map((w) => {
        const ecart = w.plannedKm != null ? `${w.actualKm >= w.plannedKm ? '+' : ''}${Math.round(((w.actualKm - w.plannedKm) / w.plannedKm) * 100)}%` : 'n/a';
        return `- Semaine ${w.week} (${w.focus || '—'}) : ${w.actualKm} km réalisés vs ${w.plannedKm ?? '?'} km prévus (${ecart}), ${w.sessionsCount}/${w.plannedSessionsPerWeek} séances de course`;
      })
      .join('\n');

    const prompt = `Tu es un coach marathon. Voici les activités de la semaine de cet athlète qui prépare ${plan.marathon.name} (${formatDateFr(plan.marathon.date)}, objectif ${plan.marathon.objective}).

Activités de la semaine :
${activities.map(a => `- ${a.date} : ${a.type} ${a.distance}km à ${a.pace}/km (FC ${a.avgHR} bpm, zone ${classifyByHR(a.avgHR)}, cadence ${a.cadence || 'n/a'} pas/min)`).join('\n')}

Historique réalisé vs prévu depuis le début du plan (volume de course uniquement) :
${progressTable}
${formatWeightBlock(weight)}

${buildPlanContext()}

Important : pour juger de l'intensité de chaque séance, base-toi uniquement sur la zone indiquée à côté de chaque FC (dérivée des zones personnalisées de cet athlète), jamais sur un pourcentage brut de FC max théorique.

Génère un rapport hebdo avec ces sections :
1. **Résumé de la semaine** : volume et charge d'entraînement, séances de qualité faites vs prévues (compare aux allures cibles de la séance qualité prévue cette semaine)
2. **Progression globale vers l'objectif** : en te basant sur tout l'historique réalisé vs prévu ci-dessus, quelle est la tendance ? Est-il en avance, dans les clous, ou en retard sur le plan ? Le potentiel marathon estimé (${plan.physiology.semiMarathonRecord.predictedMarathonPotential}) reste-t-il crédible au vu de l'exécution jusqu'ici ?
3. **Points d'amélioration** : 2-3 points concrets et priorisés, pas une liste exhaustive
4. **Ajustements pour la semaine à venir**
5. Un mot d'encouragement`;

    try {
      const message = await client.messages.create({
        model: MODEL,
        max_tokens: 2000,
        thinking: { type: 'adaptive' },
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
