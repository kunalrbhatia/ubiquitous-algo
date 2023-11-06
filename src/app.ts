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
import { runOrb } from './helpers/apiService';
import { ALGO } from './helpers/constants';
import { isTradeAllowed, setCred } from './helpers/functions';
import dotenv from 'dotenv';
import { Socket } from 'net';
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
    console.log('Received kill signal, shutting down gracefully');
    server.close(() => {
      console.log('Closed out remaining connections');
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

app.post('/orb', async (req: Request, res: Response) => {
  console.log(`\n${ALGO}: ^^^^^^^^^^^^^^^^ORB STARTS^^^^^^^^^^^^^^`);
  try {
    const istTz = new Date().toLocaleString('default', {
      timeZone: 'Asia/Kolkata',
    });
    console.log(`${ALGO}: time, ${istTz}`);
    setCred(req);
    let response;
    const scriptName: string = req.body.script_name;
    const price: number = req.body.price;
    const maxSl: number = req.body.max_sl || -2000;
    const trailSl: number = req.body.trail_sl || 500;
    const tradeDirection: 'up' | 'down' = req.body.trade_direction;
    const canTakeTrade = await isTradeAllowed();
    if (canTakeTrade) {
      response = await runOrb({
        scriptName,
        price,
        maxSl,
        tradeDirection,
        trailSl,
      });
    }
    console.log(`\n${ALGO}: ${response}`);
    res.send(response);
  } catch (err) {
    console.log(err);
    res.send({ response: err });
  }
  console.log(`\n${ALGO}: ^^^^^^^^^^^^^^^^ORB ENDS^^^^^^^^^^^^^^`);
});
app.use((req: Request, res: Response, next: NextFunction) => {
  next(new createHttpError.NotFound());
});
const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  res.status(err.status || 500);
  res.send({ status: err.status || 500, message: err.message });
};
app.use(errorHandler);
