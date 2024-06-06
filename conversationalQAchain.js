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

const questionGenerationModel = new ChatOpenAI({
temperature: 0,
modelName: 'gpt-3.5-turbo',
openAIApiKey: process.env.OPENAI_API_KEY,
});



class BibleBuddyQA {
    constructor() {
        this.model = new ChatOpenAI({
            openAIApiKey: process.env.OPENAI_API_KEY,
        });

        this.qa_template = `Act like a friendly study assistant named BibleBuddy. Your job is to help answer the question based on the following rules: Provide a complete response with sufficient explanation and bulleted points if necessary. 
        If you don't know the answer, politely say "An answer on that cannot be found in the Bible context provided. Can you refraise the question?"! 
        If the answer is in the christian bible but not in the context provided please answer using that known scripture.
        You have some flexibility to answer the question if it can be found in the bible, just ensure not to be denomination bias or opinionated in your response.
        ALWAYS return a scripture "SOURCES" part in your answer. The scripture "sources" part should be a reference to the verse/verses of the document from which you got your answer.
        Return Response in English.
        
        Then end of your response format should be:
        
        sources: xyz
        
        
        
        Begin!
        ----------------
        {context}
        {question}`;

        this.condense_question_template_text = `Return text English.
            Provide known scripture versus that might help answer the Follow Up question.
            If the Follow up question needs to be rephrased to be more biblical, please refraise it.
            Sometimes a user may ask a vague question, its your job to make that question relatable to bible context.
            Provide known scripture versus that might help answer the question.
            
            Provide your response in the following format:
            [rephrased questions]
            [related bible verse]
            
            Begin!
            ----------------
            Chat History: {chat_history}
            Follow Up question: {question}
            Standalone question:`;

        this.condense_question_prompt = PromptTemplate.fromTemplate(this.condense_question_template_text)
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
                temperature: 0.2,
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
                questionGeneratorTemplate:this.condense_question_template_text,
                rephrase_question: true,
                questionGeneratorChainOptions: {
                    llm: questionGenerationModel,
                },

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

        const res = await chain.invoke({ question, chat_history: chatHistory});

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