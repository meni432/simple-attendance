const express = require('express');
const serverless = require('serverless-http');
const qr = require('qr-image');
const jwt = require('jsonwebtoken');
const { GetSecretValueCommand, SecretsManagerClient } = require('@aws-sdk/client-secrets-manager');
const path = require('path');
const app = express();
const { auth, requiresAuth } = require('express-openid-connect');
const { userInfo } = require('os');
const bodyParser = require('body-parser');
const { updateAttendance, getClassAttendance } = require('./models/attendanceRepository');

app.engine('.html', require('ejs').__express);
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

const urlencodedParser = bodyParser.urlencoded({ extended: false });

const JWT_SECRET_NAME = process.env.JWT_SECRET_NAME;
const AWS_REGION = process.env.AWS_REGION;
const BASE_URL = process.env.BASE_URL;

let jwtSecret = undefined;

const config = {
  authRequired: false,
  auth0Logout: true,
  secret: 'a long, randomly-generated string stored in env',
  clientID: 'rjAeUt83f5nJ894FbLCgY4vLL8rUMwaQ',
  baseURL: BASE_URL,
  issuerBaseURL: 'https://meni.auth0.com'
};

// add step before the first route
app.use(async (req, res, next) => {
  if (!jwtSecret) {
    const client = new SecretsManagerClient({ region: AWS_REGION });
    const command = new GetSecretValueCommand({ SecretId: JWT_SECRET_NAME });
    const response = await client.send(command);
    const secretString = response.SecretString;
    const secretJson = JSON.parse(secretString);
    jwtSecret = secretJson.jwtSecret;
  }
  next();
});

// auth router attaches /login, /logout, and /callback routes to the baseURL
app.use(auth(config));

app.get('/generateCode/:classId', (req, res) => {
  const classId = req.params.classId;
  var token = jwt.sign({ classId: classId }, jwtSecret, { expiresIn: '5m' });

  const qrContent = `${BASE_URL}/entrypoint/${token}`;
  const svgString = qr.imageSync(qrContent, { type: 'svg' });
  res.type('image/svg+xml');
  res.appendHeader('QR-Content', qrContent)
  res.send(svgString);
}
);

app.get('/entrypoint/:token', requiresAuth(), async (req, res) => {
  const token = req.params.token;
  let decoded = undefined;
  try {
    decoded = jwt.verify(token, jwtSecret);
  } catch (err) {
    res.status(401).render('error.html', {
      title: "Simple Attendance System",
      message: "Invalid token, try to scan the QR code again.",
    });
    return;
  }
  await updateAttendance(decoded.classId, req.oidc.user.email, true, JSON.stringify(req.oidc.user));
  res.render('info.html', {
    title: "Simple Attendance System",
    message: "Attendance registered successfully.",
  });
  console.log('Successfull entry', { classId: decoded.classId, userInfo: JSON.stringify(req.oidc.user) });
});

app.get('/registerPage/:classId', async (req, res) => {
  const classId = req.params.classId;
  const qrContentUrl = `${BASE_URL}/generateCode/${classId}`;
  const attendancesFromDB = await getClassAttendance(classId);
  const attendances = attendancesFromDB.map(item => item.email);
  res.render('register.html', {
    attendances: attendances,
    title: "Simple Attendance System",
    qrContentUrl: qrContentUrl,
    refreshInterval: 10,
  });
});

app.post('/registerPage', urlencodedParser, function (req, res) {
  const classId = req.body.classId;
  res.redirect(`/registerPage/${classId}`);
}
);

app.get('/', (req, res) => {
  res.render('intro.html', {
    title: "Simple Attendance System",
  });
});

module.exports.handler = serverless(app);
