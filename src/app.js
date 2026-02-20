const express = require('express');
const authRoutes = require('./routes/auth.routes');
const accountRoutes = require('./routes/account.routes');
const transactionRoutes = require('./routes/transaction.routes');
const cookieParser = require('cookie-parser');
const swaggerUi = require('swagger-ui-express');
const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');

const app = express();

// ── Swagger Docs ──────────────────────────────
const swaggerDoc = yaml.load(
  fs.readFileSync(path.join(__dirname, '../swagger.yaml'), 'utf8')
);
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerDoc));

app.use(express.json());
app.use(cookieParser());

app.use("/api/auth", authRoutes);
app.use("/api/accounts", accountRoutes);
app.use("/api/transactions", transactionRoutes);

module.exports = app;