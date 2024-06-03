## Project Summary

### Overview
- **Languages**: JavaScript, Python
- **Frameworks**: Node.js, Express
- **Main Libraries**: Bull, dotenv, ejs, WebSocket, MongoDB, Redis

### Purpose
BibleBuddy is an AI-powered chatbot that answers Bible-related questions using the OpenAI ChatGPT API. The project allows users to interact with the chatbot in a messenger-style interface, search the Bible for context, and select from multiple Bible versions.


### Relevant Files for Configuration and Building
1. **/Aptfile**: `/Aptfile`
2. **/Procfile**: `/Procfile`
3. **/runtime.txt**: `/runtime.txt`
4. **/package.json**: `/package.json`
5. **/index.js**: `/index.js`
6. **/index backup.js**: `/index backup.js`
7. **/app.json**: `/app.json`
8. **/example env**: `/example env`

### Source Files
- **Source Files Directory**: `/`
- **Source Files**:
    - `index.js`
    - `index backup.js`
    - `queryandrequest.py`
    - `QdrantDBCreation.ipynb`
    - `ChatVectorDBChain.ipynb`
    - `qdranttesting.ipynb`

### Documentation Files
- **Documentation Files Directory**: `/`
- **Documentation Files**:
    - `README.md`
    - `LICENSE`

This project utilizes Node.js and Express for the backend, with additional libraries like Bull for queue processing, WebSocket for real-time communication, and MongoDB/Redis for data storage. The chatbot interacts with the OpenAI API for answering questions and requires a Qdrant cluster for setup. The project is open-source under the MIT License and welcomes contributions for enhancements like caching, adding more Bibles, and improving existing features.