const express = require('express');
const path = require('path');
const { spawn } = require('child_process');
const Queue = require('bull');
const redis = require('redis');

const isHeroku = process.env.NODE_ENV === 'production' && process.env.DYNO;
const pythonPath = isHeroku ? '/usr/bin/python' : 'C:/Python310/python.exe';
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const isProduction = process.env.NODE_ENV === 'production';

const app = express();
const PORT = process.env.PORT || 5001;

// Create a Redis client and a new Bull queue
// const redisClient = redis.createClient(REDIS_URL);
// const queue = new Queue('openai', REDIS_URL);

app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: function(res, path) {
    if (path.endsWith('.js')) {
      res.set('Content-Type', 'text/javascript');
    }
  }
}));

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.get('/', (req, res) => res.render('pages/index'));

app.use(express.json());

function extractStrings(response) {
  const texts = [];
  const pageContentStart = 'page_content=';
  const lookupStrStart = ', lookup_str=';
  let startIndex = response.indexOf(pageContentStart);

  while (startIndex !== -1) {
    const endIndex = response.indexOf(lookupStrStart, startIndex);
    const text = response.slice(startIndex + pageContentStart.length + 1, endIndex - 2);
    texts.push(text);
    startIndex = response.indexOf(pageContentStart, endIndex);
  }

  return texts;
}

async function openaiWorker(job) {
  const data = job.data;

  const pyProg = spawn(pythonPath, ['./queryandrequest.py', JSON.stringify(data)]);

  return new Promise((resolve, reject) => {
    let response = '';

    pyProg.stdout.on('data', (data) => {
      response += data.toString();
    });

    pyProg.stderr.on('data', (data) => {
      console.error(`Error from Python script: ${data}`);
    });

    pyProg.on('close', (code) => {
      console.log(`Python script exited with code ${code}`);
      const cleanedText = extractStrings(response);
      const startIndex = response.indexOf('{');
      const endIndex = response.lastIndexOf('}');
      const result = response.substring(startIndex, endIndex + 1);
      const match = result.match(/{([^}]+)}/);
      const clean_text = match ? match[1] : '';
      console.log('Response:', clean_text);
      resolve({clean_text, cleanedText});
    });
  });
}

if (isProduction) {
  // Create a Redis client and a new Bull queue
  const REDIS_URL = process.env.REDIS_URL;
  const redisClient = redis.createClient(REDIS_URL);
  queue = new Queue('openai', REDIS_URL);

  // Register the worker function with Bull and process jobs from the queue
  queue.process(async (job) => {
    console.log(`Processing job ${job.id}`);
    const result = await openaiWorker(job);
    console.log(`Job ${job.id} completed with result ${result}`);
    return result;
  });
}

app.post('/', async (req, res) => {
  try {
    const input = req.body.prompt;
    const selectedOption1 = req.body.selectedOption1;
    const selectedOption2 = req.body.selectedOption2;
    const last_response = req.body.last_response;
    const last_prompt = req.body.last_prompt;

    console.log('prompt: ', input);
    console.log('last_response: ', last_response);

    const data = {
      prompt: input,
      selectedOption1: selectedOption1,
      selectedOption2: selectedOption2,
      last_response: last_response,
      last_prompt: last_prompt
    };

    let result;
    let cleanedText;
    if (isProduction) {
      // Add the request data to the Bull queue
      const job = await queue.add(data);
      console.log(`Job ${job.id} added to queue`);
      

      // Wait for the job to complete
      response = await job.finished();

      const responseData = response.data; // Extract the data property from the response object
      // cleanedText = result.cleanedText;
      // result = result.result;
      // console.log(`Python script exited with code ${code}`);

      const cleanedText = extractStrings(responseData);
      const startIndex = responseData.indexOf('{');
      const endIndex = responseData.lastIndexOf('}');
      const result = responseData.substring(startIndex, endIndex + 1);
      const match = result.match(/{([^}]+)}/);
      const clean_text = match ? match[1] : '';
      console.log('responseData:', clean_text);
      res.status(200).send({
        bot: clean_text,
        source_documents: cleanedText
      });
      
    } else {
      // Process the request directly without using the queue
      const pyProg = spawn(pythonPath, ['./queryandrequest.py', JSON.stringify(data)]);

      let response = '';

      pyProg.stdout.on('data', (data) => {
        response += data.toString();
      });

      pyProg.stderr.on('data', (data) => {
        console.error(`Error from Python script: ${data}`);
      });

      pyProg.on('close', (code) => {
        console.log(`Python script exited with code ${code}`);
        const cleanedText = extractStrings(response);
        const startIndex = response.indexOf('{');
        const endIndex = response.lastIndexOf('}');
        const result = response.substring(startIndex, endIndex + 1);
        const match = result.match(/{([^}]+)}/);
        const clean_text = match ? match[1] : '';
        console.log('Response:', clean_text);
        res.status(200).send({
          bot: clean_text,
          source_documents: cleanedText
        });
  
      });
    }

  } catch (error) {
    console.error(error);
    res.status(500).send(error || 'Something went wrong');
  }
});


app.listen(PORT, () => console.log(`AI server started on http://localhost:${PORT}`));