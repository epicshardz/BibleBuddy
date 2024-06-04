const express = require('express');
const path = require('path');
const { spawn } = require('child_process');
const Queue = require('bull');
const redis = require('redis');
const WebSocket = require('ws'); // 1. Import WebSocket library
const http = require('http');
require('dotenv').config();

const LegalQA = require('./conversationalQAchain.js'); // Import the LegalQA module

// Configuration
const isHeroku = process.env.NODE_ENV === 'production' && process.env.DYNO;
const pythonPath = isHeroku ? '/usr/bin/python' : 'C:\\Users\\mrsmi\\Documents\\LawyerBuddy\\LawyerBuddyEnv\\Scripts\\python.exe';
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const isProduction = process.env.NODE_ENV === 'production';
const PORT = process.env.PORT || 6001;
const bannedIPs = new Set(['123.45.67.89', '98.76.54.32', '90.39.50.191', '83.233.221.192']);

const app = express();
app.use(express.static(path.join(__dirname, 'public'), {
    setHeaders: function(res, path) {
        if (path.endsWith('.js')) {
            res.set('Content-Type', 'text/javascript');
        }
    }
}));
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(express.json());

app.get('/', (req, res) => res.render('pages/index'));
app.get('/page/privacy', (req, res) => res.render('pages/privacy'));

// Function to extract strings from the response
function extractStrings(response) {
    const texts = [];
    const pageContentStart = 'page_content=';
    const lookupStrStart = ', lookup_str=';
    const metadataStart = 'metadata=';
    const hyperlinkRegex = /https?:\/\/.*\.txt/;

    let startIndex = response.indexOf(pageContentStart);

    while (startIndex !== -1) {
        const endIndex = response.indexOf(lookupStrStart, startIndex);
        const text = response.slice(startIndex + pageContentStart.length + 1, endIndex - 2);

        const metadataIndex = response.indexOf(metadataStart, endIndex);
        if (metadataIndex !== -1) {
            const metadataEndIndex = response.indexOf(',', metadataIndex);
            const metadataStr = response.slice(metadataIndex + metadataStart.length + 1, metadataEndIndex - 1);
            const decodedMetadata = decodeURIComponent(metadataStr);
            const hyperlinkMatch = decodedMetadata.match(hyperlinkRegex);
            if (hyperlinkMatch) {
                const hyperlink = hyperlinkMatch[0].replace(/\.txt$/, '');
                texts.push(`<a href="${hyperlink}" target="_blank">${hyperlink}</a><br>${text}`);
            } else {
                texts.push(text);
            }
        } else {
            texts.push(text);
        }

        startIndex = response.indexOf(pageContentStart, endIndex);
    }

    return texts;
}

async function openaiWorker(job, ws) { // Add ws as a separate argument
    const data = job.data;

    const pyProg = spawn(pythonPath, ['./queryandrequest.py', JSON.stringify(data)]);

    return new Promise((resolve, reject) => {
        let response = '';

        const stayAliveDelimiter = '{{{{stay_alive}}}}';

        pyProg.stdout.on('data', (data) => {
            const dataStr = data.toString();
            if (dataStr.includes(stayAliveDelimiter)) {
                console.log('Received stay alive signal from Python script');
                ws.send(JSON.stringify({ type: 'stay_alive' }));
            } else {
                response += dataStr;
                const answerStartDelimiter = '{{{{answer}}}}';
                const answerEndDelimiter = '{{{/answer}}}}';
                let startIndex = response.indexOf(answerStartDelimiter);
                let endIndex = response.indexOf(answerEndDelimiter, startIndex);
                while (startIndex !== -1 && endIndex !== -1) {
                    const result = response.substring(startIndex + answerStartDelimiter.length, endIndex);
                    ws.send(JSON.stringify({ type: 'result', clean_text: result }));
                    response = response.slice(endIndex + answerEndDelimiter.length);
                    startIndex = response.indexOf(answerStartDelimiter);
                    endIndex = response.indexOf(answerEndDelimiter, startIndex);
                }
            }
        });

        pyProg.stderr.on('data', (data) => {
            console.error(`Error from Python script: ${data}`);
        });

        pyProg.on('close', (code) => {
            console.log(`Python script exited with code ${code}`);
            const cleanedText = extractStrings(response);
            ws.send(JSON.stringify({ type: 'result', cleanedText }));
            resolve({ cleanedText });
        });
    });
}

let queue;
let ws; // Store the WebSocket instance

if (isProduction) {
    // Create a Redis client and a new Bull queue
    const redisClient = redis.createClient(REDIS_URL);
    queue = new Queue('openai', REDIS_URL, { redis: { client: redisClient } });

    // Register the worker function with Bull and process jobs from the queue
    queue.process(async (job) => {
        console.log(`Processing job ${job.id}`);
        const result = await openaiWorker(job, ws);
        console.log(`Job ${job.id} completed with result ${result}`);
        return result;
    });
}

// Handle WebSocket connections
const httpServer = http.createServer();
const wss = new WebSocket.Server({ noServer: true, debug: true });
const clients = new Set();

httpServer.on('upgrade', (request, socket, head) => {
    const { protocol, host } = new URL(`http://${request.headers.host}${request.url}`);
    if (protocol === 'http:' || protocol === 'https:') {
        wss.handleUpgrade(request, socket, head, (_ws) => {
            ws = _ws; // Store the WebSocket instance
            wss.emit('connection', ws, request);
        });
    } else {
        socket.destroy();
    }
});

wss.on('connection', (_ws, req) => {
    ws = _ws;
    clients.add(ws);

    console.log('WebSocket client connected');

    const forwardedFor = req.headers['x-forwarded-for'];
    ws.ip = forwardedFor ? forwardedFor.split(',')[0] : req.socket.remoteAddress;
    console.log(`Client-IP: ${ws.ip}`);

    if (bannedIPs.has(ws.ip)) {
        console.log(`WebSocket connection from banned IP ${ws.ip} rejected`);
        ws.terminate();
        return;
    }

    ws.on('message', async (message) => {
        console.log(`Received WebSocket message: ${message}`);
        // console.log(`from Client IP: ${req.socket.remoteAddress}: ${message}`);

        try {
            const data = JSON.parse(message).data;
            console.log('data at server:', data)
            const input = data.prompt;
            const selectedOption1 = data.selectedOption1;
            const selectedOption2 = data.selectedOption2;
            const selectedOption3 = data.selectedOption3;
            const selectedOption4 = data.selectedOption4;
            const last_response = data.last_response;
            const last_prompt = data.last_prompt;
            console.log("selected model: ", selectedOption3)
            console.log('prompt: ', input);
            // console.log('last_response: ', last_response);

            const requestData = {
                prompt: input,
                selectedOption1: selectedOption1,
                selectedOption2: selectedOption2,
                selectedOption3: selectedOption3,
                selectedOption4: selectedOption4,
                last_response: last_response,
                last_prompt: last_prompt
            };

            let result;
            let cleanedText;
            if (isProduction) {
                // Add the request data to the Bull queue
                queue.add(requestData)
                    .then((job) => {
                        console.log(`Job ${job.id} added to queue`);
                        // Wait for the worker to finish processing
                        return job.finished(null, ws); // Pass the WebSocket connection
                    })
                    .then((response) => {
                        // Extract clean_text and cleanedText from the response object
                        const { clean_text, cleanedText } = response;

                        // Send the response back to the client
                        ws.send(JSON.stringify({ type: 'result', clean_text, cleanedText }));
                    });


            } else {
                if (data.selectedOption4 === "Team of AI") {
                    const script = './multiagent_bidding_lawyers_terminal.py';
                    const pyProg = spawn(pythonPath, [script, JSON.stringify(data)]);

                    let response = '';

                    const stayAliveDelimiter = '{{{{stay_alive}}}}';
                    const answerStartDelimiter = '{{{{answer}}}}';
                    const answerEndDelimiter = '{{{/answer}}}}';
                    const loggingDelimiter = '{{{{logging}}}}';

                    pyProg.stdout.on('data', (data) => {
                        const dataStr = data.toString();
                        if (dataStr.includes(stayAliveDelimiter)) {
                            console.log('Received stay alive signal from Python script');
                            ws.send(JSON.stringify({ type: 'stay_alive' }));

                        } else if (dataStr.includes(loggingDelimiter)) {
                            console.log('Printout from Python:', dataStr);
                            // ws.send(JSON.stringify({ type: 'stay_alive' }));

                        }
                        else {
                            response += dataStr;
                            let startIndex = response.indexOf(answerStartDelimiter);
                            let endIndex = response.indexOf(answerEndDelimiter, startIndex);
                            const cleanedText = extractStrings(response);
                            while (startIndex !== -1 && endIndex !== -1) {
                                const result = response.substring(startIndex + answerStartDelimiter.length, endIndex);

                                ws.send(JSON.stringify({ type: 'result', clean_text: result }));
                                response = response.slice(endIndex + answerEndDelimiter.length);
                                startIndex = response.indexOf(answerStartDelimiter);
                                endIndex = response.indexOf(answerEndDelimiter, startIndex);
                            }
                        }
                    });

                    pyProg.stderr.on('data', (data) => {
                        console.error(`Error from Python script: ${data}`);
                    });
                    pyProg.stdout.on('data', (data) => {
                        const dataStr = data.toString();
                        console.log('Python script output:', dataStr);
                    });

                    pyProg.on('close', (code) => {
                        console.log(`Python script exited with code ${code}`);
                        const cleanedText = extractStrings(response);
                        // Send the response back to the client
                        ws.send(JSON.stringify({ type: 'result', cleanedText }));
                    });
                } else {
                    // Use LegalQA for Single AI case
                    const legalQA = new LegalQA();
                    try {
                        const response = await legalQA.getLegalAnswer(requestData);
                        console.log(response)
                        ws.send(JSON.stringify({ type: 'result', clean_text: response.clean_text, cleanedText: response.cleanedText }));
                    } catch (error) {
                        console.error(`Error from LegalQA: ${error}`);
                        ws.send(JSON.stringify({ type: 'error', message: error.message }));
                    }
                }
            }
        } catch (error) {
            console.error(error);
            // Send the error response back to the client
            ws.send(JSON.stringify({ type: 'error', message: error.message }));
        }

    });

    ws.on('close', () => {
        clients.delete(ws);
        console.log('WebSocket client disconnected');
    });
});

app.post('/', async (req, res) => {
    try {
        const input = req.body.prompt;
        const selectedOption1 = req.body.selectedOption1;
        const selectedOption2 = req.body.selectedOption2;
        const selectedOption3 = req.body.selectedOption3;
        const selectedOption4 = req.body.selectedOption4;
        const last_response = req.body.last_response;
        const last_prompt = req.body.last_prompt;
        console.log("selected model: ", selectedOption3)
        console.log('prompt: ', input);
        console.log('last_response: ', last_response);

        const data = {
            prompt: input,
            selectedOption1: selectedOption1,
            selectedOption2: selectedOption2,
            selectedOption3: selectedOption3,
            selectedOption4: selectedOption4,
            last_response: last_response,
            last_prompt: last_prompt
        };

        if (isProduction) {
            const job = await queue.add(data);
            console.log(`Job ${job.id} added to queue`);
            await job.finished(null, ws);
            console.log(`Job ${job.id} completed`);
        } else {
            if (data.selectedOption4 === "Team of AI") {
                const script = './multiagent_bidding_lawyers_terminal.py';
                const pyProg = spawn(pythonPath, [script, JSON.stringify(data)]);

                let response = '';
                const stayAliveDelimiter = '{{{{stay_alive}}}}';
                const answerStartDelimiter = '{{{{answer}}}}';
                const answerEndDelimiter = '{{{/answer}}}}';
                const loggingDelimiter = '{{{{logging}}}}';

                pyProg.stdout.on('data', (data) => {
                    const dataStr = data.toString();
                    if (dataStr.includes(stayAliveDelimiter)) {
                        console.log('Received stay alive signal from Python script');
                        ws.send(JSON.stringify({ type: 'stay_alive' }));
                    }
                    else if (dataStr.includes(loggingDelimiter)) {
                        console.log('Printout from Python:', dataStr);
                        // ws.send(JSON.stringify({ type: 'stay_alive' }));

                    }
                    else {
                        response += dataStr;
                        let startIndex = response.indexOf(answerStartDelimiter);
                        let endIndex = response.indexOf(answerEndDelimiter, startIndex);
                        const cleanedText = extractStrings(response);
                        while (startIndex !== -1 && endIndex !== -1) {
                            const result = response.substring(startIndex + answerStartDelimiter.length, endIndex);
                            ws.send(JSON.stringify({ type: 'result', clean_text: result, cleanedText: cleanedText }));
                            response = response.slice(endIndex + answerEndDelimiter.length);
                            startIndex = response.indexOf(answerStartDelimiter);
                            endIndex = response.indexOf(answerEndDelimiter, startIndex);
                        }
                    }
                });

                pyProg.stderr.on('data', (data) => {
                    console.error(`Error from Python script: ${data}`);
                });

                pyProg.on('close', (code) => {
                    console.log(`Python script exited with code ${code}`);
                });
            } else {
                // Use LegalQA for Single AI case
                const legalQA = new LegalQA();
                try {
                    const response = await legalQA.getLegalAnswer(data);
                    console.log(response)
                    ws.send(JSON.stringify({ type: 'result', clean_text: response.clean_text, cleanedText: response.cleanedText }));
                } catch (error) {
                    console.error(`Error from LegalQA: ${error}`);
                    res.status(500).send({ message: error.message });
                }
            }
        }
    } catch (error) {
        console.error(error);
        res.status(500).send(error || 'Something went wrong');
    }
});

// Upgrade the HTTP server to handle WebSocket connections
app.listen(PORT, () => {
    console.log(`AI server started on http://localhost:${PORT}`);
}).on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
    });
});
