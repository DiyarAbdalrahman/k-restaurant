require("dotenv").config();

module.exports = {
  env: {
    JWT_SECRET: process.env.JWT_SECRET,
    PORT: process.env.PORT || 4000,
    DATABASE_URL: process.env.DATABASE_URL,
  },
};

