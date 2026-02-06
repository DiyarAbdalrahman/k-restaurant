const { getSettings, updateSettings } = require("./settings.service");

async function get(req, res, next) {
  try {
    const settings = await getSettings();
    res.json(settings);
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const settings = await updateSettings(req.body);
    res.json(settings);
  } catch (err) {
    next(err);
  }
}

module.exports = { get, update };
