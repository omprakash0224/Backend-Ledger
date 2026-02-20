const {Router} = require('express');
const authMiddleware = require('../middleware/auth.middleware');
const fraudDetectionMiddleware = require('../middleware/fraud.middleware');
const transactionController = require('../controllers/transaction.controller');

const transactionRoutes = Router();


transactionRoutes.post("/", authMiddleware.authMiddleware, fraudDetectionMiddleware.fraudDetectionMiddleware, transactionController.createTransaction)

transactionRoutes.post("/system/initial-funds", authMiddleware.authSystemUserMiddleware, transactionController.createInitialFundsTransaction)

module.exports = transactionRoutes;