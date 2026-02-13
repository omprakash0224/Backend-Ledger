const express = require('express');
const authRoutes = require('./routes/auth.routes');
const accountRoutes = require('./routes/account.routes');
const cookieParser = require('cookie-parser');

const app = express();

app.use(express.json());
app.use(cookieParser());

app.use("/api/auth", authRoutes);
app.use("/api/accounts", accountRoutes);

module.exports = app;