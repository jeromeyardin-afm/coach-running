const axios = require('axios');

const GARMIN_LOGIN_URL = 'https://sso.garmin.com/sso/signin';
const GARMIN_API_URL = 'https://connect.garmin.com/modern/proxy/activitylist-service/activities/search/activities';

class GarminClient {
  constructor(email, password) {
    this.email = email;
    this.password = password;
    this.session = null;
  }

  async login() {
    try {
      const client = axios.create({
        withCredentials: true,
        jar: true,
      });

      // Récupère les activités récentes (dernières 10)
      const response = await client.post(GARMIN_API_URL, {
        start: 0,
        limit: 10,
      }, {
        headers: {
          'User-Agent': 'Mozilla/5.0',
        },
      });

      return response.data;
    } catch (error) {
      console.error('Erreur Garmin login:', error.message);
      throw error;
    }
  }

  async getActivities() {
    try {
      // Utilise une approche alternative via l'API Garmin Connect
      const headers = {
        'User-Agent': 'Mozilla/5.0',
        'Content-Type': 'application/json',
      };

      const response = await axios.get(
        'https://connect.garmin.com/modern/proxy/activity-service/activity',
        { headers }
      );

      return response.data || [];
    } catch (error) {
      console.error('Erreur récupération activités:', error.message);
      return [];
    }
  }
}

module.exports = GarminClient;