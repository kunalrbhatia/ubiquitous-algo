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
import { getStocks, runOrb } from './helpers/apiService';
import { ALGO } from './helpers/constants';
import { isTradeAllowed, setCred } from './helpers/functions';
import dotenv from 'dotenv';
import { Socket } from 'net';
import { log } from 'console';
import { Scrips } from './app.interface';

const app: Application = express();
app.use(bodyParser.json());
app.use(cors());
dotenv.config();
const server: Server = createServer(app);
server.listen(process.env.PORT, () => {
  log(`${ALGO}: Server running on PORT number ${process.env.PORT}`);
});
app.get('/', (req: Request, res: Response) => {
  res.json({ status: 'ok', lastUpdated: '2023-11-11, 03:53:00' });
});
process.on('uncaughtException', function (err) {
  log(err);
});
let connections: Socket[] = [];
server.on('connection', (connection) => {
  connections.push(connection);
  connection.on(
    'close',
    () => (connections = connections.filter((curr) => curr !== connection))
  );
});
app.get('/kill', (req, res) => {
  setTimeout(() => {
    log('Received kill signal, shutting down gracefully');
    server.close(() => {
      log('Closed out remaining connections');
      process.exit(0);
    });
    setTimeout(() => {
      console.error(
        'Could not close connections in time, forcefully shutting down'
      );
      process.exit(1);
    }, 10000);
    connections.forEach((curr) => curr.end());
    setTimeout(() => connections.forEach((curr) => curr.destroy()), 5000);
  }, 1000);
  res.send("Execution of the 'Kill Algo' command has been initiated.");
});
app.post('/stock', async (req: Request, res: Response) => {
  log(`\n${ALGO}: ^^^^^^^^^^^^^^^^FIND STOCK STARTS^^^^^^^^^^^^^^`);
  try {
    const istTz = new Date().toLocaleString('default', {
      timeZone: 'Asia/Kolkata',
    });
    log(`${ALGO}: time, ${istTz}`);
    setCred(req);
    const scriptName: string = String(req.body.script_name).toUpperCase();
    const strike: string = String(req.body.strike).toUpperCase();
    const optionType: string = String(req.body.option_type).toUpperCase();
    const script = await getStocks({ scriptName, strike, optionType });
    res.send(script);
  } catch (err) {
    log(err);
    res.send({ response: err });
  }
  log(`\n${ALGO}: ^^^^^^^^^^^^^^^^FIND STOCK ENDS^^^^^^^^^^^^^^`);
});
app.post('/orb', async (req: Request, res: Response) => {
  log(`\n${ALGO}: ^^^^^^^^^^^^^^^^ORB STARTS^^^^^^^^^^^^^^`);
  try {
    const istTz = new Date().toLocaleString('default', {
      timeZone: 'Asia/Kolkata',
    });
    log(`${ALGO}: time, ${istTz}`);
    setCred(req);
    let response = { mtm: -1 };
    const scrips: Scrips[] = req.body.scrips;
    log(`${ALGO}: calling isTradeAllowed function...`);
    const canTakeTrade = await isTradeAllowed();
    //if (canTakeTrade) {
    response = await runOrb({
      scrips,
    });
    //}
    log(`\n${ALGO}: mtm object `, response);
    res.send(response);
  } catch (err) {
    log(err);
    res.send({ response: err });
  }
  log(`\n${ALGO}: ^^^^^^^^^^^^^^^^ORB ENDS^^^^^^^^^^^^^^`);
});
app.use((req: Request, res: Response, next: NextFunction) => {
  next(new createHttpError.NotFound());
});
const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  res.status(err.status || 500);
  res.send({ status: err.status || 500, message: err.message });
};
app.use(errorHandler);
