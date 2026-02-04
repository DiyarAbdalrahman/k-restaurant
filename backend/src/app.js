const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

const { authRouter } = require("./modules/auth/auth.routes");
const usersRouter = require("./modules/users/users.routes");
const menuRouter = require("./modules/menu/menu.routes");
const ordersRouter = require("./modules/orders/orders.routes");
const paymentsRouter = require("./modules/payments/payments.routes");
const tablesRouter = require("./modules/tables/tables.routes");

const { errorHandler } = require("./middleware/error.middleware");

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));
app.use("/api/reports", require("./modules/reports/reports.routes"));

app.use("/api/payments", require("./modules/payments/payments.routes"));


// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Routes
app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/api/menu", menuRouter);
app.use("/api/orders", ordersRouter);
app.use("/api/payments", paymentsRouter);
app.use("/api/tables", tablesRouter);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ message: "Not found" });
});

// Error handler
app.use(errorHandler);

module.exports = app;
