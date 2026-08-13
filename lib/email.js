const nodemailer = require('nodemailer');
const plan = require('./plan');
const { formatDateFr, classifyByHR } = require('./planUtils');

// Couleurs des zones FC, réutilisées pour le badge du rapport quotidien et
// la répartition par zone du rapport hebdo — mêmes zones que HR_ZONES dans
// planUtils.js, du plus facile (bleu clair) au plus intense (magenta).
// Volontairement une palette bleu/violet distincte du rouge/orange/vert
// utilisé pour les barres de conformité (volumeColor, VERDICT_COLORS) :
// les deux échelles ont des significations différentes (zone d'intensité
// vs écart au plan) et partager le rouge entre "VMA" et "volume très en
// dessous de l'objectif" prêtait à confusion (une barre de volume rouge
// avait été lue comme "séance VMA").
const ZONE_COLORS = {
  'Récupération / Facile': '#7fb3d5',
  'Endurance fondamentale': '#5499c7',
  'Allure marathon': '#a569bd',
  'Tempo / Seuil': '#7d3c98',
  'VMA / Fractionné court': '#c2185b',
};

const VERDICT_COLORS = { insuffisant: '#e74c3c', optimal: '#2ecc71', excessif: '#e67e22' };

function zoneBadge(zone) {
  const color = ZONE_COLORS[zone] || '#95a5a6';
  return `<span style="display:inline-block;background:${color};color:#fff;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:bold;">${zone}</span>`;
}

function progressBar(percent, color) {
  const width = Math.max(0, Math.min(100, percent));
  return `<div style="background:#e0e0e0;border-radius:4px;overflow:hidden;height:16px;width:100%;"><div style="background:${color};height:100%;width:${width}%;"></div></div>`;
}

function volumeColor(percent) {
  if (percent >= 90) return '#2ecc71';
  if (percent >= 60) return '#f39c12';
  return '#e74c3c';
}

function parseObjectiveSeconds(objective) {
  const match = /(\d+)h(\d+)/.exec(objective || '');
  if (!match) return null;
  return parseInt(match[1], 10) * 3600 + parseInt(match[2], 10) * 60;
}

// Cartes 5K/10K/semi/marathon du prédicteur Garmin, placées en fin de
// rapport comme demandé. Le marathon a une note de comparaison vs
// l'objectif du plan, calculée ici plutôt que par le modèle.
function buildRacePredictionsVisual(racePredictions) {
  if (!racePredictions) return '';

  const cards = [
    { label: '5 km', data: racePredictions.time5K },
    { label: '10 km', data: racePredictions.time10K },
    { label: 'Semi', data: racePredictions.timeHalfMarathon },
    { label: 'Marathon', data: racePredictions.timeMarathon },
  ].filter((c) => c.data);
  if (cards.length === 0) return '';

  const objectiveSeconds = parseObjectiveSeconds(plan.marathon.objective);
  let marathonNote = '';
  if (racePredictions.timeMarathon && objectiveSeconds != null) {
    const deltaSeconds = racePredictions.timeMarathon.seconds - objectiveSeconds;
    const deltaMin = Math.round(Math.abs(deltaSeconds) / 60);
    const color = deltaSeconds > 0 ? '#e74c3c' : '#2ecc71';
    const sign = deltaSeconds > 0 ? '+' : '-';
    marathonNote = `<div style="font-size:10px;color:${color};margin-top:2px;">${sign}${deltaMin}min vs objectif</div>`;
  }

  const cardsHtml = cards
    .map(
      (c) => `<div style="flex:1;min-width:110px;background:#fff;border:1px solid #eee;border-radius:8px;padding:10px;text-align:center;">
        <div style="font-size:10px;color:#999;text-transform:uppercase;letter-spacing:0.5px;">${c.label}</div>
        <div style="font-size:18px;font-weight:bold;color:#2c3e50;margin-top:2px;">${c.data.duration}</div>
        <div style="font-size:11px;color:#666;">${c.data.pace}/km</div>
        ${c.label === 'Marathon' ? marathonNote : ''}
      </div>`
    )
    .join('');

  return `<div style="margin-top:16px;">
    <strong style="font-size:14px;">Prédicteur de course Garmin</strong>
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;">${cardsHtml}</div>
    <div style="font-size:10px;color:#999;margin-top:6px;">Basé sur le VO2max et la forme actuelle — à distinguer du potentiel ${plan.physiology.semiMarathonRecord.predictedMarathonPotential} basé sur le record semi réel.</div>
  </div>`;
}

// Blocs visuels (barres, badges) construits à partir des chiffres calculés
// côté code plutôt que dessinés par le modèle en texte — plus fiable et
// cohérent d'un rapport à l'autre qu'un ASCII art généré par le LLM.
function buildTrainingStatusVisual(trainingStatus) {
  if (!trainingStatus) return '';
  let html = '';
  if (trainingStatus.statusLabel || trainingStatus.acuteLoad != null) {
    html += `<div style="margin-bottom:8px;font-size:13px;">`;
    if (trainingStatus.statusLabel) html += `<strong>Statut Garmin :</strong> ${trainingStatus.statusLabel} `;
    if (trainingStatus.acuteLoad != null) html += `— charge ${trainingStatus.acuteLoad}/${trainingStatus.chronicLoad} (${trainingStatus.loadStatus || 'n/a'})`;
    html += `</div>`;
  }
  const rows = [
    trainingStatus.aerobicLow && { label: 'Aérobie faible', ...trainingStatus.aerobicLow },
    trainingStatus.aerobicHigh && { label: 'Aérobie élevée', ...trainingStatus.aerobicHigh },
    trainingStatus.anaerobic && { label: 'Anaérobie', ...trainingStatus.anaerobic },
  ].filter(Boolean);
  if (rows.length > 0) {
    html += `<div><strong style="font-size:13px;">Équilibre de charge mensuel</strong>`;
    for (const r of rows) {
      const color = VERDICT_COLORS[r.verdict] || '#95a5a6';
      const pct = r.max > 0 ? Math.round((r.value / r.max) * 100) : 0;
      html += `<div style="margin-top:6px;font-size:12px;">
        <div style="display:flex;justify-content:space-between;"><span>${r.label}</span><span style="color:${color};font-weight:bold;">${r.verdict}</span></div>
        ${progressBar(pct, color)}
        <div style="color:#999;font-size:11px;margin-top:2px;">${r.value} (cible ${r.min}-${r.max})</div>
      </div>`;
    }
    html += `</div>`;
  }
  return html;
}

function buildWeeklyVisualBlock(weekActualKm, weekPlannedKm, weeklyStats, trainingStatus) {
  let html = '';
  if (weekPlannedKm) {
    const percent = Math.round((weekActualKm / weekPlannedKm) * 100);
    html += `<div style="margin-bottom:14px;">
      <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px;"><strong>Volume : ${weekActualKm} / ${weekPlannedKm} km</strong><span>${percent}%</span></div>
      ${progressBar(percent, volumeColor(percent))}
    </div>`;
  }
  if (weeklyStats?.zoneDistribution?.length > 0) {
    html += `<div style="margin-bottom:14px;">
      <strong style="font-size:13px;">Répartition par zone</strong>
      <div style="display:flex;height:16px;border-radius:4px;overflow:hidden;margin-top:4px;">
        ${weeklyStats.zoneDistribution.map((z) => `<div style="background:${ZONE_COLORS[z.zone] || '#95a5a6'};width:${z.percent}%;"></div>`).join('')}
      </div>
      <div style="font-size:11px;color:#666;margin-top:4px;">
        ${weeklyStats.zoneDistribution.map((z) => `<span style="margin-right:10px;white-space:nowrap;"><span style="display:inline-block;width:8px;height:8px;background:${ZONE_COLORS[z.zone] || '#95a5a6'};border-radius:2px;margin-right:3px;"></span>${z.zone} ${z.percent}%</span>`).join('')}
      </div>
    </div>`;
  }
  html += buildTrainingStatusVisual(trainingStatus);
  return html;
}

// Une carte compacte par semaine (barre de volume + mini barre de zone) au
// lieu de la seule semaine en cours, pour visualiser toute la tendance —
// zone au niveau de l'activité entière pour les semaines passées (voir
// commentaire dans weeklyReport.js sur ce choix).
function buildWeeklyProgressionVisual(weeklyProgress) {
  if (!weeklyProgress || weeklyProgress.length === 0) return '';

  const rows = weeklyProgress
    .map((w) => {
      const percent = w.plannedKm ? Math.round((w.actualKm / w.plannedKm) * 100) : null;
      const volumeRow = percent != null
        ? `<div style="display:flex;align-items:center;gap:8px;margin-top:2px;">
            <div style="flex:1;">${progressBar(percent, volumeColor(percent))}</div>
            <div style="font-size:11px;color:#666;width:75px;text-align:right;white-space:nowrap;">${w.actualKm}/${w.plannedKm}km</div>
          </div>`
        : '';
      const zoneRow = w.zoneDistribution && w.zoneDistribution.length > 0
        ? `<div style="display:flex;height:10px;border-radius:3px;overflow:hidden;margin-top:4px;">
            ${w.zoneDistribution.map((z) => `<div style="background:${ZONE_COLORS[z.zone] || '#95a5a6'};width:${z.percent}%;"></div>`).join('')}
          </div>`
        : '';
      return `<div style="margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid #eee;">
        <div style="font-size:12px;font-weight:bold;">Semaine ${w.week}${w.focus ? ` — ${w.focus}` : ''}</div>
        ${volumeRow}
        ${zoneRow}
      </div>`;
    })
    .join('');

  const legend = `<div style="font-size:11px;color:#666;margin-top:2px;">
    ${Object.entries(ZONE_COLORS).map(([zone, color]) => `<span style="margin-right:10px;white-space:nowrap;"><span style="display:inline-block;width:8px;height:8px;background:${color};border-radius:2px;margin-right:3px;"></span>${zone}</span>`).join('')}
  </div>`;

  return `<div style="margin-top:16px;">
    <strong style="font-size:14px;">Progression semaine par semaine</strong>
    <div style="margin-top:10px;">${rows}</div>
    ${legend}
  </div>`;
}

// `marked` (v18+) est un module ESM pur, sans build CommonJS — require()
// plante en prod (Node y applique strictement la frontière ESM/CJS,
// contrairement à certains runtimes locaux plus permissifs). import()
// dynamique fonctionne dans un fichier CJS, donc on le charge à la volée
// et on le met en cache pour ne pas répéter l'import à chaque appel.
let markedPromise;
function getMarked() {
  if (!markedPromise) {
    markedPromise = import('marked').then((m) => m.marked);
  }
  return markedPromise;
}

class EmailSender {
  constructor() {
    this.transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
    });
  }

  async sendCoachReport(destinataire, subject, coachAdvice, activityData, trainingStatus = null) {
    const marked = await getMarked();
    const detectedZone = classifyByHR(activityData.avgHR);
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #2c3e50; color: white; padding: 20px; border-radius: 5px 5px 0 0; }
    .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 5px 5px; }
    .activity { background: white; padding: 15px; margin: 10px 0; border-left: 4px solid #3498db; }
    .advice { background: #e8f4f8; padding: 15px; margin: 15px 0; border-radius: 5px; }
    .advice table { border-collapse: collapse; width: 100%; margin: 10px 0; background: white; }
    .advice th, .advice td { border: 1px solid #ccc; padding: 8px; text-align: left; font-size: 14px; }
    .advice th { background: #2c3e50; color: white; }
    .advice h1, .advice h2, .advice h3 { color: #2c3e50; margin-top: 16px; }
    .advice ul, .advice ol { padding-left: 20px; }
    .advice p { margin: 8px 0; }
    .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #999; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🏃 Coach Marathon - Rapport d'Entraînement</h1>
    </div>
    <div class="content">
      <h2>Activité enregistrée</h2>
      <div class="activity">
        <p><strong>Type:</strong> ${activityData.type}</p>
        <p><strong>Distance:</strong> ${activityData.distance} km</p>
        <p><strong>Durée:</strong> ${activityData.duration} min</p>
        <p><strong>Allure:</strong> ${activityData.pace} /km</p>
        <p><strong>FC moyenne:</strong> ${activityData.avgHR} bpm ${zoneBadge(detectedZone)}</p>
        <p><strong>FC max:</strong> ${activityData.maxHR} bpm</p>
      </div>
      ${trainingStatus ? `<div class="activity">${buildTrainingStatusVisual(trainingStatus)}</div>` : ''}

      <h2>Conseils du Coach</h2>
      <div class="advice">
        ${marked.parse(coachAdvice)}
      </div>
      
      <div class="footer">
        <p>${plan.marathon.name} - ${formatDateFr(plan.marathon.date)} | Objectif: ${plan.marathon.objective}</p>
        <p>Continuez votre progression ! 💪</p>
      </div>
    </div>
  </div>
</body>
</html>
    `;

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: destinataire,
      subject: subject,
      html: htmlContent,
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      console.log('Email envoyé:', info.response);
      return true;
    } catch (error) {
      console.error('Erreur envoi email:', error.message);
      throw error;
    }
  }

  async sendWeeklyReport(destinataire, subject, report, weekActivities, weekActualKm = null, weekPlannedKm = null, weeklyStats = null, trainingStatus = null, weeklyProgress = null, racePredictions = null) {
    const marked = await getMarked();
    const activitiesHtml = weekActivities
      .map((a) => `<li>${a.date} — ${a.type} ${a.distance} km à ${a.pace}/km (FC moy. ${a.avgHR} bpm) ${zoneBadge(classifyByHR(a.avgHR))}</li>`)
      .join('');
    const visualBlock = buildWeeklyVisualBlock(weekActualKm, weekPlannedKm, weeklyStats, trainingStatus);
    const progressionVisual = buildWeeklyProgressionVisual(weeklyProgress);
    const racePredictionsVisual = buildRacePredictionsVisual(racePredictions);

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #2c3e50; color: white; padding: 20px; border-radius: 5px 5px 0 0; }
    .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 5px 5px; }
    .activities { background: white; padding: 15px; margin: 10px 0; border-left: 4px solid #3498db; }
    .activities ul { margin: 0; padding-left: 20px; }
    .advice { background: #e8f4f8; padding: 15px; margin: 15px 0; border-radius: 5px; }
    .advice table { border-collapse: collapse; width: 100%; margin: 10px 0; background: white; }
    .advice th, .advice td { border: 1px solid #ccc; padding: 8px; text-align: left; font-size: 14px; }
    .advice th { background: #2c3e50; color: white; }
    .advice h1, .advice h2, .advice h3 { color: #2c3e50; margin-top: 16px; }
    .advice ul, .advice ol { padding-left: 20px; }
    .advice p { margin: 8px 0; }
    .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #999; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📅 Coach Marathon - Bilan Hebdomadaire</h1>
    </div>
    <div class="content">
      <h2>Séances de la semaine</h2>
      <div class="activities">
        <ul>${activitiesHtml}</ul>
      </div>
      ${visualBlock ? `<div class="activities">${visualBlock}</div>` : ''}
      ${progressionVisual ? `<div class="activities">${progressionVisual}</div>` : ''}

      <h2>Bilan du Coach</h2>
      <div class="advice">
        ${marked.parse(report)}
      </div>
      ${racePredictionsVisual ? `<div class="activities">${racePredictionsVisual}</div>` : ''}

      <div class="footer">
        <p>${plan.marathon.name} - ${formatDateFr(plan.marathon.date)} | Objectif: ${plan.marathon.objective}</p>
        <p>Bonne semaine de course ! 💪</p>
      </div>
    </div>
  </div>
</body>
</html>
    `;

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: destinataire,
      subject: subject,
      html: htmlContent,
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      console.log('Email hebdo envoyé:', info.response);
      return true;
    } catch (error) {
      console.error('Erreur envoi email hebdo:', error.message);
      throw error;
    }
  }
}

module.exports = EmailSender;