import { Server, createServer } from 'http';
import cors from 'cors';
import express, {
  Request,
  Response,
  NextFunction,
  Application,
  ErrorRequestHandler,
} from 'express';
import bodyParser from 'body-parser';
import createHttpError from 'http-errors';
import { ALGO } from './helpers/constants';
import { setCred } from './helpers/functions';
import dotenv from 'dotenv';
const app: Application = express();
app.use(bodyParser.json());
app.use(cors());
dotenv.config();
const server: Server = createServer(app);
server.listen(process.env.PORT, () => {
  console.log(`${ALGO}: Server running on PORT number ${process.env.PORT}`);
});
app.get('/', (req: Request, res: Response) => {
  res.json({ status: 'ok', lastUpdated: '2023-08-18, 00:33:00' });
});
process.on('uncaughtException', function (err) {
  console.log(err);
});
app.use((req: Request, res: Response, next: NextFunction) => {
  next(new createHttpError.NotFound());
});
const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  res.status(err.status || 500);
  res.send({ status: err.status || 500, message: err.message });
};
app.use(errorHandler);
