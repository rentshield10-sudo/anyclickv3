import { config } from './src/config';

async function listModels() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${config.GEMINI_API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  const models = data.models || [];
  console.log("Available PRO models:");
  models.filter(m => m.name.includes("pro")).forEach(m => console.log(m.name));
  
  console.log("\nAvailable FLASH models:");
  models.filter(m => m.name.includes("flash")).forEach(m => console.log(m.name));
}

listModels();
