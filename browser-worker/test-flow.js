const http = require('http');

async function request(path, method, body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3001,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

(async () => {
  try {
    console.log("1. Starting session...");
    const startRes = await request('/start', 'POST', {
      taskId: 'test-node-1',
      url: 'https://example.com',
      engine: 'playwright'
    });
    console.log("Start Result:", startRes.ok, "Session ID:", startRes.sessionId);

    const sessionId = startRes.sessionId;

    console.log("\n2. Getting state...");
    const stateRes = await request(`/state?sessionId=${sessionId}`, 'GET');
    console.log("State Result:", stateRes.ok, "Title:", stateRes.state?.title);
    console.log("Elements visible:", stateRes.state?.elements?.length);

    console.log("\n3. Planning...");
    const planRes = await request('/plan', 'POST', {
      sessionId,
      goal: 'Click on the More information link'
    });
    console.log("Plan Result:", JSON.stringify(planRes, null, 2));

    if (planRes.ok && planRes.action) {
      console.log("\n4. Acting...");
      const actRes = await request('/act', 'POST', {
        sessionId,
        action: planRes.action
      });
      console.log("Act Result:", actRes.ok, "Executed:", actRes.executed, "Changed:", actRes.changed);
      console.log("New URL:", actRes.state?.url);
    }
  } catch (err) {
    console.error("Test failed:", err);
  }
})();
