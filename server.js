// Local development server to mimic Vercel serverless functions
const http = require('http');
const url  = require('url');
const path = require('path');
const fs   = require('fs');

// Load .env into process.env (only sets keys not already in environment)
try {
  const lines = fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (key && !(key in process.env)) process.env[key] = val;
  }
} catch { /* no .env file — that's fine */ }

const PORT = process.env.PORT || 3000;

// Function to load and execute API handlers
async function loadHandler(pathname) {
  // Convert /api/cards to /api/cards.js
  let modulePath = path.join(__dirname, pathname + '.js');
  
  // Clear the require cache to allow hot reloading during development
  delete require.cache[require.resolve(modulePath)];
  
  try {
    const handler = require(modulePath);
    return handler;
  } catch (error) {
    console.error(`Error loading handler for ${pathname}:`, error.message);
    return null;
  }
}

// Create the server
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const query = parsedUrl.query;

  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle OPTIONS requests
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Check if it's an API route
  if (pathname.startsWith('/api/')) {
    try {
      const handler = await loadHandler(pathname);
      
      if (!handler) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
        return;
      }

      // Create a mock Vercel request object
      const mockReq = {
        method: req.method,
        url: req.url,
        pathname: pathname,
        query: query,
        body: req.body || {},
        headers: req.headers,
      };

      // Create a mock Vercel response object
      let responseBody = '';
      let responseHeaders = { 'Content-Type': 'application/json' };
      let statusCode = 200;

      const mockRes = {
        status: (code) => {
          statusCode = code;
          return mockRes;
        },
        setHeader: (key, value) => {
          responseHeaders[key] = value;
        },
        json: (data) => {
          responseBody = JSON.stringify(data);
        },
        send: (data) => {
          responseBody = data;
        },
        write: (data) => {
          responseBody += data;
        },
        end: () => {
          res.writeHead(statusCode, responseHeaders);
          res.end(responseBody);
        },
      };

      // Parse JSON body for POST requests
      if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
          body += chunk.toString();
        });
        req.on('end', () => {
          try {
            mockReq.body = body ? JSON.parse(body) : {};
            handler(mockReq, mockRes);
          } catch (e) {
            mockRes.status(400).json({ error: 'Invalid JSON' });
            mockRes.end();
          }
        });
      } else {
        // Execute the handler
        await handler(mockReq, mockRes);
        mockRes.end();
      }
    } catch (error) {
      console.error('Handler execution error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error', message: error.message }));
    }
  } else {
    // Serve a simple welcome page for root path
    if (pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>PokeInvest API - Local Development</title>
          <style>
            body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; }
            h1 { color: #333; }
            code { background: #f5f5f5; padding: 2px 6px; border-radius: 3px; }
            .endpoint { margin: 10px 0; padding: 10px; background: #f9f9f9; border-left: 3px solid #0066cc; }
          </style>
        </head>
        <body>
          <h1>🔥 PokeInvest API - Local Server</h1>
          <p>Running on <code>http://localhost:${PORT}</code></p>
          <h2>Available Endpoints:</h2>
          <div class="endpoint">
            <strong>GET /api/cards</strong> - All secret rares, scored + filtered
          </div>
          <div class="endpoint">
            <strong>GET /api/search</strong> - Search any card by name
          </div>
          <div class="endpoint">
            <strong>GET /api/score</strong> - Full score breakdown for one card + live eBay
          </div>
          <div class="endpoint">
            <strong>GET /api/prices</strong> - Real eBay sold price history
          </div>
          <div class="endpoint">
            <strong>GET /api/trending</strong> - Cards with 7d vs 30d price momentum
          </div>
        </body>
        </html>
      `);
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  }
});

server.listen(PORT, () => {
  console.log(`✨ PokeInvest API running at http://localhost:${PORT}`);
  console.log(`📚 Endpoints available at http://localhost:${PORT}/api/*`);
});
