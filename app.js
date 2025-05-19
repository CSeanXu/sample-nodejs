var createError = require('http-errors');
var cors = require('cors');
var express = require('express');
var logger = require('morgan');
const koffi = require('koffi')
const path = require('path')
const os = require('os')

var app = express();

app.use(logger('dev'));
app.use(cors());
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
const libPath = path.join(__dirname, 'lib', `moonshot${getLibExtension()}`);
const lib = koffi.load(libPath);

const queryMoonshot = lib.func('char* send_http_request()');

// Parse raw HTTP response
function parseHttpResponse(rawResponse) {
  // Split response into headers and body
  const [headerPart, ...bodyParts] = rawResponse.split('\r\n\r\n');
  const body = bodyParts.join('\r\n\r\n');

  // Parse status line and headers
  const [statusLine, ...headerLines] = headerPart.split('\r\n');
  const [_, statusCode] = statusLine.match(/HTTP\/\d\.\d (\d+)/);
  
  // Parse headers
  const headers = {};
  headerLines.forEach(line => {
    const [key, value] = line.split(': ').map(s => s.trim());
    if (key && value) {
      // Handle multiple headers with same name
      if (headers[key]) {
        if (Array.isArray(headers[key])) {
          headers[key].push(value);
        } else {
          headers[key] = [headers[key], value];
        }
      } else {
        headers[key.toLowerCase()] = value;
      }
    }
  });

  // Handle chunked transfer encoding
  let parsedBody = body;
  if (headers['transfer-encoding'] === 'chunked') {
    const chunks = body.split('\r\n');
    let decodedBody = '';
    let i = 0;
    
    while (i < chunks.length) {
      // Get chunk size (hex)
      const chunkSize = parseInt(chunks[i], 16);
      if (isNaN(chunkSize)) break;
      
      // Skip empty chunks
      if (chunkSize === 0) break;
      
      // Get chunk data
      i++;
      if (i < chunks.length) {
        decodedBody += chunks[i];
      }
      
      // Move to next chunk
      i++;
    }
    
    parsedBody = decodedBody;
  }

  // Parse body if it's JSON
  if (headers['content-type']?.includes('application/json')) {
    try {
      parsedBody = JSON.parse(parsedBody);
    } catch (e) {
      console.warn('Failed to parse JSON body:', e);
    }
  }

  return {
    statusCode: parseInt(statusCode, 10),
    headers,
    body: parsedBody
  };
}

app.get('/', function (req, res) {
  try {
    const rawResponse = queryMoonshot();
    const parsedResponse = parseHttpResponse(rawResponse);
    // res.json(parsedResponse);
    res.json(parsedResponse.body);
  } catch (error) {
    console.error('Error processing response:', error);
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
