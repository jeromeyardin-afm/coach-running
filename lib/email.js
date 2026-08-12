const nodemailer = require('nodemailer');
const plan = require('./plan');
const { formatDateFr } = require('./planUtils');

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

  async sendCoachReport(destinataire, subject, coachAdvice, activityData) {
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
        <p><strong>FC moyenne:</strong> ${activityData.avgHR} bpm</p>
        <p><strong>FC max:</strong> ${activityData.maxHR} bpm</p>
      </div>
      
      <h2>Conseils du Coach</h2>
      <div class="advice">
        ${coachAdvice.split('\n').map(line => `<p>${line}</p>`).join('')}
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

  async sendWeeklyReport(destinataire, subject, report, weekActivities) {
    const activitiesHtml = weekActivities
      .map((a) => `<li>${a.date} — ${a.type} ${a.distance} km à ${a.pace}/km (FC moy. ${a.avgHR} bpm)</li>`)
      .join('');

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

      <h2>Bilan du Coach</h2>
      <div class="advice">
        ${report.split('\n').map(line => `<p>${line}</p>`).join('')}
      </div>

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