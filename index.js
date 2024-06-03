const express = require('express');
const path = require('path');
const Queue = require('bull');
const redis = require('redis');
const WebSocket = require('ws'); // Import WebSocket library
const http = require('http');
const BibleBuddyQA = require('./conversationalQAchain.js');
require('dotenv').config();

const isHeroku = process.env.NODE_ENV === 'production' && process.env.DYNO;
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const isProduction = process.env.NODE_ENV === 'production';

const app = express();
const PORT = process.env.PORT || 6001;
const bannedIPs = new Set([
    // Add banned IPs as strings
    '123.45.67.89',
    '98.76.54.32',
    '90.39.50.191',
    '83.233.221.192',
]);

const { MongoClient, ServerApiVersion } = require('mongodb');

// Add your MongoDB connection string here
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

async function storeResult(userIP, prompt, result) {
    try {
        await client.connect();
        const collection = client.db("querys").collection("records");
        const entry = {
            userIP,
            prompt,
            result,
            timestamp: new Date()
        };
        await collection.insertOne(entry);
        console.log("Stored result in MongoDB");
    } catch (err) {
        console.error("Error storing result in MongoDB:", err);
    } finally {
        await client.close();
    }
}

app.use(express.static(path.join(__dirname, 'public'), {
    setHeaders: function (res, path) {
        if (path.endsWith('.js')) {
            res.set('Content-Type', 'text/javascript');
        }
    }
}));

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.get('/', (req, res) => res.render('pages/index'));

app.get('/page/privacy', (req, res) => {
    res.render('pages/privacy');
});

app.use(express.json());

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

async function openaiWorker(job, ws) {
    const data = job.data;

    const bibleQA = new BibleBuddyQA();
    try {
        const response = await bibleQA.getAnswer(data);
        const clean_text = response.clean_text;
        const cleanedText = response.cleanedText;

        ws.send(JSON.stringify({ type: 'result', clean_text, cleanedText }));
        storeResult(ws.ip, data.prompt, clean_text);
        return { clean_text, cleanedText };
    } catch (error) {
        console.error(`Error from BibleBuddyQA: ${error}`);
        ws.send(JSON.stringify({ type: 'error', message: error.message }));
    }
}

let queue;
let ws;
if (isProduction) {
    const redisClient = redis.createClient(REDIS_URL);
    queue = new Queue('openai', REDIS_URL, { redis: { client: redisClient } });

    queue.process(async (job) => {
        console.log(`Processing job ${job.id}`);
        const result = await openaiWorker(job, ws);
        console.log(`Job ${job.id} completed with result ${result}`);
        return result;
    });
}

const httpServer = http.createServer();
const wss = new WebSocket.Server({ noServer: true, debug: true });
const clients = new Set();

httpServer.on('upgrade', (request, socket, head) => {
    const { protocol, host } = new URL(`http://${request.headers.host}${request.url}`);
    if (protocol === 'http:' || protocol === 'https:') {
        wss.handleUpgrade(request, socket, head, (_ws) => {
            ws = _ws;
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
        try {
            const data = JSON.parse(message).data;
            const input = data.prompt;
            const selectedOption1 = data.selectedOption1;
            const selectedOption2 = data.selectedOption2;
            const selectedOption3 = data.selectedOption3;
            const last_response = data.last_response;
            const last_prompt = data.last_prompt;

            const requestData = {
                prompt: input,
                selectedOption1,
                selectedOption2,
                selectedOption3,
                last_response,
                last_prompt
            };

            if (isProduction) {
                queue.add(requestData)
                    .then((job) => {
                        console.log(`Job ${job.id} added to queue`);
                        return job.finished(null, ws);
                    })
                    .then((response) => {
                        const { clean_text, cleanedText } = response;
                        ws.send(JSON.stringify({ type: 'result', clean_text, cleanedText }));
                    });
            } else {
                const bibleQA = new BibleBuddyQA();
                try {
                    const response = await bibleQA.getAnswer(requestData);
                    ws.send(JSON.stringify({ type: 'result', clean_text: response.clean_text, cleanedText: response.cleanedText }));
                } catch (error) {
                    console.error(`Error from BibleBuddyQA: ${error}`);
                    ws.send(JSON.stringify({ type: 'error', message: error.message }));
                }
            }
        } catch (error) {
            console.error(error);
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
        const last_response = req.body.last_response;
        const last_prompt = req.body.last_prompt;

        const data = {
            prompt: input,
            selectedOption1,
            selectedOption2,
            selectedOption3,
            last_response,
            last_prompt
        };

        if (isProduction) {
            const job = await queue.add(data);
            console.log(`Job ${job.id} added to queue`);
            const response = await job.finished(null, ws);
            const { clean_text, cleanedText } = response;
            res.status(200).send({
                bot: clean_text,
                source_documents: cleanedText
            });
        } else {
            const bibleQA = new BibleBuddyQA();
            try {
                const response = await bibleQA.getAnswer(data);
                res.status(200).send({
                    bot: response.clean_text,
                    source_documents: response.cleanedText
                });
            } catch (error) {
                console.error(`Error from BibleBuddyQA: ${error}`);
                res.status(500).send({ message: error.message });
            }
        }
    } catch (error) {
        console.error(error);
        res.status(500).send(error || 'Something went wrong');
    }
});

app.listen(PORT, () => {
    console.log(`AI server started on http://localhost:${PORT}`);
}).on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
    });
});
