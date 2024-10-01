import { Router } from 'express';
import { webhook } from '../controllers/mpController.js';

const mpRouter = Router();

mpRouter.post('/webhook', webhook);

export default mpRouter;
