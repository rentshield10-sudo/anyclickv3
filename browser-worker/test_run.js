const fs = require('fs');

async function runTest() {
  console.log('1. Starting Session (Hacker News Login)...');
  const startRes = await fetch('http://localhost:3001/browser/session/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://news.ycombinator.com/login' })
  });
  const startData = await startRes.json();
  console.log(startData);
  const sessionId = startData.sessionId;

  // Let browser settle
  await new Promise(r => setTimeout(r, 2000));

  console.log('\n2. Filling out the login form...');
  const fillRes = await fetch('http://localhost:3001/browser/form-fill', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      fields: [
        { name: 'acct', value: 'testuser_anyclick' },
        { name: 'pw', value: 'fake_password_123' }
      ]
    })
  });
  const fillData = await fillRes.json();
  console.log(JSON.stringify(fillData, null, 2));

  console.log('\n3. Clicking the login button...');
  const clickRes = await fetch('http://localhost:3001/browser/click', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      intent: 'submit_login',
      target: { text: 'login', role: 'button' }
    })
  });
  const clickData = await clickRes.json();
  console.log(JSON.stringify(clickData, null, 2));

  console.log('\n4. Stopping session...');
  await fetch('http://localhost:3001/browser/session/stop', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId })
  });
  console.log('Done!');
}

runTest().catch(console.error);
