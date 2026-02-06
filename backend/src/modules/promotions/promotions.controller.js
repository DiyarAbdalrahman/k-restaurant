const promotionsService = require("./promotions.service");

async function list(req, res, next) {
  try {
    res.json(await promotionsService.listPromotions());
  } catch (e) {
    next(e);
  }
}

async function listActive(req, res, next) {
  try {
    res.json(await promotionsService.listActivePromotions());
  } catch (e) {
    next(e);
  }
}

async function create(req, res, next) {
  try {
    const promo = await promotionsService.createPromotion(req.body);
    res.status(201).json(promo);
  } catch (e) {
    next(e);
  }
}

async function update(req, res, next) {
  try {
    const promo = await promotionsService.updatePromotion(req.params.id, req.body);
    res.json(promo);
  } catch (e) {
    next(e);
  }
}

async function remove(req, res, next) {
  try {
    await promotionsService.deletePromotion(req.params.id);
    res.json({ message: "Promotion deleted" });
  } catch (e) {
    next(e);
  }
}

module.exports = { list, listActive, create, update, remove };
