var createError = require('http-errors');
var express = require('express');
var logger = require('morgan');
const koffi = require('koffi')
const path = require('path')
const os = require('os')

var app = express();

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Determine the correct library extension based on OS
const getLibExtension = () => {
  const platform = os.platform();
  switch (platform) {
    case 'darwin':
      return '.dylib';
    case 'linux':
      return '.so';
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
};

// Load the appropriate library
const libPath = path.join(__dirname, 'lib', `url_client${getLibExtension()}`);
const lib = koffi.load(libPath);

const sendHttpRequest = lib.func('char* send_http_request(const char* url)');

const url = 'https://srv.moonshot.money/categories?limit=10';

app.get('/', function (req, res) {
  try {
    const result = sendHttpRequest(url);
    res.json({ message: result });
  } catch (error) {
    console.error('Error calling send_http_request:', error);
    res.status(500).json({ error: 'Failed to process request' });
  }
});

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
