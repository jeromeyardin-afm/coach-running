module.exports = async (req, res) => {
  try {
    console.log('✅ Agent coach running testé');
    
    return res.status(200).json({ 
      success: true,
      message: 'Agent opérationnel',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Erreur:', error);
    return res.status(500).json({ error: error.message });
  }
};