import express, { Request, Response } from "express";
import mqtt, { MqttClient } from "mqtt";

const axios = require("axios").default;

const app = express();

const port = process.env.ESPC3D_PORT || 3001;
const espCompanionAPI = process.env.ESPC3D_API || "";

var sendInterval: number = 2500;

var mqttClient: MqttClient;
var espCompanionConfig: EspCompanionConfig;
var mqttConfig: MqttConfig, floorsConfig: string, nodesConfig: string;

axios.defaults.baseURL = espCompanionAPI;
axios.defaults.headers.post["Content-Type"] = "application/json";

type EspCompanionConfig = {
  mqtt: MqttConfig;
  floors: string;
  nodes: string;  
};

type MqttConfig = {
  host: string;  
  port: number; 
  username?: string;
  password?: string;
};

var trackers: any = {};
var nodeStates: any = {};

async function main() {
  await initConfig();
  initMQTT();
}

main();

// // // //

app.set("view engine", "ejs");

app.get("/", async function (req: Request, res: Response) {
  log(req);
  res.redirect("/index.html");
});

app.get("/api/floors", (req: Request, res: Response) => {
  log(req);

  res.status(200).json(floorsConfig);
});

app.get("/api/nodes", (req: Request, res: Response) => {
  log(req);

  try {
    axios({ url: "/state/config" })
    .then((json: any) => {
      nodesConfig = json.data.nodes;
      res.status(200).json(nodesConfig);
    });
  } catch (error) {
    console.error(error);
    res.status(400);
  }

  
});

function sendServerSendEvent(req: Request, res: Response) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  var sseId: string = new Date().toLocaleTimeString();

  setInterval(function () {
    writeServerSendEvent(res, sseId);
  }, sendInterval);

  writeServerSendEvent(res, sseId);
}

function writeServerSendEvent(res: Response, sseId: string) {
  const obj = {nodeStates: nodeStates, trackers: trackers};
  const data: string = `data: ${JSON.stringify(obj)}\n\n`;
  res.write("id: " + sseId + "\n");
  res.write(data);
}

app.get("/updates", (req: Request, res: Response) => {
  log(req);
  if (req.headers.accept && req.headers.accept == "text/event-stream") {
    sendServerSendEvent(req, res);
  }
});

app.use(express.static("public"));

app.listen(port, () => console.log(`Now Listening on port ${port}`));

// // //

function log(req: Request) {
  var ip = req.headers["x-forwarded-for"] || req.connection.remoteAddress;
  var isodate = new Date().toISOString();
  console.log(isodate, ip, req.method, req.url);
}

async function initConfig() {
  try {
    var espCompanionConfigReq = await axios({ url: "/state/config" });
    espCompanionConfig = espCompanionConfigReq.data;
    mqttConfig = espCompanionConfig.mqtt;
    floorsConfig = espCompanionConfig.floors;
    nodesConfig = espCompanionConfig.nodes;
  } catch (error) {
    console.error(error);
  }
}

function initMQTT() {
  const options = {
    connectTimeout: 3000,
    username: mqttConfig.username,
    password: mqttConfig.password,
  };

  const url = "mqtt://" + mqttConfig.host + ":" + mqttConfig.port;

  mqttClient = mqtt.connect(url, options);

  mqttClient.on("connect", () => {
    console.log("Connected to mqtt");
    mqttClient.subscribe(["espresense/companion/#", "espresense/rooms/+/status"], (err: any) => {
      if (!err) {
        console.log("Subscribed");
      }
    });
  });

  mqttClient.on("message", (topic: string, message: Buffer) => {
    if (topic.startsWith("espresense/rooms/") && topic.endsWith("/status")) {
      var fields: string[] = topic.split("/");
      var nodeName = fields[2];
      nodeStates[nodeName] = message.toString();
    }
    if (topic.includes("attributes")) {
      var fields: string[] = topic.split("/");
      var trackName = fields[2];

      var mqttOutput = JSON.parse(message.toString());
      mqttOutput.name = trackName;

      trackers[trackName] = mqttOutput;
    }
  });
}
