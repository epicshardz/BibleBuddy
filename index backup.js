const express = require('express')
const path = require('path')
const { spawn } = require('child_process');
const isHeroku = process.env.NODE_ENV === 'production' && process.env.DYNO;
const pythonPath = isHeroku ? '/usr/bin/python' : 'C:/Python310/python.exe';
const app = express()
const PORT = process.env.PORT || 5001
const redis = require('redis');
const client = redis.createClient(process.env.REDIS_URL);

app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: function(res, path) {
    if (path.endsWith('.js')) {
      res.set('Content-Type', 'text/javascript');
    }
  }
}));

app.set('views', path.join(__dirname, 'views'))
app.set('view engine', 'ejs')
app.get('/', (req, res) => res.render('pages/index'))

app.use(express.json())
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


app.post('/', async (req, res) => {
  try {
    const input = req.body.prompt;
    const selectedOption1 = req.body.selectedOption1;
    const selectedOption2 = req.body.selectedOption2;
    const last_response = req.body.last_response;
    const last_prompt = req.body.last_prompt;


    console.log('prompt: ', input);
    console.log('last_response: ', last_response);

    const pyProg = spawn(pythonPath, ['./queryandrequest.py', input, selectedOption1, selectedOption2, last_response, last_prompt]);

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
  } catch (error) {
    console.error(error);
    res.status(500).send(error || 'Something went wrong');
    res.send(JSON.stringify({error:data.toString()}));
  }
})

app.listen(PORT, () => console.log(`AI server started on http://localhost:${PORT}`));