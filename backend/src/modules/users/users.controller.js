const usersService = require("./users.service");

async function getAllUsers(req, res, next) {
  try {
    const users = await usersService.getAllUsers();
    res.json(users);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getAllUsers,
};
