const { ChatOpenAI, OpenAIEmbeddings } = require("@langchain/openai");
const { ConversationalRetrievalQAChain } = require("langchain/chains");
const { QdrantVectorStore } = require("@langchain/qdrant");
const { PromptTemplate } = require("@langchain/core/prompts");

const dotenv = require('dotenv');
dotenv.config();

/* Define the maxTokens constant */
const maxTokens = 3000;

/* Clean text function */
function cleanText(text, maxTokens) {
    if (text) {
        text = text.replace(/\s+/g, ' ');  // Replace multiple whitespace with a single space
        text = text.replace(/[^\x20-\x7E]/g, '');  // Remove non-ASCII characters
        text = text.trim();  // Remove leading and trailing whitespace
        text = text.replace(/�/g, ' ');  // Replace � with a space

        text = truncateText(text, maxTokens);
    }
    return text;
}

function truncateText(text, maxTokens) {
    const maxLength = maxTokens * 4;  // Assuming average token length is 4 characters
    if (text.length > maxLength) {
        return text.slice(0, maxLength) + '...';
    }
    return text;
}

class BibleBuddyQA {
    constructor() {
        this.model = new ChatOpenAI({
            openAIApiKey: process.env.OPENAI_API_KEY,
        });

        this.qa_template = `Use the following pieces of context to try to answer the users question. Provide a complete response with sufficient explanation and bulleted points. 
        If you don't know the answer, politely ask for clarification or a followup question! I repeat, only answer based on the context or to followup on a previous query. If the answer is in the christian bible but not in the context provided please answer using that known scripture.
        ALWAYS return a scripture "SOURCES" part in your answer. The scripture "sources" part should be a reference to the verse/verses of the document from which you got your answer.
        
        Example of your response format should be:
        
        The answer is foo

        sources: xyz
        
        Question: {question}
        
        Begin!
        ----------------
        Context:
        {context}`;
    }

    async initializeVectorStore(bible) {
        return await QdrantVectorStore.fromExistingCollection(
            new OpenAIEmbeddings(),
            {
                url: process.env.QDRANT_HOST,
                apiKey: process.env.QDRANT_API_KEY,
                collectionName: bible,
                contentPayloadKey: 'page_content'
            }
        );
    }

    async createChain(bible) {
        const vectorStore = await this.initializeVectorStore(bible);
        const retriever = vectorStore.asRetriever();

        return ConversationalRetrievalQAChain.fromLLM(
            new ChatOpenAI({
                openAIApiKey: process.env.OPENAI_API_KEY,
                temperature: 0,
                maxTokens: maxTokens,
                maxRetries: 6,
                requestTimeout: 60000
            }),
            retriever,
            {
                qaChainOptions: {
                    type: "stuff",
                    prompt: PromptTemplate.fromTemplate(this.qa_template),
                },
                returnSourceDocuments: true,
                // verbose: true,

            }
        );
    }

    async getAnswer(inputData) {
        const bible = inputData.selectedOption1;
        const modelSelection = inputData.selectedOption3;

        let modelName = "gpt-3.5-turbo";
        if (modelSelection === "Slow and quality Answers - GPT-4") {
            modelName = "gpt-4-turbo";
        }

        const chain = await this.createChain(bible);
        const question = cleanText(inputData.prompt, 1000);
        const lastResponse = cleanText(inputData.last_response, 1000);
        const lastPrompt = cleanText(inputData.last_prompt, 1000);

        const chatHistory = `${lastPrompt}\n${lastResponse}`;

        // const res = await chain.invoke({ question, chat_history: chatHistory });
        const res = await chain.invoke({ question, chat_history: chatHistory});
        // console.log("System Template:", this.systemTemplate);
        // console.log("Final Prompt:", this.prompt);

        // Ensure that cleanedText is always an array
        const cleanedText = res.sourceDocuments.map(doc => doc.pageContent || '');

        const result = {
            clean_text: res.text,
            cleanedText: cleanedText
        };

        return result;
    }
}

module.exports = BibleBuddyQA;